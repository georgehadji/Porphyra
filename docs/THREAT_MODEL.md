# Threat model

STRIDE-style, scoped to what actually exists in this codebase — not a generic checklist.
Written for whoever does the pre-launch security review; update it when the architecture
changes, not just when someone remembers to.

## Assets, ranked by what a breach would actually cost

1. **Vault content** (CV, evaluation reports, cover letters, interview notes, contacts, JD
   text) — the reason the E2EE architecture exists at all. A server-side breach that only
   yields `vault_items.ciphertext` should be a non-event for users; that's the design goal,
   not a hope.
2. **Auth credentials** (`account.password` — Better Auth's hash of the derived verifier,
   `user_keys.wrappedDekCiphertext`/`encSalt`) — compromise here doesn't leak vault content
   directly (see `/security` for why), but does let an attacker impersonate the account and,
   critically, brute-force the real password offline against the wrapped DEK if they also
   exfiltrate `user_keys`.
3. **Recovery mnemonics** — never stored, so this is really "did the reveal-once UI leak it
   somewhere" (browser history, a screenshot tool, a copy-paste to an unencrypted note) —
   outside this system's control once shown, which is exactly why the UI insists on written
   acknowledgement rather than a "copy to clipboard" convenience button.
4. **Billing data** — Stripe holds card details; this system only holds `stripeCustomerId`/
   `stripeSubscriptionId`. Low direct value to an attacker, but `subscriptions.tier` is a
   privilege-escalation target (see T1 below).
5. **Blind indexes** (`company_blind_index`, `role_blind_index`) — an HMAC output, not
   directly readable, but see T4.

## STRIDE

### Spoofing

- **S1 — Session hijack via stolen cookie.** Mitigated by `useSecureCookies` in production,
  HSTS at the Caddy layer, and short session lifetimes (Better Auth default). Residual risk:
  XSS (see T-adjacent below) could exfiltrate a session cookie even with `HttpOnly` — no,
  `HttpOnly` specifically prevents JS access; the residual risk is a compromised dependency
  with a supply-chain attack reading process memory, which CSP/cookie flags can't stop —
  covered by dependency scanning (OSV, `pnpm audit`) instead.
- **S2 — Auth-verifier replay.** The value Better Auth stores is deterministic from
  `(password, email)` — see `packages/crypto/src/kdf.ts`. If that stored hash is ever
  exfiltrated (DB breach) AND offline-cracked, the attacker has the SAME verifier a real
  login would send, and can authenticate. This is inherent to the design tradeoff (no
  pre-login round trip) — mitigated by Argon2id's cost, not eliminated. Documented, not
  hidden: this is why `AUTH_VERIFIER_PARAMS` matches `MASTER_KEY_PARAMS`'s full cost rather
  than a cheaper profile.
- **S3 — OAuth account takeover.** Mitigated by Better Auth's standard OAuth state/PKCE
  handling; not re-implemented here. Verify provider-side email verification is required
  before treating a Google/GitHub identity as authoritative (Better Auth default).

### Tampering

- **T1 — Subscription tier tampering.** The ONLY writer of `subscriptions.tier = "pro"` is
  the Stripe webhook handler, gated by signature verification
  (`stripe.webhooks.constructEvent`) — see `/api/billing/webhook`. `/api/billing/checkout`
  deliberately never writes `tier`. Residual risk: a compromised `STRIPE_WEBHOOK_SECRET`
  lets an attacker forge upgrade events directly — treat that secret with the same care as
  `BETTER_AUTH_SECRET`.
- **T2 — Application state machine bypass.** Enforced via `isValidTransition()` server-side
  in `/api/applications/[id]` — the client UI only ever *offers* legal transitions, but the
  API is what actually rejects illegal ones (409). Verified: a client bypassing the UI
  entirely and POSTing an illegal transition still hits the same check.
- **T3 — Webhook replay/duplication.** Stripe doesn't guarantee exactly-once delivery;
  `processed_stripe_events` (keyed on Stripe's event ID) makes a replay a no-op. Verified
  offline against `stripe.webhooks.generateTestHeaderString`.
- **T4 — Blind-index correlation attack.** An attacker with DB access can't reverse a blind
  index to learn a company name, but CAN test a guess: compute `HMAC(guessed_index_key,
  "google")` and compare against stored values — except they don't have the index key either
  (client-derived, never transmitted). Real residual risk: if the SAME company name is
  common across MANY users and an attacker somehow obtains one user's index key, they can
  confirm (not discover) whether that user tracks that company — a narrow, per-user leak, not
  a system-wide one.

### Repudiation

- **R1 — "I never authorized that evaluation."** `ai_jobs` records every evaluation attempt
  (queued/processing/completed/failed) with `userId`, timestamps, and cost — sufficient audit
  trail for billing disputes. `audit_log` exists in the schema for security-relevant actions
  (login, password change, key rotation, export) but is **not yet wired to any write path** —
  a real gap, not a design choice. Wire it before treating this as launch-ready.

### Information Disclosure

- **I1 — Vault content disclosure via server compromise.** The core design goal. A full DB
  dump yields ciphertext for CV/reports/notes and ONE-WAY blind indexes for company/role —
  see `/security` for the exact split. Verified via the crypto package's round-trip tests
  proving decryption fails closed on the wrong key.
- **I2 — Plaintext leakage during the consented AI evaluation.** `/api/evaluate` receives
  real plaintext for the duration of one request. Mitigated by: no request-body logging
  (verified by code review of that route — nothing calls `logger`/`console` on the input),
  no persistence of the request payload, Pino's structured logger only ever receiving IDs
  and error messages at every other call site in this codebase. NOT independently verified:
  whether the Anthropic API itself retains this data per its own data-usage policy — that's
  a vendor-trust question, documented on `/security`, not something this codebase controls.
- **I3 — Enumeration via error message differences.** Ownership checks on
  `/api/vault/items/[id]` and `/api/applications/[id]` return 404 for both "doesn't exist"
  and "belongs to someone else" — verified by code review, not by a live test (no DB access
  in the environment this was built in — flag for the pre-launch review to actually confirm
  with two real accounts).
- **I4 — Admin endpoint enumeration.** `/admin/analytics` and its API route 404 for
  non-admins rather than 403 — same reasoning as I3.

### Denial of Service

- **D1 — Evaluation endpoint cost exhaustion.** `/api/evaluate` has both a monthly quota
  (`usage_counters`) and a per-user burst limit (5/minute via the Redis rate limiter). Known
  gap: quota check-then-increment isn't transactionally atomic against concurrent requests —
  the rate limiter narrows this race to at most ~5 concurrent requests per user per minute,
  it doesn't eliminate it. Acceptable for launch; revisit if abuse is observed.
- **D2 — Rate limiter itself as a DoS vector.** The Redis-backed limiter fails OPEN on Redis
  errors (logged) rather than blocking all traffic if Redis is down — a deliberate
  availability-over-strictness tradeoff, since rate limiting here is defense-in-depth, not
  the primary boundary (per-account quotas and Better Auth's own auth rate limiting are).
- **D3 — Argon2id as a DoS vector.** Every login/signup runs a 64 MiB, t=3 Argon2id
  derivation client-side (not server load) for the auth verifier, and the Master Key
  derivation happens client-side too. Server-side cost is Better Auth's own (cheaper) hash of
  an already-derived value — the expensive part is deliberately pushed to the client, where
  an attacker attacking their own browser doesn't hurt anyone else.

### Elevation of Privilege

- **E1 — Non-admin reaching `/admin/analytics`.** Gated by the `admins` allowlist table,
  checked server-side on every request (`requireAdminSession`) — not a client-side-only
  check, not a JWT claim that could be stale. No self-service admin promotion path exists;
  granting admin is a manual DB insert, which is the right amount of friction for a
  single-tier privilege system with (currently) no admin UI to abuse.
- **E2 — Vault access without the DEK.** The server literally cannot decrypt vault content
  regardless of what session/role an attacker obtains — this is the strongest mitigation in
  the whole system, because it's structural, not access-control-based. Verified by the crypto
  package's tests.

## What's genuinely unverified (be honest with whoever reads this next)

Everything in this document reflects code review and static analysis. The following have
**not** been exercised against a live, real environment in this codebase's history so far:
an actual Claude API call, an actual Stripe checkout/webhook, and a live-database run of the
ownership-check claims (I3/I4). See the README's per-phase "Not live-verified" notes for the
full list. Confirm these before trusting this threat model's mitigations as proven rather
than designed.
