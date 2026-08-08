# Launch runbook

A checklist, not a guarantee. Work through it in order — later items assume earlier ones are
done. Nothing here should be treated as complete because it's *built*; the boxes below are
about *verified*, and several things in this codebase are honestly one, not the other yet —
see the README's per-phase "Not live-verified" notes before checking anything off here.

## Before you start

- [ ] Domain chosen. Find/replace `porphyra.example` across `Caddyfile`, `security.txt`,
  every legal page, and `infra/README.md`.
- [ ] VPS provisioned per `infra/README.md`'s runbook (hardening, firewall, Docker).
- [ ] Real secrets generated for every value in `.env.example` — `openssl rand -base64 32`
  for `BETTER_AUTH_SECRET`; never reuse the dev fallback values baked into `db.ts`/`auth.ts`.

## Accounts & external services

- [ ] Anthropic API key with a spend limit/alert configured on their side — this codebase's
  quota enforcement is the app-level control, not a substitute for a hard vendor-side cap.
- [ ] Stripe account live mode, real price ID for `STRIPE_PRICE_PRO_MONTHLY`, webhook
  endpoint registered pointing at `/api/billing/webhook` with the resulting signing secret in
  `STRIPE_WEBHOOK_SECRET`.
- [ ] Resend (or your chosen email provider) domain verified — SPF/DKIM configured, not just
  an API key. A verification email that lands in spam is a broken signup flow.
- [ ] Google/GitHub OAuth apps created if you're enabling social login, with the production
  callback URL registered (not just localhost).

## Data safety

- [ ] Migration applied to production Postgres (`pnpm --filter @porphyra/db run db:migrate`)
  — NOT `db:generate`, and never `drizzle-kit push` against production.
- [ ] `infra/scripts/backup.sh` running on a cron, confirmed by checking the encrypted output
  actually appears after the first scheduled run — not just that the crontab line exists.
- [ ] **Restore drill executed and logged** in `infra/scripts/restore-drill.md`. This is the
  single hardest gate in this list to fake — if it isn't in the log, it didn't happen.

## Security

- [ ] `pnpm run security` clean (or every finding explicitly triaged, not silenced).
- [ ] `securityheaders.com` scan against the live domain — target A+; the Caddy + proxy.ts
  headers are designed for this, confirm they actually land through the real reverse proxy.
- [ ] `docs/THREAT_MODEL.md` reviewed by someone who didn't write the code that implements
  its mitigations.
- [ ] `audit_log` gap (flagged in the threat model's Repudiation section) either wired or
  explicitly accepted as a known limitation for v1 — don't let it sit unaddressed silently.
- [ ] Rotate `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY` if any of them
  were ever pasted into a chat, ticket, or anywhere outside a proper secrets manager during
  development — including this one.

## The one thing that can't be checked from a terminal

- [ ] A real human — not this codebase's author — signs up, verifies email, sets up 2FA,
  saves a CV, evaluates a real posting, moves it through the pipeline, and upgrades to Pro,
  on the actual production domain. Every automated check in this repo verifies a piece;
  nothing here has verified the whole chain against production, because production doesn't
  exist yet as this is written.

## Rollback plan

- [ ] Know how to roll back a bad deploy BEFORE you need to: pin the previous image tag in
  `docker-compose.prod.yml`'s `APP_TAG`/`WEB_TAG`, confirm `docker compose up -d` with the
  old tags actually restores service. Practicing this once, deliberately, beats discovering
  the process during an actual incident.
