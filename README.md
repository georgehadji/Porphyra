# Porphyra

[![CI](https://github.com/georgehadji/Porphyra/actions/workflows/ci.yml/badge.svg)](https://github.com/georgehadji/Porphyra/actions/workflows/ci.yml)
[![License: UNLICENSED](https://img.shields.io/badge/license-UNLICENSED-red.svg)](NOTICE.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](package.json)

Score every job posting before you spend an evening tailoring a CV for it. Encrypted by
default. Built for job seekers everywhere, most of them remote.

**Status: pre-launch.** Every planned phase (0–6) is built, plus a post-audit architecture
uplift covering the async evaluation queue, atomic quota enforcement, and a database-level
audit trail. See [Status & verification](#status--verification) for exactly what has been
driven end to end against real infrastructure versus what rests on typecheck/build alone, and
[`docs/LAUNCH_RUNBOOK.md`](docs/LAUNCH_RUNBOOK.md) before treating this as launch-ready — it
isn't yet.

## Table of contents

- [Why "Porphyra"](#why-porphyra)
- [Architecture](#architecture)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Status & verification](#status--verification)
- [Deployment](#deployment)
- [License](#license)

## Why "Porphyra"

Greek πορφύρα — both the murex sea snail and the Tyrian purple dye extracted from it.
~12,000 snails yielded 1.4g; it was reserved for what was earned, not mass-produced. That's
the product thesis: judgement over volume, in a job market that rewards spraying
applications everywhere.

## Architecture

```
porphyra/
├── apps/
│   ├── web/       Astro 5    — marketing, segment sites, legal (100% static)
│   ├── app/       Next.js 16 — the authenticated SaaS
│   └── worker/    Node       — async AI job consumer (BullMQ over Redis)
├── packages/
│   ├── tokens/    design tokens (primitive → semantic → component) + segment themes
│   ├── ui/        React component library, light-theme only, Storybook
│   ├── crypto/    client-side E2EE (WebCrypto + Argon2id), branded key types
│   ├── db/        Drizzle schema, migrations, atomic quota logic
│   ├── core/      domain logic — scoring, states, report schema (see NOTICE.md)
│   └── ai/        provider abstraction, prompt templates, queue + circuit breaker
├── infra/         Docker Compose, Caddyfile, provisioning + backup runbooks
└── docs/          threat model, launch runbook, architecture roadmap
```

Dependency direction is one-way: `core`, `crypto`, and `db` have zero dependencies on each
other or on any app; `ai` and `ui` depend only on `core`; `apps/app` and `apps/worker` are the
only packages that compose the full stack. Nothing outside `apps/app/src/app/api/**` touches
Postgres, Redis, or Stripe directly — every client component reaches the server exclusively
through validated HTTP routes.

The marketing site (`apps/web`) is 100% static HTML with no server runtime — it sits behind
Caddy with a maximally strict CSP. The app (`apps/app`) needs React server actions and
streaming, so it's Next.js. The worker (`apps/worker`) is a plain long-running Node process
that consumes AI evaluation jobs off a Redis-backed queue — see
[Async evaluation pipeline](#async-evaluation-pipeline) for why it exists.

Some domain logic (`packages/core`'s scoring rubric, canonical states, report schema, and
`packages/ai`'s provider abstraction) is adapted from the open-source
[`santifer/jobber`](https://github.com/santifer/jobber) CLI (MIT) — see [`NOTICE.md`](NOTICE.md)
for exactly which files and the required attribution. Everything else — encryption, billing,
the queue, infrastructure, branding — is new.

## How it works

### Encryption model

Hybrid zero-knowledge. The server stores ciphertext for CVs, reports, and notes; a Data
Encryption Key (DEK), wrapped by an Argon2id-derived Master Key, never leaves the browser
except wrapped. A separate Index Key (HKDF-derived from the DEK) produces one-way blind
indexes so the server can filter and dedupe company/role names without ever learning them.
Every key role — Master Key, DEK, Index Key, Recovery Key — is a distinct branded type in
`packages/crypto`, so passing the wrong key into the wrong function is a compile error, not a
runtime bug.

AI evaluation is consented per action: plaintext exists server-side only for the lifetime of
one job, never on disk, and is discarded after a single collection by the client (see below).

```bash
pnpm --filter @porphyra/crypto test   # round-trip, wrong-password-rejection, blind-index tests
```

### Async evaluation pipeline

`/evaluate` decrypts your latest CV client-side and POSTs it with the job description to
`/api/evaluate`, which validates the request, atomically reserves one slot against the
free-tier monthly quota, and enqueues a job — returning `202` immediately rather than holding
the request open. `apps/worker` consumes the queue, calls Claude via tool-use to force a
structured report, and writes the plaintext into Redis under a short TTL. The client polls
`GET /api/evaluate/[jobId]` and collects the report exactly once (`GETDEL`, atomic
read-and-delete) — the same "plaintext exists for one consented request" guarantee as before,
now spread across a poll-and-collect cycle instead of a single blocking HTTP call. The
Anthropic call itself is wrapped in a circuit breaker with bounded, jittered retry, so a
provider outage fails fast instead of every concurrent request individually timing out.

The client then re-encrypts the report, saves it as a `vault_items` row, and creates an
`applications` row — company and role are stored both as a one-way blind index (server-side
filtering) and as genuinely encrypted fields, so the pipeline UI has something to decrypt and
display. `/pipeline` lists and decrypts them; `/pipeline/[id]` shows the full report and
drives state transitions through `isValidTransition`, so the UI only ever offers legal next
states.

Quota enforcement is a single atomic `INSERT ... ON CONFLICT ... WHERE` against a uniquely
constrained counter row — reserved before the AI call, released if the call fails, so a race
between concurrent requests can't let either the same user exceed quota or a failed call burn
it. See [`docs/ARCHITECTURE_UPLIFT_PLAN.md`](docs/ARCHITECTURE_UPLIFT_PLAN.md) for the full
reasoning behind this design.

**Deliberately deferred:** CV tailoring and PDF generation — real, separate scope that doesn't
belong bolted onto the evaluate → track loop. `/cv` currently stores plain pasted text, not a
structured or exportable document.

### Auth + vault

Better Auth: email/password, Google/GitHub OAuth (opt-in, registered only when both env vars
for a provider are set), TOTP 2FA with backup codes.

The password Better Auth ever sees is **not the user's real password** — the client derives a
verifier via Argon2id, salted deterministically from the email, so login needs no pre-auth
lookup round trip. The real password only ever touches a *second*, independent Argon2id
derivation — the Master Key, salted randomly per account — which unwraps the vault's DEK
entirely client-side. The 24-word recovery phrase is shown exactly once, with a mandatory
written acknowledgement, and never touches the server.

### Billing

Free tier + one Pro plan via Stripe Checkout. `/api/billing/webhook` is the only place a
subscription flips to `pro` — never the checkout route itself, since that only proves a
session was created, not that payment succeeded. The webhook is idempotent against Stripe's
at-least-once delivery via a `processed_stripe_events` ledger keyed on Stripe's own event ID.

### Analytics

Behavioural only, never content. `track()` writes structural facts (event names, counts, IDs)
from already-authenticated server routes — the `events.props` column structurally cannot hold
vault content. `/admin/analytics` is gated by a separate `admins` allowlist table; a non-admin
gets a 404, not a 403, so the route's existence isn't confirmed to someone who shouldn't see
it.

### Audit trail

Security-relevant writes — login, password change, 2FA enrollment, key rotation, application
state changes — are recorded by Postgres triggers on the affected tables themselves, reading
`NEW.user_id` directly off the row. This is deliberate: an application-layer call site can be
forgotten by a future route; a trigger fires regardless of which code path performed the
write, including writes Better Auth makes directly through the same connection. See
`packages/db/migrations/0002_audit_log_triggers.sql`.

### Hardening

- **Per-request nonce-based CSP** (`apps/app/src/proxy.ts`) for the app; Caddy enforces a
  maximally strict static CSP for the marketing site.
- **Redis-backed rate limiting** (`apps/app/src/lib/rateLimit.ts`), fixed-window, fails open
  on Redis errors (logged) — defense-in-depth, not the primary security boundary.
- **Structured logging** (Pino, JSON to stdout) across `apps/app` and `apps/worker`, feeding
  `infra/docker-compose.observability.yml`'s Promtail/Loki scrape config.
- **Backup + restore** (`infra/scripts/backup.sh`, `restore.sh`) — `pg_dump` → age-encrypt →
  ship offsite, with a typed confirmation guard on restore.
- **CI security gate** — `pnpm audit --prod --audit-level=high` (hard gate), OSV-Scanner,
  gitleaks, and Semgrep all run on every PR.

## Getting started

Requires Node ≥20, pnpm 9.15+, Docker.

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres, Redis, Umami
cp .env.example .env                                     # fill in real values
pnpm install
pnpm dev                                                  # runs every app's dev script via Turborepo
```

| App | URL |
|---|---|
| `apps/web` | http://localhost:4321 |
| `apps/app` | http://localhost:3000 |
| `apps/worker` | no HTTP surface — logs to stdout |

## Testing

```bash
pnpm build       # build everything
pnpm test        # unit tests (Vitest) — packages/core and packages/crypto
pnpm typecheck   # tsc --noEmit across the workspace
pnpm lint        # Biome
pnpm run security  # dependency audit + secret scan
```

## Project structure

| Path | What it is |
|---|---|
| `apps/web` | Marketing site — 15 static pages, segment-landing framework, legal pages |
| `apps/app` | The authenticated SaaS — Next.js App Router, all API routes |
| `apps/worker` | Consumes the AI evaluation queue; the only process that calls Anthropic |
| `packages/core` | Pure domain logic — scoring, states, legitimacy, report schema. Zero infra deps |
| `packages/crypto` | Client-side E2EE — AES-GCM, Argon2id, HKDF, branded key types. Zero infra deps |
| `packages/db` | Drizzle schema, migrations, and the atomic quota functions both apps consume |
| `packages/ai` | Anthropic client, prompt templates, queue definition, circuit breaker |
| `packages/ui` | React component library, Storybook |
| `packages/tokens` | Design tokens — primitive → semantic → component, segment themes |
| `infra/` | Docker Compose (dev/prod/observability), Caddyfile, backup/restore scripts |
| `docs/` | Threat model, launch runbook, architecture uplift roadmap |

## Documentation

- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — STRIDE-scoped to this actual architecture.
- [`docs/LAUNCH_RUNBOOK.md`](docs/LAUNCH_RUNBOOK.md) — the pre-launch checklist.
- [`docs/ARCHITECTURE_UPLIFT_PLAN.md`](docs/ARCHITECTURE_UPLIFT_PLAN.md) — the roadmap from
  the post-launch architecture audit to a hardened, fully observable target state. The async
  queue, atomic quota, audit triggers, branded key types, and circuit breaker above are all
  implemented from this plan; row-level security, contract tests, mutation testing, and
  distributed tracing remain open.
- [`infra/README.md`](infra/README.md) — VPS provisioning runbook, Docker Compose stacks,
  Caddy config.
- [`NOTICE.md`](NOTICE.md) — MIT-derived portions and required attribution.

## Status & verification

Every phase below is built and typechecked; the columns distinguish what's additionally been
driven against real infrastructure from what still rests on types and offline validation
alone.

| # | Phase | Status |
|---|---|---|
| 0 | Foundation — monorepo, tokens, UI kit, core logic, crypto, infra | ✅ Done |
| 1 | Marketing site — content, legal pages, segment framework, waitlist | ✅ Built — blocked on domain choice for live deploy |
| 2 | Auth + crypto — Better Auth, 2FA, OAuth, vault, onboarding | ✅ Built — live-verified against real Postgres |
| 3 | Core pipeline — evaluate → track (CV tailoring/PDF deferred) | ✅ Built — async queue live; AI call itself unverified, no API key in this environment |
| 4 | Billing — Stripe free + Pro | ✅ Built — checkout/webhook unverified, no Stripe test key in this environment |
| 5 | Analytics — event pipeline, admin dashboard | ✅ Built — queries offline-verified, not against live Postgres |
| 6 | Hardening — CSP, rate limiting, structured logging, backups, threat model, launch runbook | ✅ Built — restore drill not yet run for real |
| — | Architecture uplift — atomic quota, audit triggers, async queue, branded key types, circuit breaker | ✅ Built, typechecked, unit-tested — [details](docs/ARCHITECTURE_UPLIFT_PLAN.md) |

**Known limitations, stated plainly:**

- No live call has been made to Anthropic or Stripe in this environment — both integrations
  rest on their SDKs' documented shapes, validated by schema parsing and offline signature
  tests, not a real response. Confirm both before relying on them in production.
- The Postgres-backed restore drill (`infra/scripts/restore-drill.md`) has not been run for
  real.
- Row-level security, contract tests against recorded API fixtures, mutation testing on
  `packages/core`/`packages/crypto`, and distributed tracing across the (now multi-process)
  evaluate path are designed in `docs/ARCHITECTURE_UPLIFT_PLAN.md` but not yet implemented.
- The production domain is not yet chosen — every legal page, the Caddyfile, and
  `security.txt` use `porphyra.example` as a placeholder.

## Deployment

See [`infra/README.md`](infra/README.md) for the VPS provisioning runbook (Hetzner CX32-class,
4 vCPU/8GB recommended), the Docker Compose stacks (`dev`, `prod`, `observability`), and the
Caddy reverse-proxy config. `apps/worker` ships as its own container in
`infra/docker-compose.prod.yml`, alongside `app`, `web`, `postgres`, `redis`, and `umami`.

## License

Proprietary (`UNLICENSED`) — see [`NOTICE.md`](NOTICE.md) for the MIT-derived portions and
their required attribution.
