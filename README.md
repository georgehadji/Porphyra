# Porphyra

Score every job posting before you spend an evening tailoring a CV for it. Encrypted by
default. Built for job seekers everywhere, most of them remote.

**Status: Phases 0–2 complete.** Foundation, marketing site, and auth + the E2EE vault are
built — and the auth/vault flow (signup, email verification, 2FA enrollment, login, vault
bootstrap and unlock) has been driven end to end through a real browser against a real
Postgres instance, not just typechecked. See [Phases](#phases).

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
| 3 | Core pipeline — evaluate → track → tailor CV → PDF | Planned |
| 4 | Billing — Stripe free + Pro | Planned |
| 5 | Analytics — event pipeline, admin dashboard, ops telemetry | Planned |
| 6 | Hardening — threat model, restore drill, launch runbook | Planned |

## Infrastructure

See [`infra/README.md`](infra/README.md) for the VPS provisioning runbook (Hetzner
CX32-class, 4 vCPU/8GB recommended), Docker Compose stacks, and Caddy config.

## License

Proprietary (`UNLICENSED`) — see [`NOTICE.md`](NOTICE.md) for the MIT-derived portions and
their required attribution.
