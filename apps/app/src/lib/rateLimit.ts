// In-memory, single-process rate limiter. Fine for Phase 1 (one app
// instance, low-stakes endpoint — a waitlist signup, not login or payment).
// NOT fine once the app scales past one instance or once Phase 2 adds
// account login: that needs a shared store (Redis, already provisioned in
// infra/docker-compose.*.yml) so limits hold across instances and survive a
// restart. Swap this for a Redis-backed version before then — grep this
// file's name to find every caller.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window limiter: `key` gets `limit` requests per `windowMs`.
 *
 * @param key - Usually `${routeName}:${clientIp}`.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count };
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
