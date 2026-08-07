# Porphyra

Score every job posting before you spend an evening tailoring a CV for it. Encrypted by
default. Built for job seekers everywhere, most of them remote.

**Status: Phases 0–4 complete.** Foundation, marketing site, auth + the E2EE vault, the core
evaluate → track pipeline, and Stripe billing are built. The auth/vault flow has been driven
end to end through a real browser against real Postgres, not just typechecked — see
[Phases](#phases) for exactly what's live-verified versus what rests on typecheck/build alone.

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
| 5 | Analytics — event pipeline, admin dashboard, ops telemetry | Planned |
| 6 | Hardening — threat model, restore drill, launch runbook | Planned |

## Infrastructure

See [`infra/README.md`](infra/README.md) for the VPS provisioning runbook (Hetzner
CX32-class, 4 vCPU/8GB recommended), Docker Compose stacks, and Caddy config.

## License

Proprietary (`UNLICENSED`) — see [`NOTICE.md`](NOTICE.md) for the MIT-derived portions and
their required attribution.
