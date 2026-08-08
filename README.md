# Porphyra

Score every job posting before you spend an evening tailoring a CV for it. Encrypted by
default. Built for job seekers everywhere, most of them remote.

**Status: Phases 0–6 complete — not yet launched.** Every planned phase is built: foundation,
marketing site, auth + the E2EE vault, the core evaluate → track pipeline, Stripe billing, the
analytics event pipeline, and hardening (CSP, Redis-backed rate limiting, structured logging,
backup/restore scripts, a threat model, a launch runbook). The auth/vault flow has been driven
end to end through a real browser against real Postgres, not just typechecked — see
[Phases](#phases) for exactly what's live-verified versus what rests on typecheck/build alone,
and [`docs/LAUNCH_RUNBOOK.md`](docs/LAUNCH_RUNBOOK.md) before treating this as launch-ready.
It isn't yet — the restore drill hasn't been run for real, and neither has an actual Claude or
Stripe API call.

## Why "Porphyra"

Greek πορφύρα — both the murex sea snail and the Tyrian purple dye extracted from it.
~12,000 snails yielded 1.4g; it was reserved for what was earned, not mass-produced. That's
the product thesis: judgement over volume, in a job market that rewards spraying
applications everywhere.

## Architecture

```
porphyra/
├── apps/
│   ├── web/            Astro 5   — marketing, segment sites, legal (100% static)
│   └── app/             Next.js 16 — the authenticated SaaS
├── packages/
│   ├── tokens/           design tokens (primitive → semantic → component) + segment themes
│   ├── ui/               React component library, light-theme only, Storybook
│   ├── crypto/           client-side E2EE (WebCrypto + Argon2id)
│   ├── db/               Drizzle schema + migrations
│   ├── core/              domain logic — scoring, states, report schema (see NOTICE.md)
│   └── ai/                provider abstraction + prompt templates
└── infra/                Docker Compose, Caddyfile, provisioning + backup runbooks
```

The marketing site (`apps/web`) is 100% static HTML with no server runtime — it sits behind
Caddy with a maximally strict CSP. The app (`apps/app`) needs React server actions and
streaming, so it's Next.js. Both consume the same design tokens and component library.

Some domain logic (`packages/core`'s scoring rubric, canonical states, report schema, and
`packages/ai`'s provider abstraction) is adapted from the open-source
[`santifer/jobber`](https://github.com/santifer/jobber) CLI (MIT) — see [`NOTICE.md`](NOTICE.md)
for exactly which files and the required attribution. Everything else — encryption, billing,
infrastructure, branding — is new.

## Encryption model

Hybrid zero-knowledge: the server stores ciphertext for CV/reports/notes; a Data Encryption
Key wrapped by an Argon2id-derived Master Key never leaves the browser except wrapped. AI
evaluation is consented per-action — plaintext exists server-side only in memory, for the
duration of one request, never on disk. Full design and the honest encrypted-vs-clear split
in `packages/crypto` and the [approved plan](#) (ask in the repo if you need the doc).

```bash
pnpm --filter @porphyra/crypto test   # round-trip, wrong-password-rejection, blind-index tests
```

## Marketing site (apps/web)

15 static pages: home, how-it-works, pricing, security, about, changelog, contact, six legal
pages, and a segment-landing-page framework (`src/content.config.ts` + `/for/[slug]`) — see
`src/content/segments/example.md` for how to add a real one. The waitlist form POSTs
cross-origin to `apps/app`'s `/api/waitlist` (validated, honeypot-protected, rate-limited),
since the marketing site itself has no server runtime by design.

**Deliberately deferred, not forgotten:** `/guides/*` (SEO content — needs an ongoing content
pipeline, not a foundation task) and `/status` (needs something actually deployed to monitor).
Both can be added without touching anything else.

**Blocked on one decision:** the domain. Every legal page, the Caddyfile, and `security.txt`
use `porphyra.example` as a placeholder — find/replace once chosen, then Phase 1 can go live
per `infra/README.md`.

## Auth + vault (apps/app)

Better Auth: email/password, Google/GitHub OAuth (opt-in, only registered when both env vars
for a provider are set), TOTP 2FA with backup codes, session cookies via `nextCookies`.

The password Better Auth ever sees is **not the user's real password** — the client derives
a verifier via Argon2id, salted deterministically from the email (`deriveAuthVerifierSalt` in
`packages/crypto`) so login needs no pre-auth lookup round trip. The real password only ever
touches a *second*, independent Argon2id derivation — the Master Key, salted randomly per
account — which unwraps the vault's Data Encryption Key entirely client-side. Vault bootstrap
happens on first login (not signup), sidestepping any ambiguity about whether Better Auth
issues a session before email verification. The 24-word recovery phrase is shown exactly
once, with a mandatory written acknowledgement, and never touches the server.

```bash
pnpm --filter @porphyra/crypto test   # round-trip, wrong-password-rejection, auth-verifier tests
```

## Core pipeline (apps/app)

Evaluate → track → view. `/evaluate` decrypts your latest CV client-side, sends it and the
pasted job description for one consented request to `/api/evaluate`, which enforces the
free-tier quota (`usage_counters`), calls Claude via tool-use to force a structured report
matching `evaluationReportSchema`, tracks the call in `ai_jobs` (tokens, cost, status), and
returns the plaintext report. The client re-encrypts it, saves it as a `vault_items` row, and
creates an `applications` row — company/role are stored BOTH as a one-way blind index (server
filtering) and as genuinely encrypted fields (so the pipeline UI has something to decrypt and
display; a blind index alone can't be reversed for that). `/pipeline` lists and decrypts them;
`/pipeline/[id]` shows the full report and drives state transitions through
`isValidTransition` — the UI only ever offers legal next states.

`VaultContext` holds an `indexKey` (HKDF-derived from the DEK) alongside the DEK itself, so
every blind index in the app comes from the same key hierarchy — never a one-off random key
that would make dedup silently compare against nothing.

**Deliberately deferred:** CV tailoring and PDF generation. Real, separate scope (templating,
rendering) that doesn't belong bolted onto the evaluate→track loop — `/cv` currently stores
plain pasted text, not a structured or exportable document.

**Not live-verified:** the actual Anthropic API call in `packages/ai/src/prompts/evaluate.ts`
— this environment has no `ANTHROPIC_API_KEY`. Everything around it (quota enforcement, job
tracking, encrypted storage, the pipeline UI) has been driven end to end in a browser against
real Postgres; the model call itself rests on the Anthropic SDK's documented tool-use shape,
unverified against a live response. Confirm this first before relying on it.

## Billing (apps/app)

Free tier + one Pro plan via Stripe Checkout. `/api/billing/checkout` creates (or reuses) a
Stripe customer and a Checkout Session; `/api/billing/webhook` is the ONLY place a
subscription actually flips to `pro` — never the checkout route itself, since that only
proves a session was *created*, not that payment succeeded. The webhook is idempotent against
Stripe's at-least-once delivery via a `processed_stripe_events` ledger keyed on Stripe's own
event ID: a duplicate delivery hits a primary-key collision and is acknowledged as already
handled instead of double-applying the change. `/settings/billing` is the account-facing
upgrade/manage-billing page; `checkEvaluationQuota`/`recordEvaluationUsage` (built in Phase 3)
already read `subscriptions.tier` live, so a webhook-confirmed upgrade takes effect on the
very next evaluation with no code change needed.

Signature verification is real crypto (HMAC), not a network call, so it's actually tested —
offline, against `stripe.webhooks.generateTestHeaderString`, confirming a validly-signed
payload verifies, a tampered payload is rejected, and a wrong secret is rejected. One real fix
along the way: a Stripe API version change (March 2025's "Basil") moved
`current_period_end` from the top-level Subscription object onto each subscription item in
their current docs — but the pinned SDK version here (`stripe@17.7.0`) still types the field
on the top-level object, confirmed directly against its `.d.ts`, not just the docs. Went with
what the installed SDK's types actually declare; flagged in the webhook route's own comment as
a real risk to confirm against a live payload before launch, since a type declaration doesn't
guarantee the field populates for every account's default API version.

**Not live-verified:** an actual Checkout session, webhook delivery, or subscription upsert
against real Stripe — no Stripe test key in this environment.

## Analytics (apps/app)

Behavioural only — `track()` (`apps/app/src/lib/analytics.ts`) is called from six
already-authenticated server routes (vault bootstrap, evaluation completed/quota-exceeded,
application created/state-changed, checkout started, subscription upgraded), never from a
generic client-facing endpoint. `props` can only ever hold structural facts (counts, IDs,
state names) — it structurally cannot contain vault content, the same E2EE-vs-analytics split
from the original plan. `/admin/analytics` (gated by a separate `admins` allowlist table, not
a field bolted onto Better Auth's own `user` table) shows an activation funnel, per-event
feature adoption, and AI cost by user — a non-admin gets a 404 for both the page and its API
route, not a 403, so the route's existence isn't confirmed to someone who shouldn't see it.

**Real bug caught offline, before it ever touched a database:** the funnel query originally
used a raw `sql`... = ANY(${array})`` template. Drizzle compiles an array parameter there to
`ANY(($1, $2, $3, $4))` — which Postgres parses as a row constructor, not an array, and
rejects. Caught by literally printing the generated SQL via Drizzle's own `.toSQL()` (no live
connection needed) before trusting it, then fixed by switching to Drizzle's typed `inArray()`
instead of hand-rolled SQL. Two of the three analytics queries used a raw `sql`... desc``
for ordering too; replaced with `desc(count())` / `desc(sum(...))` so nothing in this file
depends on hand-written SQL fragments anymore.

Ops telemetry (Prometheus + Grafana + Loki) is deliberately NOT part of this phase — see
`infra/README.md`, where it was already scoped into Phase 6 back when the infra was first
built, alongside the backup/restore drill.

**Not live-verified:** these queries against real Postgres — confirmed correct via Drizzle's
`.toSQL()` output, not an actual query result. Docker's engine remains stuck in a broken
handshake state in this environment.

## Hardening (Phase 6)

- **Per-request nonce-based CSP** (`apps/app/src/proxy.ts` — Next.js 16 renamed
  `middleware.ts` to `proxy.ts`; this codebase uses the current convention, not the
  deprecated one). Closes a gap flagged in `next.config.mjs`'s own comment since Phase 2:
  Caddy handles the marketing site's static CSP, but the app needs a fresh nonce per request,
  which only app code can generate.
- **Redis-backed rate limiting** (`apps/app/src/lib/rateLimit.ts`), replacing Phase 1's
  in-memory version now that the trigger conditions its own comment named — more than one
  rate-limited endpoint, a real login surface — both exist. Fails open on Redis errors
  (logged), since rate limiting here is defense-in-depth, not the primary security boundary.
  Applied to `/api/waitlist` (already existed) and newly to `/api/evaluate` (a real gap:
  the endpoint had a monthly quota but no burst limit).
- **Structured logging** (`apps/app/src/lib/logger.ts`, Pino) — every `console.error` in the
  app that represents an actual operational condition now emits structured JSON, which is
  what makes `infra/docker-compose.observability.yml`'s Promtail scrape config useful. A
  dev-only convenience log (the "no RESEND_API_KEY" fallback, which prints a copy-pasteable
  verification link) deliberately stays plain `console.log`.
- **Backup + restore** (`infra/scripts/backup.sh`, `restore.sh`, `restore-drill.md`) —
  pg_dump → age-encrypt → ship offsite, and the matching restore path with a typed
  confirmation guard before it overwrites a target database. **The drill itself has not been
  run** — `age`/`restic` aren't installed in this environment and no production backup exists
  yet. This is a real, logged gap (see the drill log), not a formality.
- **Observability scaffolding** (`infra/docker-compose.observability.yml`) — Prometheus +
  Loki + Promtail + Grafana as an optional overlay, not started by default. Gives you log
  aggregation and a metrics-collection layer; does NOT give you dashboards, alerting rules,
  or app-exported Prometheus metrics — building those against real traffic patterns is
  separate, later work.
- **CI security gate hardened** — `pnpm audit --prod --audit-level=high` is now a hard gate
  (Phase 0 shipped it as `continue-on-error: true`, "advisory until Phase 6 sets the enforced
  baseline" — this is that baseline), plus a new OSV-Scanner step alongside the existing
  gitleaks/Semgrep checks.
- **[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)** — STRIDE-scoped to this actual
  architecture, not a generic template. Names one real unaddressed gap explicitly:
  `audit_log` exists in the schema but no write path populates it yet.
- **[`docs/LAUNCH_RUNBOOK.md`](docs/LAUNCH_RUNBOOK.md)** — the pre-launch checklist. Its last
  item is the one nothing in this codebase can verify by itself: a real person running the
  full signup → evaluate → upgrade chain against the actual production domain.

## Getting started

Requires Node ≥20, pnpm 9.15+, Docker.

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres, Redis, Umami
cp .env.example .env                                     # fill in real values
pnpm install
pnpm dev                                                  # runs every app's dev script via Turborepo
```

```bash
pnpm build       # build everything
pnpm test        # unit tests (Vitest)
pnpm typecheck   # tsc --noEmit across the workspace
pnpm lint        # Biome
pnpm run security  # dependency audit + secret scan
```

`apps/web` → http://localhost:4321 · `apps/app` → http://localhost:3000

## Phases

Each phase ends deployable.

| # | Phase | Status |
|---|---|---|
| 0 | Foundation — monorepo, tokens, UI kit, core logic, crypto, infra | ✅ Done |
| 1 | Marketing site — content, legal pages, segment framework, waitlist | ✅ Built — blocked on domain choice for live deploy |
| 2 | Auth + crypto — Better Auth, 2FA, OAuth, vault, onboarding | ✅ Built |
| 3 | Core pipeline — evaluate → track (CV tailoring/PDF deferred, see below) | ✅ Built — AI call unverified, no API key in this environment |
| 4 | Billing — Stripe free + Pro | ✅ Built — checkout/webhook unverified, no Stripe test key in this environment |
| 5 | Analytics — event pipeline, admin dashboard (ops telemetry deferred to Phase 6, see `infra/README.md`) | ✅ Built — DB queries offline-verified, not against live Postgres |
| 6 | Hardening — CSP, Redis rate limiting, structured logging, backups, threat model, launch runbook | ✅ Built — restore drill not yet run for real |

## Infrastructure

See [`infra/README.md`](infra/README.md) for the VPS provisioning runbook (Hetzner
CX32-class, 4 vCPU/8GB recommended), Docker Compose stacks, and Caddy config.

## License

Proprietary (`UNLICENSED`) — see [`NOTICE.md`](NOTICE.md) for the MIT-derived portions and
their required attribution.
