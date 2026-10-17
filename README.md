# FamilyLink

**Status:** implementation started. Staff authentication and the Thai login interface are implemented; member intake and course workflows are tracked separately in the [progress checklist](docs/plans/2026-10-17-poc-roadmap.md).

---

## Current Features

- [x] **Staff access:** email/password login, logout, inactivity expiry and account disabling.
- [x] **Permissions:** scoped staff/admin APIs, server-side sessions, CSRF checks and self/family review guard.
- [x] **Privacy foundation:** authenticated field encryption, organization-scoped citizen-ID index and metadata-only audits.
- [x] **Login UX:** Thai labels, large controls, password visibility, inline validation and recoverable errors.
- [ ] **Member intake and courses:** follow milestone checkboxes; the complete POC is not ready for real member data yet.

---

## Development Setup

**Requirements:** Node `22.22.3`, npm `12.2.0` and Docker. npm 10 has a confirmed Angular optional-peer-resolution failure; use the pinned project package-manager version without changing global npm.

1. **Install** dependencies and generate the database client:

   ```sh
   npx --yes npm@12.2.0 ci
   npm run db:generate
   ```

2. **Start synthetic PostgreSQL** and apply migrations:

   ```sh
   docker compose -f compose.test.yml up -d --wait
   npm run db:migrate:test
   ```

   **Test storage:** this container uses temporary storage and synthetic credentials. Its data disappears when the container is recreated; use it only for development/tests.

3. **Configure** a local `.env` from `.env.example` if it does not exist. Generate three distinct values with `openssl rand -base64 32`, and place them in `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY` and `SESSION_SECRET`. Keep the file private; no default application secrets or staff password exist.
4. **Create first admin:** set your own `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and a password of at least 12 characters in `.env`, then run `npm run db:seed`. Remove the bootstrap password afterward. This command refuses to overwrite an existing active admin.
5. **Start** API and web:

   ```sh
   npm run dev
   ```

   **Open:** `http://127.0.0.1:4200/staff/login`. The API runs on `127.0.0.1:3000`; the web development server proxies `/api`. Use the configured hostname so browser origin checks match.

---

## Verification

- **API:** `npm test` — real PostgreSQL integration tests, crypto, configuration and startup checks.
- **Browser:** run `npx playwright install chromium` once, then `npm run test:e2e` — real API/web login, mobile layout and accessibility checks.
- **Static/build:** `npm run lint`, `npm run typecheck`, `npm run build`.
- **Database:** tests use isolated organizations in `familylink_test`; browser fixtures are explicitly synthetic and require that dedicated test database. They never bootstrap production credentials.
- **Runtime dependencies:** latest check reports zero runtime advisories. An unresolved moderate `sprintf-js` advisory remains in Jest-related development dependencies; do not apply the audit tool's incompatible forced downgrades.

---

## Design and Progress

- **Product:** `PRODUCT.md` records current audience and constraints.
- **UX evidence:** [staff login](docs/ux/staff-login.md) records the scoped Impeccable review.
- **Progress:** [roadmap checkboxes](docs/plans/2026-10-17-poc-roadmap.md) separate completed planning from verified implementation.
- **Specification:** `FamilyLink — System Design (POC).md` is authoritative. Every POC feature must be ready by **31 December 2026**.
