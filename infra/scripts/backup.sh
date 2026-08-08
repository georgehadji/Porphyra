#!/usr/bin/env bash
# Nightly Postgres backup — pg_dump, age-encrypt, ship offsite. Run via cron
# on the production host (see infra/README.md's crontab line). Assumes:
#   - Running inside/alongside the docker-compose.prod.yml stack.
#   - AGE_PUBLIC_KEY set in the environment (encrypt-only key — the matching
#     private key lives ONLY on whatever machine runs a restore, never on
#     the production host itself; a backup host that can decrypt its own
#     backups isn't meaningfully different from one with no backups).
#   - RESTIC_REPOSITORY / RESTIC_PASSWORD (or equivalent) set for the
#     offsite copy — restic is one reasonable choice, swap for whatever
#     object storage you actually provision; the encrypt-then-ship shape
#     doesn't change.
#
# Exit non-zero on ANY failure (set -e) — a silent backup failure is worse
# than a loud one; this should be wired to alert on a cron failure, not
# just logged and forgotten.

set -euo pipefail

BACKUP_DIR="/opt/porphyra/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/porphyra-${TIMESTAMP}.sql"
ENCRYPTED_FILE="${DUMP_FILE}.age"
RETENTION_DAYS=30

if [ -z "${AGE_PUBLIC_KEY:-}" ]; then
  echo "AGE_PUBLIC_KEY is not set — refusing to write an unencrypted backup to disk." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Dumping database..."
docker compose -f "$(dirname "$0")/../docker-compose.prod.yml" exec -T postgres \
  pg_dump -U porphyra -d porphyra --no-owner --no-privileges > "$DUMP_FILE"

echo "Encrypting..."
age -r "$AGE_PUBLIC_KEY" -o "$ENCRYPTED_FILE" "$DUMP_FILE"
shred -u "$DUMP_FILE" 2>/dev/null || rm -f "$DUMP_FILE" # plaintext dump never survives this script

echo "Shipping offsite..."
if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  restic backup "$ENCRYPTED_FILE"
else
  echo "RESTIC_REPOSITORY not set — backup encrypted locally only at $ENCRYPTED_FILE." >&2
  echo "This is NOT a real backup strategy until it leaves this host." >&2
fi

echo "Pruning local backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "porphyra-*.sql.age" -mtime "+${RETENTION_DAYS}" -delete

echo "Backup complete: ${ENCRYPTED_FILE}"
