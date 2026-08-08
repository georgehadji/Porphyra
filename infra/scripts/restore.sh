#!/usr/bin/env bash
# Restores an age-encrypted backup produced by backup.sh into a target
# Postgres database. Deliberately requires the private key as a LOCAL file
# path, never an env var — see backup.sh's comment on why the private key
# should never live on the production host in the first place. Run this
# from wherever that key actually lives (an operator's machine, a
# break-glass restore host — not the box being restored onto, unless
# that's a deliberate, logged exception).
#
# Usage: ./restore.sh <encrypted-backup-file> <age-private-key-file> <target-database-url>

set -euo pipefail

BACKUP_FILE="${1:?Usage: restore.sh <backup.sql.age> <age-key-file> <database-url>}"
KEY_FILE="${2:?Usage: restore.sh <backup.sql.age> <age-key-file> <database-url>}"
TARGET_DB_URL="${3:?Usage: restore.sh <backup.sql.age> <age-key-file> <database-url>}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi
if [ ! -f "$KEY_FILE" ]; then
  echo "Age private key file not found: $KEY_FILE" >&2
  exit 1
fi

DECRYPTED_FILE="$(mktemp)"
trap 'shred -u "$DECRYPTED_FILE" 2>/dev/null || rm -f "$DECRYPTED_FILE"' EXIT

echo "Decrypting backup..."
age -d -i "$KEY_FILE" -o "$DECRYPTED_FILE" "$BACKUP_FILE"

echo "About to restore into: $TARGET_DB_URL"
echo "This will overwrite existing data in that database. Ctrl-C now to abort."
read -r -p "Type the target database name to confirm: " CONFIRM_NAME
EXPECTED_NAME="$(echo "$TARGET_DB_URL" | sed -E 's#.*/([^/?]+).*#\1#')"
if [ "$CONFIRM_NAME" != "$EXPECTED_NAME" ]; then
  echo "Confirmation didn't match database name \"$EXPECTED_NAME\" — aborting." >&2
  exit 1
fi

echo "Restoring..."
psql "$TARGET_DB_URL" < "$DECRYPTED_FILE"

echo "Restore complete. Verify application-level sanity before considering this done —"
echo "see restore-drill.md for the checklist (row counts, a real login, vault unlock)."
