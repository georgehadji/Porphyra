# Architecture Uplift Plan — Porphyra

**From:** 8/10 (ARCH-AUDIT-V2, commit `dc342d3`) · **Target:** ≥9.5/10
**Scope:** every workstream below closes a specific finding from the prior audit. Nothing here is speculative hardening — each item traces to a cited gap.

---

## 1. Why 8, not 9.5 — the four point-losses

The rubric caps a score below 9 on "moderate drift, 1–2 high-severity violations, scalability concerns," and below 10 on any drift at all. Four things are holding this back:

| Loss | Cause | Rubric dimension hit |
|---|---|---|
| ~1.0 pt | No async job queue behind `/api/evaluate` — `ai_jobs.status` has `queued`/`processing` states nothing ever consumes asynchronously (`apps/app/src/app/api/evaluate/route.ts:74-118`) | Scalability |
| ~0.3 pt | Quota check-then-increment is two round trips, not atomic (`apps/app/src/lib/quota.ts:21-64`, self-flagged in `evaluate/route.ts:13-19`) | Correctness under concurrency |
| ~0.2 pt | `audit_log` table exists, nothing writes to it (`packages/db/src/schema.ts:330-338`) | Observability / security |
| ~0.2 pt | Zero live-fire verification of Anthropic, Stripe, or Postgres-under-load — every integration is typecheck-verified only | Testability / production-readiness |

Closing all four, plus the type-safety and resilience upgrades in §3–§5, is what gets this past 9.5. The plan is organized so each closes independently — none blocks another.

---

## 2. Sequencing

**P0 — blocks the score ceiling, do first (queue + atomicity + audit trail).**
**P1 — closes remaining drift (type safety, resilience, live verification).**
**P2 — polish that separates 9.5 from 10 (contract/mutation testing, observability, RLS).**

Each item below states: the pattern/paradigm used, why it's the right one for that module, the files touched, and the audit finding it closes.

---

## 3. P0 — Structural fixes

### 3.1 Async AI job queue (closes: no-queue, HIGH)

**Pattern: Producer/Consumer with a durable queue, not a new service tier.** Redis is already provisioned (`infra/docker-compose.prod.yml`); use it. Reach for **BullMQ** — it's the standard choice on Redis, gives retries/backoff/dead-letter for free, and needs zero new infrastructure.

**Why this shape, not alternatives:** a pg-boss (Postgres-native queue) would avoid the BullMQ dependency but adds write load to the same Postgres instance serving the app's transactional queries — Redis is already the right tool sitting idle outside rate-limiting. A separate message broker (RabbitMQ/SQS) is over-provisioned for this scale.

**Design — preserves the E2EE model, only decouples the AI call:**

1. New package `apps/worker` (Node script, own Dockerfile, own `docker-compose.prod.yml` service). Its only job: pop a job off the `evaluate` queue, call `evaluateJobPosting()`, write the **plaintext report** into a short-TTL Redis key (never Postgres, never disk) keyed by job ID, update `ai_jobs.status`.
2. `POST /api/evaluate` becomes producer-only: validate → check quota → enqueue → `ai_jobs` row `status: "queued"` → return `202 { jobId }` immediately. No more holding a Next.js request open for the Anthropic round trip.
3. New `GET /api/evaluate/:jobId` — the client polls (or a lightweight SSE stream) until `status: "completed"`, then fetches the plaintext report **once**, from the same short-TTL Redis key, which is deleted on read (single-consumption, matches the "plaintext exists server-side only during one consented request" invariant — it's now one consented *poll cycle* instead of one HTTP request, same guarantee).
4. Client-side encryption flow in `apps/app/src/app/evaluate/page.tsx` is otherwise unchanged — it still decrypts the CV, still re-encrypts the report client-side before persisting to `vault_items`.

**Files:**
- New: `apps/worker/src/index.ts`, `apps/worker/package.json`, `apps/worker/Dockerfile`
- Modify: `apps/app/src/app/api/evaluate/route.ts` (producer-only), new `apps/app/src/app/api/evaluate/[jobId]/route.ts` (poll endpoint)
- New shared: `packages/ai/src/queue.ts` — job payload schema (Zod), queue name constant, shared by producer and worker so they can't drift
- `infra/docker-compose.prod.yml`: add `worker` service (same image as `app`, different entrypoint/command)

**Failure semantics:** BullMQ's built-in exponential-backoff retry (2 attempts, since the underlying call is already validated and non-idempotent side effects only happen after success) + dead-letter queue for jobs that exhaust retries, surfaced in `/admin/analytics`.

### 3.2 Atomic quota enforcement (closes: quota race, MEDIUM)

**Pattern: single atomic `UPDATE ... WHERE ... RETURNING`, not check-then-write.** Replace the two-query read-then-conditionally-write in `apps/app/src/lib/quota.ts` with one round trip using Postgres's own concurrency control instead of application-level coordination — the correct tool for "increment a counter only if it's below a limit" is a single conditional UPDATE, not a transaction wrapper (which would still need the same WHERE-guarded UPDATE underneath, so skip the extra ceremony).

```sql
-- one statement, race-free regardless of concurrent callers
INSERT INTO usage_counters (user_id, period_start, evaluations_used, ai_cost_usd)
VALUES ($1, $2, 1, $3)
ON CONFLICT (user_id, period_start)
DO UPDATE SET evaluations_used = usage_counters.evaluations_used + 1,
              ai_cost_usd = usage_counters.ai_cost_usd + $3
WHERE usage_counters.evaluations_used < $4
RETURNING evaluations_used;
```

If `RETURNING` yields no row, the increment was rejected by the `WHERE` clause (quota already hit) — `checkEvaluationQuota` and `recordEvaluationUsage` collapse into one `tryConsumeEvaluationQuota(userId, limit, costUsd)` call, invoked once the queue confirms a job actually ran (§3.1's worker calls it on success, not the producer route).

**Files:** `apps/app/src/lib/quota.ts` (rewrite), `apps/worker/src/index.ts` (new call site)

### 3.3 Trigger-based audit log (closes: audit_log unpopulated, MEDIUM)

**Pattern: database trigger, not an application-layer call site.** The current gap exists specifically *because* the mechanism was "remember to call `track()`-equivalent for security events" — a convention, not an invariant. The fix should not be "add more call sites that can be forgotten again"; it should make forgetting structurally impossible.

Add Postgres `AFTER INSERT/UPDATE/DELETE` triggers on the security-relevant tables (`session`, `two_factor`, `user_keys`, `applications.state` transitions) that write into `audit_log` directly, driven by a `SECURITY DEFINER` function reading `current_setting('app.current_user_id')` (set per-request via `SET LOCAL` at the top of the Drizzle transaction in `apps/app/src/lib/db.ts`). This also closes part of §6.1 (RLS) — the session variable both triggers use.

**Files:** new `packages/db/migrations/000X_audit_triggers.sql`, `apps/app/src/lib/db.ts` (set `app.current_user_id` per request via a Drizzle middleware/wrapper)

---

## 4. P1 — Type safety and resilience

### 4.1 Nominal key types in `packages/crypto` (closes: a real latent gap, not previously scored — see below)

**Finding surfaced while planning this uplift:** every key in `packages/crypto` — Master Key, DEK, Recovery Key, Index Key — is typed as plain `CryptoKey`. Nothing at the type level stops a future call site from passing the *index key* into `aesEncryptText()` (silently produces garbage ciphertext no one can ever decrypt) or the *DEK* into `computeBlindIndex()` (works, but leaks a very different security property than intended). The whole point of key separation (documented in `keys.ts:36-44`) is undermined by every key being structurally interchangeable.

**Pattern: nominal typing via branded types** — the standard TypeScript technique for "same runtime shape, must not be substitutable."

```typescript
// packages/crypto/src/brands.ts
declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type MasterKey = Branded<CryptoKey, "MasterKey">;
export type DekKey = Branded<CryptoKey, "DekKey">;
export type IndexKey = Branded<CryptoKey, "IndexKey">;
export type RecoveryKey = Branded<CryptoKey, "RecoveryKey">;
```

`importAesKey`, `deriveIndexKey`, `bootstrapVault`, `unlockVault` all get their return types narrowed to the specific brand; `aesEncryptText`/`aesDecryptText` accept `MasterKey | DekKey | RecoveryKey` (a union excluding `IndexKey`, since that key is HMAC-only, never AES); `computeBlindIndex` accepts only `IndexKey`. Misuse becomes a compile error instead of a silent, hard-to-detect production bug.

**Files:** `packages/crypto/src/brands.ts` (new), `keys.ts`, `aes.ts`, `blindIndex.ts`, `bootstrap.ts`, `unlock.ts`, `VaultContext.tsx` — all signature-only changes, zero runtime behavior change.

### 4.2 Circuit breaker + bounded retry on the Anthropic call (closes: no failure-isolation strategy in the AI orchestrator review)

**Pattern: circuit breaker (state machine: closed → open → half-open), not naive retry-forever.** `evaluateJobPosting()` currently either succeeds or throws once, letting a bad Anthropic outage burn every user's full 300s timeout individually. Wrap the call in a circuit breaker so repeated failures fail fast (fast 503 instead of a 5-minute hang) after a threshold, with a cooldown before probing again.

```typescript
// packages/ai/src/circuitBreaker.ts — hand-rolled, ~40 lines; a library (opossum)
// is fine too but this has zero deps and the state machine is small enough
// to own directly given how security/reliability-sensitive this path is.
```

Pair with bounded retry (max 2 attempts, exponential backoff + jitter) **only** on transient errors (429, 5xx) — the call has no side effects until the worker persists a result, so retrying is safe.

**Files:** `packages/ai/src/circuitBreaker.ts` (new), `packages/ai/src/prompts/evaluate.ts` (wrap `client.messages.create`)

### 4.3 Formalize the provider abstraction (closes: premature-abstraction finding, LOW — resolve honestly rather than leave ambiguous)

**Pattern: Strategy interface, applied for real.** Either (a) implement `OpenAiProvider`/`GeminiProvider` behind an `AiProvider` interface so `PROVIDERS`' non-Anthropic entries stop being decorative, or (b) if no near-term multi-provider need exists, rename the non-Anthropic `RATES` entries into a clearly separate `PRICING_REFERENCE` table with a comment stating they're for cost comparison only, removing the implication of an unfinished abstraction. **Recommendation: (b) now, (a) only when a second provider is actually contracted** — building unused strategy implementations is exactly the overengineering the original audit correctly avoided flagging elsewhere; don't introduce it here for symmetry's sake.

**Files:** `packages/ai/src/providers.ts` (split `PROVIDERS` from `PRICING_REFERENCE`)

### 4.4 Live-fire verification (closes: all three "not live-verified" gaps)

Not a code change — a checklist, gated in CI where possible:
- **Anthropic:** one real call against a staging key, in CI, behind a secret that's absent on forks (skip gracefully, don't fail the build for contributors without a key) — assert the response parses against `evaluationReportSchema`. This becomes the seed fixture for §6.1's contract test.
- **Stripe:** Stripe CLI's `stripe trigger checkout.session.completed` against the local webhook in CI (already scaffolded per the codebase's own comment about testing signature verification offline — extend it to a real triggered event, not just signature math). Confirms `current_period_end`'s actual location on a real payload, resolving the Basil-API-version risk noted in `billing/webhook/route.ts:80-88` definitively instead of by SDK-type inspection.
- **Postgres under load:** a k6 or autocannon smoke test against a docker-compose-launched stack in CI, hitting `/api/applications` and `/admin/analytics` with realistic concurrency, catching the class of bug the `ANY(array)` SQL issue already was (README §Analytics) — that one was caught by `.toSQL()` inspection, which is good, but doesn't replace an actual query execution.

---

## 5. P2 — Depth that separates 9.5 from 10

### 5.1 Postgres Row-Level Security (defense-in-depth on top of the WHERE-clause discipline)

The ownership checks are already correct at the application layer (every query filters by `userId` in `WHERE`, verified in the prior audit). RLS makes that invariant hold **even if a future route forgets it** — the database itself refuses to return another user's row.

```sql
ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_items_owner ON vault_items
  USING (user_id = current_setting('app.current_user_id', true));
-- repeat for applications, ai_jobs, user_keys
```

Requires the same `SET LOCAL app.current_user_id` wrapper introduced in §3.3 — one piece of plumbing serves both the audit trigger and RLS. This is the highest-leverage single change in this plan relative to effort: it converts "every route happens to remember the check" (verified true today) into "the database enforces it structurally" (true by construction, forever).

**Files:** new migration, `apps/app/src/lib/db.ts`

### 5.2 Contract tests for external APIs (closes: testability gap named in the rubric)

**Pattern: recorded-fixture contract testing**, not live calls in every CI run (too slow, too flaky, needs live secrets). Record one real Anthropic response (from §4.4's live-fire run) and one real Stripe webhook payload as fixtures; replay them through `evaluationReportSchema.safeParse()` and the webhook handler in every CI run. This is what would have caught a hypothetical future Anthropic response-shape change *before* it reached a real user, without needing a live key on every PR.

**Files:** `packages/ai/src/__fixtures__/`, `apps/app/src/app/api/billing/webhook/__fixtures__/`

### 5.3 Mutation testing on the two safety-critical packages

**Pattern: mutation testing (Stryker)** on `packages/core` and `packages/crypto` specifically — these are the packages where "the tests pass" and "the tests actually verify the logic" can silently diverge, and where that gap matters most (a scoring bug or a crypto bug is a business-integrity or user-data-loss risk, not a cosmetic one). Run in CI as a non-blocking report initially, promote to a blocking mutation-score threshold (e.g. ≥80%) once the baseline is known.

### 5.4 OpenTelemetry tracing across the evaluate path

Once §3.1's queue exists, a single evaluation spans three processes (API route → Redis queue → worker). Add OpenTelemetry spans keyed by `ai_jobs.id` so a slow or failed evaluation is traceable end-to-end in the Grafana/Loki stack `infra/docker-compose.observability.yml` already provisions — currently that stack has "no app-exported metrics," per the prior audit; this is the concrete first export.

### 5.5 Dependency and SAST hardening

- Add **CodeQL** alongside the existing Semgrep `p/owasp-top-ten` config in `.github/workflows/ci.yml` — different rule engines catch different bug classes; redundancy is appropriate for a security-first product.
- Add a **DAST baseline scan** (OWASP ZAP) against the staging deploy, post-launch, in a scheduled (not per-PR) workflow.
- Exact-pin (`=`, not `^`) the crypto-relevant dependencies (`hash-wasm`, `@scure/bip39`) — everywhere else `^` is fine, but a silent minor-version change in the Argon2id or BIP39 implementation is exactly the kind of drift that shouldn't happen without a deliberate, reviewed bump.
- Enable Dependabot/Renovate with auto-merge for patch-level bumps on non-crypto deps, manual review required on crypto deps (enforce via CODEOWNERS on `packages/crypto/package.json`).

---

## 6. Definition of done — scorecard

| Item | Closes | Rubric dimension |
|---|---|---|
| §3.1 Queue | No-queue HIGH finding | Scalability |
| §3.2 Atomic quota | Concurrency race | Correctness |
| §3.3 Audit triggers | audit_log gap | Observability/security |
| §4.1 Branded key types | Latent crypto misuse risk | Safety (compile-time) |
| §4.2 Circuit breaker | No failure isolation | Resilience |
| §4.3 Provider clarity | Premature-abstraction ambiguity | Consistency |
| §4.4 Live-fire verification | 3× "not live-verified" gaps | Testability/production-readiness |
| §5.1 RLS | Defense-in-depth on ownership | Security (structural, not just conventional) |
| §5.2 Contract tests | API-shape drift risk | Testability |
| §5.3 Mutation testing | Test-suite-quality blind spot | Testability |
| §5.4 Tracing | No observability across the (new) multi-process evaluate path | Observability |
| §5.5 SAST/dependency hardening | Security posture depth | Security |

All P0+P1 items closed → no CRITICAL, no HIGH, no MEDIUM findings remain; the only residual "drift" is deliberate, documented scope deferral (CV tailoring/PDF, multi-provider AI) — which the rubric's own 8-point band explicitly tolerates ("minor drift... no critical violations"), but closing P2 as well removes even that ambiguity, which is what separates 9.5 from a clean 10.

**Estimated effort:** P0 ≈ 1 sprint (queue is the long pole — new service, new deploy topology). P1 ≈ 3–4 days. P2 ≈ 1 sprint, parallelizable across items since they don't depend on each other.
