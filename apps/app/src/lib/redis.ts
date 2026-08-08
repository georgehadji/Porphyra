import Redis from "ioredis";
import { logger } from "./logger";

// Lazy singleton, same reasoning as db.ts/auth.ts/stripe.ts — never
// construct at module scope, since Next imports every route module during
// `next build`. ioredis's constructor doesn't block on connecting either
// way, but the pattern stays consistent across every external client in
// this codebase rather than being "the one exception."
const globalForRedis = globalThis as unknown as { porphyraRedis?: Redis };

export function getRedis(): Redis {
  if (globalForRedis.porphyraRedis) return globalForRedis.porphyraRedis;

  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new Redis(url, {
    // Rate limiting is best-effort infrastructure, not the primary
    // security boundary (quotas and Better Auth's own auth-route limiting
    // are) — don't let a flaky Redis connection spend minutes retrying
    // inside a request. maxRetriesPerRequest caps that; lazyConnect avoids
    // opening a socket at construction time (same build-time-import safety
    // as every other lazy client here).
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null, // no auto-reconnect storm; callers fail open per-request instead
  });
  client.on("error", (err) => {
    logger.error({ err: err.message }, "Redis connection error (rate limiting fails open)");
  });

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.porphyraRedis = client;
  }
  return client;
}
