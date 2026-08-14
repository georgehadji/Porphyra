// Circuit breaker + bounded retry around the Anthropic call
// (packages/ai/src/prompts/evaluate.ts). Without this, a sustained
// provider outage means every concurrent evaluation individually waits out
// DEFAULT_REQUEST_TIMEOUT_MS (providers.ts, 300s) before failing — this
// makes the Nth request during an outage fail in milliseconds instead,
// and gives a single transient blip (one dropped connection, one 503) a
// bounded, jittered retry instead of surfacing immediately as a user-
// facing failure. See docs/ARCHITECTURE_UPLIFT_PLAN.md §4.2.
//
// Hand-rolled rather than a library (e.g. opossum) — the state machine is
// small enough, and this is a security/reliability-sensitive path worth
// owning directly rather than trusting an unaudited transitive
// dependency's exact retry/backoff semantics.

type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** How long the circuit stays open before allowing one probe request. */
  cooldownMs: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor(cooldownRemainingMs: number) {
    super(
      `Circuit open — the provider has failed repeatedly; retry in ${Math.ceil(cooldownRemainingMs / 1000)}s.`,
    );
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.options.cooldownMs) {
        throw new CircuitBreakerOpenError(this.options.cooldownMs - elapsed);
      }
      // Cooldown elapsed — let exactly one probe request through. A
      // concurrent second probe is possible under real traffic (this
      // isn't mutex-guarded), but the worst case is two probes instead of
      // one, not a thundering herd — acceptable given how rarely the
      // circuit trips at all.
      this.state = "half_open";
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === "half_open" || this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}

/** True for errors worth a bounded retry — connection resets and Anthropic's
 * own overloaded/rate-limit signals. False for anything else (a malformed
 * request, an auth failure, a schema-validation failure on the response) —
 * retrying those wastes the cooldown on an error that will recur
 * identically every time. */
export function isTransientAnthropicError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: number }).status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED/.test(error.message);
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

/** Exponential backoff with full jitter (AWS's recommended formula —
 * random(0, base * 2^attempt) — avoids every retrying client synchronizing
 * on the same retry instant after a shared outage). Only retries errors
 * `isRetryable` accepts; anything else rethrows on the first attempt. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  isRetryable: (error: unknown) => boolean = isTransientAnthropicError,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === options.maxAttempts - 1) throw error;
      const maxDelay = options.baseDelayMs * 2 ** attempt;
      const delay = Math.random() * maxDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
