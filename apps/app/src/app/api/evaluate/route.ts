import { currentModel, EVALUATE_QUEUE_NAME, evaluateQueue } from "@porphyra/ai";
import { targetProfileSchema } from "@porphyra/core";
import { aiJobs } from "@porphyra/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { tryReserveEvaluationSlot } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rateLimit";
import { getSession } from "@/lib/session";

// Per-user burst limit, separate from and tighter than the monthly quota —
// the quota caps total spend, this caps how FAST that spend can happen.
// tryReserveEvaluationSlot (see lib/quota.ts) is atomic against concurrent
// requests on its own, so this is defense-in-depth against burst load, not
// a race workaround.
const EVALUATE_RATE_LIMIT = 5;
const EVALUATE_RATE_WINDOW_MS = 60_000;

// The consented AI evaluation path — see the plan's Encryption design
// section. The client decrypts the CV and JD BEFORE this request and sends
// plaintext for this one call only; this route never writes that plaintext
// to disk or to any log (Next's default access log doesn't capture request
// bodies, and nothing here calls console.log on the input — keep it that
// way if you touch this file), and it never even holds the plaintext
// itself — it's forwarded straight into the BullMQ job payload, which
// Redis stores until apps/worker picks it up and discards. The worker
// re-derives the plaintext report exactly once for the client to collect
// (see the sibling [jobId]/route.ts); this route only enqueues and returns.
//
// PRODUCER ONLY (docs/ARCHITECTURE_UPLIFT_PLAN.md §3.1) — this route used
// to call Anthropic synchronously and hold the request open for the full
// round trip. It now validates, reserves quota, enqueues a job, and
// returns 202 immediately; apps/worker does the actual AI call, and the
// client polls GET /api/evaluate/[jobId] for the result. This is what
// removes the AI orchestration bottleneck the architecture audit flagged:
// no request here waits on Anthropic, so load on this endpoint no longer
// scales with Anthropic's latency.

const evaluateSchema = z.object({
  cvPlaintext: z.string().min(1).max(50_000),
  jdPlaintext: z.string().min(1).max(50_000),
  jdUrl: z.string().url().optional(),
  targetProfile: targetProfileSchema,
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const { allowed: withinRateLimit } = await checkRateLimit(
    `evaluate:${session.user.id}`,
    EVALUATE_RATE_LIMIT,
    EVALUATE_RATE_WINDOW_MS,
  );
  if (!withinRateLimit) {
    return NextResponse.json(
      { message: "Too many evaluations in a short time — wait a minute and try again." },
      { status: 429 },
    );
  }

  const parsed = evaluateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid evaluation request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Reserves the slot BEFORE enqueueing — atomically, so a concurrent
  // request from the same user can't slip past the same quota window (see
  // lib/quota.ts). If the worker's AI call fails, it releases this
  // reservation itself; a failed call must never burn quota.
  const quota = await tryReserveEvaluationSlot(session.user.id);
  if (!quota.allowed) {
    await track(session.user.id, "evaluation_quota_exceeded", { limit: quota.limit ?? 0 });
    return NextResponse.json(
      {
        message: `You've used all ${quota.limit} free evaluations this month. Upgrade for unlimited.`,
        quota,
      },
      { status: 402 },
    );
  }

  const model = currentModel();
  const [job] = await db
    .insert(aiJobs)
    .values({ userId: session.user.id, status: "queued", provider: "anthropic", model })
    .returning({ id: aiJobs.id });
  if (!job) {
    return NextResponse.json({ message: "Couldn't start the evaluation." }, { status: 500 });
  }

  await evaluateQueue().add(
    EVALUATE_QUEUE_NAME,
    {
      aiJobId: job.id,
      userId: session.user.id,
      model,
      quotaReserved: quota.limit !== null,
      ...parsed.data,
    },
    {
      jobId: job.id, // BullMQ dedupes on jobId — a client retry with the same ai_jobs row never double-enqueues
      attempts: 2,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 3600 }, // job metadata only, never the plaintext — that lives in Redis under its own short TTL
      removeOnFail: { age: 86_400 },
    },
  );

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
