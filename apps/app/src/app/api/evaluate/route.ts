import { targetProfileSchema } from "@porphyra/core";
import { estimateCostUsd, evaluateJobPosting } from "@porphyra/ai";
import { aiJobs } from "@porphyra/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { checkEvaluationQuota, recordEvaluationUsage } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rateLimit";
import { getSession } from "@/lib/session";

// Per-user burst limit, separate from and tighter than the monthly quota —
// the quota caps total spend, this caps how FAST that spend can happen.
// Without it, a script hammering this endpoint could fire many concurrent
// evaluations before checkEvaluationQuota's read-then-write has a chance
// to catch up (it isn't transactionally atomic against concurrent
// requests — a real gap, noted here rather than silently accepted).
const EVALUATE_RATE_LIMIT = 5;
const EVALUATE_RATE_WINDOW_MS = 60_000;

// The consented AI evaluation path — see the plan's Encryption design
// section. The client decrypts the CV and JD BEFORE this request and sends
// plaintext for this one call only; this route never writes that plaintext
// to disk or to any log (Next's default access log doesn't capture request
// bodies, and nothing here calls console.log on the input — keep it that
// way if you touch this file). The response report is also plaintext; the
// CLIENT re-encrypts it before persisting via POST /api/vault/items.

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

  const quota = await checkEvaluationQuota(session.user.id);
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

  const model = "claude-sonnet-5";
  const [job] = await db
    .insert(aiJobs)
    .values({ userId: session.user.id, status: "processing", provider: "anthropic", model })
    .returning({ id: aiJobs.id });
  if (!job) {
    return NextResponse.json({ message: "Couldn't start the evaluation." }, { status: 500 });
  }

  try {
    const result = await evaluateJobPosting(parsed.data);
    const costUsd = estimateCostUsd(model, result.inputTokens, result.outputTokens);

    await db
      .update(aiJobs)
      .set({
        status: "completed",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: costUsd.toFixed(6),
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));

    await recordEvaluationUsage(session.user.id, costUsd);
    await track(session.user.id, "evaluation_completed", {
      score: result.report.score,
      legitimacyTier: result.report.legitimacyTier,
    });

    return NextResponse.json({ report: result.report });
  } catch (error) {
    await db
      .update(aiJobs)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));

    return NextResponse.json(
      { message: "Evaluation failed — try again shortly." },
      { status: 502 },
    );
  }
}
