#!/bin/sh
# Usage: scripts/new-migration.sh <snake_case_name>
# Writes a timestamped migration from the schema diff against the configured database.
set -eu
name="${1:?migration name required}"
# Next stamp is one hour after the newest migration so ordering stays strictly increasing.
last="$(ls apps/api/prisma/migrations | grep -E '^[0-9]{14}_' | sort | tail -1 | cut -c1-14)"
stamp="$(node -e "const s=process.argv[1];const d=new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),+s.slice(8,10),+s.slice(10,12),+s.slice(12,14))+3600000);console.log(d.toISOString().replace(/[-:T]/g,'').slice(0,14))" "$last")"
dir="apps/api/prisma/migrations/${stamp}_${name}"
mkdir -p "$dir"
npx prisma migrate diff --config apps/api/prisma.config.ts --from-config-datasource --to-schema apps/api/prisma/schema.prisma --script > "$dir/migration.sql"
if [ ! -s "$dir/migration.sql" ] || grep -q "empty migration" "$dir/migration.sql"; then
  rm -rf "$dir"; echo "No schema changes."; exit 0
fi
echo "Created $dir"
