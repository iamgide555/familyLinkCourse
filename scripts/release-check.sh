#!/bin/sh
# Everything that must pass before a release is deployed. Stops at the first failure.
set -eu
step() { printf '\n== %s\n' "$1"; }
step "lint";            npm run lint
step "typecheck";       npm run typecheck
step "API integration"; npm run test:integration
step "build";           npm run build
step "browser: whole POC acceptance flow"; npm run test:e2e -- tests/e2e/poc-acceptance.spec.ts
step "browser: all suites"; npm run test:e2e
step "compose configuration"
TEMP_ENV=0
if [ ! -f .env.production ]; then cp .env.production.example .env.production; TEMP_ENV=1; fi
cleanup() { if [ "$TEMP_ENV" = "1" ]; then rm -f .env.production; fi; }
trap cleanup EXIT
DOMAIN=familylink.example.test POSTGRES_PASSWORD=x APP_DB_PASSWORD=x BACKUP_DIR=/tmp RCLONE_CONFIG_DIR=/tmp docker compose -f compose.yml config --quiet
echo "compose.yml is valid"
step "secrets are not tracked"
if git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'; then echo "A real .env file is tracked by Git." >&2; exit 1; fi
if git grep -nE '(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----)' -- . ':!docs' >/dev/null 2>&1; then echo "A key-like secret is in the repository." >&2; exit 1; fi
echo "no tracked secrets found"
printf '\nRelease checks passed. Deploy only this verified build; real-data use still needs the launch inputs in docs/operations/runbook.md.\n'
