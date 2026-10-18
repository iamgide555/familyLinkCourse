#!/bin/sh
# Restores a backup into an ISOLATED staging database and directory, never the live ones.
#   restore.sh <dump-file> <staging-uploads-dir>
# Needs STAGING_PGHOST / STAGING_PGUSER / STAGING_PGPASSWORD / STAGING_PGDATABASE. The encryption keys are NOT
# here: they come from the password manager or sealed copy and are supplied only to verify:restore.
set -eu
DUMP="${1:?path to .dump file}"
TARGET="${2:?staging uploads directory}"
: "${STAGING_PGHOST:?}" "${STAGING_PGUSER:?}" "${STAGING_PGPASSWORD:?}" "${STAGING_PGDATABASE:?}"
case "$STAGING_PGHOST" in db|localhost|127.0.0.1) echo "Refusing: '$STAGING_PGHOST' looks like the live database." >&2; exit 2;; esac

BASE="$(basename "$DUMP" .dump)"
DIR="$(dirname "$DUMP")"
export PGPASSWORD="$STAGING_PGPASSWORD"
( cd "$DIR" && sha256sum -c "$BASE.dump.sha256" )

psql -h "$STAGING_PGHOST" -U "$STAGING_PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$STAGING_PGDATABASE\"" -c "CREATE DATABASE \"$STAGING_PGDATABASE\""
pg_restore -h "$STAGING_PGHOST" -U "$STAGING_PGUSER" -d "$STAGING_PGDATABASE" --no-owner --exit-on-error "$DUMP"

SRC="${UPLOADS_BACKUP_DIR:-$DIR/../uploads}"
mkdir -p "$TARGET"
rsync -a --delete "$SRC/" "$TARGET/"
# Encrypted file hashes must match the manifest taken at backup time.
( cd "$TARGET" && sha256sum -c "$DIR/$BASE.files.sha256" )

echo "Row counts in the restored database:"
psql -h "$STAGING_PGHOST" -U "$STAGING_PGUSER" -d "$STAGING_PGDATABASE" -At -c "SELECT 'members', count(*) FROM members UNION ALL SELECT 'registrations', count(*) FROM registrations UNION ALL SELECT 'case_note_revisions', count(*) FROM case_note_revisions UNION ALL SELECT 'registration_snapshots', count(*) FROM registration_snapshots UNION ALL SELECT 'member_documents', count(*) FROM member_documents"
echo "Restore complete. Next: run 'npm run verify:restore' with the keys recovered separately."
