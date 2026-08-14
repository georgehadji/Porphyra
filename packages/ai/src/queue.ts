// Shared queue definition for the consented AI evaluation path — the job
// payload schema, queue name, and Redis connection factory live here (not
// in apps/app or apps/worker individually) specifically so the producer
// (apps/app's /api/evaluate route) and the consumer (apps/worker) can
// never drift on what a job looks like. See
// docs/ARCHITECTURE_UPLIFT_PLAN.md §3.1 for why this exists: the old
// evaluate route called Anthropic synchronously inside one HTTP request,
// holding a Next.js server function open for up to
// DEFAULT_REQUEST_TIMEOUT_MS (providers.ts) with no backpressure. This
// decouples the AI call from the request/response cycle using BullMQ over
// the Redis instance already provisioned for rate limiting
// (infra/docker-compose.prod.yml) — no new infrastructure, just a second,
// differently-configured client against the same Redis.

import { targetProfileSchema } from "@porphyra/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";

export const EVALUATE_QUEUE_NAME = "porphyra:evaluate";

export const evaluateJobPayloadSchema = z.object({
  /** Primary key of the ai_jobs row this job updates — the durable status
   * record apps/app's poll endpoint reads. */
  aiJobId: z.string().uuid(),
  userId: z.string().min(1),
  model: z.string().min(1),
  cvPlaintext: z.string().min(1).max(50_000),
  jdPlaintext: z.string().min(1).max(50_000),
  jdUrl: z.string().url().optional(),
  targetProfile: targetProfileSchema,
  /** Whether tryReserveEvaluationSlot (packages/db/src/quota.ts) actually
   * reserved a slot for this job — false for pro users, who are never
   * gated. Tells the worker whether releaseEvaluationSlot needs to run if
   * the AI call fails; a failed call must never burn quota, but there's
   * nothing to release for a tier that was never charged against it. */
  quotaReserved: z.boolean(),
});
export type EvaluateJobPayload = z.infer<typeof evaluateJobPayloadSchema>;

export interface EvaluateJobResult {
  reportJson: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * BullMQ requires `maxRetriesPerRequest: null` on connections it owns —
 * its blocking commands (BRPOPLPUSH etc.) would otherwise be cut off
 * mid-wait by ioredis's default retry ceiling. This is deliberately a
 * DIFFERENT client configuration from apps/app/src/lib/redis.ts's
 * rate-limiting client, which wants the opposite (fail fast, never block a
 * request) — same Redis instance, two purpose-built clients.
 */
export function createQueueRedisConnection(): IORedis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/** Short-TTL key holding one evaluation's plaintext report, written once by
 * the worker on success and read exactly once by the client's poll
 * endpoint (apps/app's GET /api/evaluate/[jobId]) — deleted on read. This
 * preserves the "plaintext exists server-side only for one consented
 * request" invariant from the original synchronous design; it's now one
 * consented poll-and-fetch cycle instead of one HTTP request, same
 * guarantee, because the report is never written to Postgres or disk and
 * is unreadable a second time. */
export function reportRedisKey(aiJobId: string): string {
  return `evaluate:report:${aiJobId}`;
}

/** How long a completed report waits in Redis for the client to collect it
 * before it's gone for good — generous enough for a client with a flaky
 * connection to retry its poll, short enough that an abandoned job doesn't
 * leave plaintext sitting in memory indefinitely. */
export const REPORT_TTL_SECONDS = 10 * 60;

// Lazy singleton, same discipline as every other external client in this
// codebase (apps/app/src/lib/db.ts, stripe.ts, redis.ts) — never construct
// at module scope, since Next.js imports every route module during
// `next build` to collect its exported HTTP methods.
let cachedQueue: Queue<EvaluateJobPayload> | null = null;

/** Producer-side handle — apps/app's /api/evaluate route calls
 * `.add()` on this to enqueue a job. apps/worker does NOT use this; it
 * constructs its own `Worker` directly against `createQueueRedisConnection()`
 * (a `Worker` is a long-running consumer, not a producer handle, so it
 * doesn't belong behind this cache). */
export function evaluateQueue(): Queue<EvaluateJobPayload> {
  if (cachedQueue) return cachedQueue;
  cachedQueue = new Queue<EvaluateJobPayload>(EVALUATE_QUEUE_NAME, {
    connection: createQueueRedisConnection(),
  });
  return cachedQueue;
}
