// Redis-backed rate limiter — replaces the Phase 1 in-memory version now
// that the app has more than one rate-limited endpoint and a real login
// surface (the trigger conditions that version's own comment named for
// reconsidering it). Fixed-window INCR+EXPIRE: the first request in a
// window creates the key with a TTL, every subsequent request in that
// window just increments it — two round trips, but rate limiting doesn't
// need to be faster than that, and it avoids a Lua script for a fixed-
// window counter (a sliding-window log would need one; this doesn't).
//
// Fails OPEN on Redis errors — logged, not silently swallowed, but a
// flaky rate-limit store must never take the whole app down with it. This
// is infrastructure defense-in-depth, not the primary security boundary
// (per-account quotas and Better Auth's own auth-route rate limiting are).

import { logger } from "./logger";
import { getRedis } from "./redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * `key` gets `limit` requests per `windowMs`.
 *
 * @param key - Usually `${routeName}:${clientIp}` or `${routeName}:${userId}`.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (error) {
    logger.error({ key, err: error }, "Rate limit check failed — failing open");
    return { allowed: true, remaining: limit };
  }
}

/** Best-effort client IP from standard proxy headers (Caddy sets
 * X-Forwarded-For — see infra/caddy/Caddyfile). Never trust this for
 * anything security-critical beyond rate limiting; it's spoofable by
 * whoever controls the request before it reaches the proxy. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
