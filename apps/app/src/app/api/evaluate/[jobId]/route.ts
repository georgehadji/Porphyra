import { reportRedisKey } from "@porphyra/ai";
import { aiJobs } from "@porphyra/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { getSession } from "@/lib/session";

// Poll endpoint for the async evaluation queue (see the producer route,
// ../route.ts, and docs/ARCHITECTURE_UPLIFT_PLAN.md §3.1). The client
// polls this after POSTing to /api/evaluate until status is "completed" or
// "failed". Ownership is checked in the WHERE clause itself, same pattern
// as every other resource route in this app — ✔ (see e.g.
// applications/[id]/route.ts) — so a job belonging to another user 404s
// instead of confirming its existence.

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const { jobId } = await params;
  const job = await db.query.aiJobs.findFirst({
    where: and(eq(aiJobs.id, jobId), eq(aiJobs.userId, session.user.id)),
  });
  if (!job) return NextResponse.json({ message: "Not found." }, { status: 404 });

  if (job.status === "queued" || job.status === "processing") {
    return NextResponse.json({ status: job.status });
  }

  if (job.status === "failed") {
    return NextResponse.json({ status: "failed", message: job.errorMessage });
  }

  // status === "completed" — the plaintext report lives in Redis for a
  // short TTL (packages/ai/src/queue.ts's REPORT_TTL_SECONDS), never in
  // Postgres. GETDEL reads and deletes atomically — this is the "one
  // consented request" invariant from the original synchronous design,
  // preserved as "one consented poll-and-collect": a second poll after a
  // successful collect (a client retry, a double-mounted effect) gets
  // `report: null, expired: true` rather than the plaintext a second time.
  const redis = getRedis();
  const reportJson = await redis.call("GETDEL", reportRedisKey(job.id));

  if (typeof reportJson !== "string") {
    return NextResponse.json({
      status: "completed",
      report: null,
      expired: true,
      message: "This report has already been collected or its collection window expired.",
    });
  }

  return NextResponse.json({ status: "completed", report: JSON.parse(reportJson) });
}
