#!/bin/sh
# Daily backup: database dump and uploaded files onto the second disk, then an encrypted copy off-site.
# Writes are paused (maintenance flag) while both are captured so they describe the same moment, and resume on
# every exit path, including failure. The monitoring ping is sent only after every stage has succeeded.
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT="${BACKUP_ROOT:-/backups}"
FLAG="${MAINTENANCE_FLAG:-/data/state/maintenance}"
KEEP="${KEEP_DUMPS:-14}"
DB_DIR="$ROOT/db"
FILES_DIR="$ROOT/uploads"
mkdir -p "$DB_DIR" "$FILES_DIR"

resume() { rm -f "$FLAG"; }
trap resume EXIT INT TERM

fail() {
  echo "BACKUP FAILED at stage: $1" >&2
  if [ -n "${HEALTHCHECKS_URL:-}" ]; then curl -fsS -m 10 --retry 2 "${HEALTHCHECKS_URL}/fail" >/dev/null 2>&1 || true; fi
  exit 1
}

mkdir -p "$(dirname "$FLAG")"
touch "$FLAG"
sleep "${PAUSE_SECONDS:-5}"

DUMP="$DB_DIR/familylink-$STAMP.dump"
pg_dump --format=custom --no-owner --file "$DUMP" || fail "database dump"
rsync -a --delete /data/uploads/ "$FILES_DIR/" || fail "file copy"
resume

pg_restore --list "$DUMP" >/dev/null || fail "dump is not readable"
( cd "$FILES_DIR" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum ) > "$DB_DIR/familylink-$STAMP.files.sha256" || fail "file checksums"
( cd "$DB_DIR" && sha256sum "familylink-$STAMP.dump" ) > "$DUMP.sha256" || fail "dump checksum"

# Keep the newest $KEEP dumps (and their checksum files) on the second disk.
ls -1t "$DB_DIR"/familylink-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256" "${old%.dump}.files.sha256"
done

if [ -z "${RCLONE_REMOTE:-}" ]; then fail "RCLONE_REMOTE (encrypted off-site remote) is not set"; fi
rclone --config /config/rclone/rclone.conf sync "$ROOT" "$RCLONE_REMOTE:familylink" --transfers 4 --checksum || fail "off-site encrypted copy"

if [ -n "${HEALTHCHECKS_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECKS_URL" >/dev/null || fail "monitoring ping"
elif [ "${ALLOW_NO_HEALTHCHECK:-0}" != "1" ]; then
  fail "HEALTHCHECKS_URL is not set"
fi
echo "Backup $STAMP complete."
