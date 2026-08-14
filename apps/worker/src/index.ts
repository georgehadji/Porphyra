import "dotenv/config";
import {
  createQueueRedisConnection,
  EVALUATE_QUEUE_NAME,
  type EvaluateJobPayload,
  estimateCostUsd,
  evaluateJobPayloadSchema,
  evaluateJobPosting,
  REPORT_TTL_SECONDS,
  reportRedisKey,
} from "@porphyra/ai";
import { aiJobs, recordEvaluationCost, releaseEvaluationSlot } from "@porphyra/db";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { track } from "./analytics";
import { db } from "./db";
import { logger } from "./logger";

// The AI job consumer — see docs/ARCHITECTURE_UPLIFT_PLAN.md §3.1 and the
// producer route's own comment (apps/app/src/app/api/evaluate/route.ts).
// This is the ONLY place `evaluateJobPosting` (packages/ai) is called in
// production; the old synchronous route called it inline and held a
// Next.js request open for the duration.

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

// Two separate Redis connections, deliberately: `workerConnection` is
// handed to BullMQ's Worker, which takes ownership of it for blocking
// commands; `reportRedis` is this file's own client for the plain
// SET/report-storage command below. ioredis clients multiplex commands
// over one connection safely in principle, but keeping BullMQ's
// connection untouched by other command traffic avoids any chance of
// interaction with its internal blocking-command bookkeeping.
const workerConnection = createQueueRedisConnection();
const reportRedis = createQueueRedisConnection();

async function processEvaluateJob(payload: EvaluateJobPayload): Promise<void> {
  logger.info({ aiJobId: payload.aiJobId, userId: payload.userId }, "evaluation job started");

  await db.update(aiJobs).set({ status: "processing" }).where(eq(aiJobs.id, payload.aiJobId));

  try {
    // Built explicitly rather than passing `payload` straight through:
    // under exactOptionalPropertyTypes (tsconfig.base.json), zod's
    // `.optional()` infers `jdUrl?: string | undefined` on
    // EvaluateJobPayload, which isn't assignable to EvaluateInput's plain
    // `jdUrl?: string` — omitting the key entirely when absent (rather
    // than ever assigning `jdUrl: undefined`) satisfies both.
    const result = await evaluateJobPosting({
      cvPlaintext: payload.cvPlaintext,
      jdPlaintext: payload.jdPlaintext,
      targetProfile: payload.targetProfile,
      ...(payload.jdUrl ? { jdUrl: payload.jdUrl } : {}),
    });
    const costUsd = estimateCostUsd(payload.model, result.inputTokens, result.outputTokens);

    // Written BEFORE the ai_jobs row flips to "completed" — the client's
    // poll endpoint (apps/app's GET /api/evaluate/[jobId]) only looks in
    // Redis once it observes status === "completed", so this ordering is
    // what guarantees "completed" always means "the report is actually
    // there to collect," never a race window where the status update wins
    // but the report write hasn't landed yet.
    await reportRedis.set(
      reportRedisKey(payload.aiJobId),
      JSON.stringify(result.report),
      "EX",
      REPORT_TTL_SECONDS,
    );

    await db
      .update(aiJobs)
      .set({
        status: "completed",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: costUsd.toFixed(6),
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, payload.aiJobId));

    await recordEvaluationCost(db, payload.userId, costUsd);
    await track(payload.userId, "evaluation_completed", {
      score: result.report.score,
      legitimacyTier: result.report.legitimacyTier,
    });

    logger.info({ aiJobId: payload.aiJobId }, "evaluation job completed");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ aiJobId: payload.aiJobId, err: errorMessage }, "evaluation job failed");

    await db
      .update(aiJobs)
      .set({ status: "failed", errorMessage, completedAt: new Date() })
      .where(eq(aiJobs.id, payload.aiJobId));

    // A failed call must never burn the user's quota — undoes the
    // reservation apps/app's producer route made before enqueueing. A
    // no-op for pro users (nothing was reserved for them in the first
    // place; see releaseEvaluationSlot's own comment).
    if (payload.quotaReserved) {
      await releaseEvaluationSlot(db, payload.userId);
    }

    await track(payload.userId, "evaluation_failed", { reason: errorMessage.slice(0, 200) });

    // Rethrow so BullMQ records this attempt as failed (drives its own
    // retry/backoff and dead-letter bookkeeping) — the ai_jobs row above
    // is this app's own durable status record, independent of BullMQ's.
    throw error;
  }
}

const worker = new Worker<EvaluateJobPayload>(
  EVALUATE_QUEUE_NAME,
  async (job) => {
    const payload = evaluateJobPayloadSchema.parse(job.data);
    await processEvaluateJob(payload);
  },
  { connection: workerConnection, concurrency: CONCURRENCY },
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message }, "job failed permanently");
});

worker.on("error", (error) => {
  logger.error({ err: error.message }, "worker connection error");
});

logger.info({ concurrency: CONCURRENCY }, "evaluate worker started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await worker.close();
  await workerConnection.quit();
  await reportRedis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
