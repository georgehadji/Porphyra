# Restore drill

**A backup you haven't restored is a hypothesis, not a backup.** This drill must be run —
for real, against a real backup, into a real (throwaway) database — before launch, and
re-run whenever `backup.sh`, `restore.sh`, or the schema changes meaningfully. This document
is the runbook and the log; append a new entry under **Drill log** every time it runs.

## Status

**Not yet executed.** `age` and `restic` aren't installed in the environment this repo was
built in, and no production backup exists yet to restore from. This is a real gap, not a
formality — do not consider Phase 6 complete, or this system launch-ready, until at least one
entry exists below with a PASS.

## Prerequisites

- `age` (https://github.com/FiloSottile/age) and, if using the reference `backup.sh`,
  `restic` (https://restic.net) installed on whatever machine runs this drill.
- A real encrypted backup produced by `infra/scripts/backup.sh` (or a synthetic one — see
  "Dry run without a production backup" below).
- The `age` **private** key matching the `AGE_PUBLIC_KEY` the backup was encrypted with.
  Never the production host's key — see `backup.sh`'s comment on why.
- A disposable Postgres instance to restore into. Never the production database.

## Procedure

1. Spin up a throwaway Postgres: `docker run --rm -d -e POSTGRES_PASSWORD=drill -p 55433:5432 --name restore-drill postgres:16.4-alpine3.20`
2. Create the target database: `psql postgres://postgres:drill@localhost:55433/postgres -c "CREATE DATABASE restore_drill;"`
3. Run `infra/scripts/restore.sh <backup-file> <age-key-file> postgres://postgres:drill@localhost:55433/restore_drill`
4. Verify, in order:
   - [ ] Script completes without error.
   - [ ] Row counts on a few key tables (`user`, `applications`, `vault_items`) are non-zero
     and plausible for the backup's known age.
   - [ ] `SELECT ciphertext FROM vault_items LIMIT 1;` returns base64 garbage, not plaintext —
     confirms the restored data is still genuinely encrypted, not that the drill accidentally
     restored from an unencrypted source.
   - [ ] Point a local `apps/app` dev instance at the restored database (`DATABASE_URL`
     override) and actually log in as a real test account from that backup, confirming the
     vault unlocks. This is the check that actually matters — row counts prove data exists,
     logging in proves the application can use it.
5. Tear down: `docker rm -f restore-drill`
6. Record the result below. A drill that "mostly worked" is a FAIL — fix whatever broke and
   re-run before recording PASS.

## Dry run without a production backup

Before a real production backup exists, exercise the mechanism end to end with synthetic
data: run `docker compose -f infra/docker-compose.dev.yml up -d`, seed a couple of rows,
run `backup.sh` by hand against the dev stack, then follow the procedure above. This proves
the scripts work; it does not substitute for drilling an actual production backup once one
exists.

## Drill log

| Date | Backup age | Run by | Result | Notes |
|------|-----------|--------|--------|-------|
| — | — | — | — | No drill has been run yet. |
