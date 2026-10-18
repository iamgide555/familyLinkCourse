#!/bin/sh
# Runs once when the database volume is first created. The API connects as `familylink_app`, which can read and
# write data but cannot create, alter or drop tables; schema changes use the owner role through the migrate step.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE familylink_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO familylink_app;
GRANT USAGE ON SCHEMA public TO familylink_app;
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO familylink_app;
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO familylink_app;
SQL
