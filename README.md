# FamilyLink

**Status:** implementation started. Staff authentication and the Thai login interface are implemented; member intake and course workflows are tracked separately in the [progress checklist](docs/plans/2026-10-17-poc-roadmap.md).

---

## Current Features

All POC features are built and tested against development identities and simulated delivery. Real LINE and email delivery, the production server and staff acceptance still need FamilyLink's accounts and a dry run (see `docs/operations/runbook.md` §9).

- **Staff access:** login, roles, accounts page (add, disable, link a staff member's own member record), 30-minute sessions.
- **Members:** paper intake, search with membership filters, LINE sign-up and "add family member", browser invites, link QR, review queue for name+birth-date matches, profile corrections with approval, caregiver unlink, documents (consent first, watermark, encrypted, admin-only contents), case notes with history.
- **Courses:** courses → runs → sessions, six question types and a shared library, whole-run or per-session registration, approval, seats, waitlist with auto-promotion and cutoff, cancel/reschedule rules, capacity floor, walk-ins, attendance, printable forms.
- **Staff operations:** dashboard, phone attendance roster, paid membership records (offline payments, expiry, renewal, void), role-safe Excel exports, organization settings.
- **Messages:** outbox worker with retries, LINE → email → staff follow-up, grouped 09:00 reminders, quota view; simulated delivery in development (messages are readable on the Notifications page).
- **Operations:** Docker Compose stack (only Caddy public), backups and restore rehearsal scripts, release check.

---

## Try everything in one go (development)

1. Start the dev database and PDF service: `docker compose -f compose.test.yml up -d --wait` and `docker compose -f compose.pdf.test.yml up -d --build`.
2. `npm run db:migrate:test`, then add placeholder reference data: `npm run db:demo` (services, document types). For a ready-made sample course with three runs, tiers and members: `npm run db:demo:sample`.
3. `npm run demo` (same as `npm run dev` with the development identity switch on). Open `http://127.0.0.1:4200/staff/login` for staff.
4. Members: open `http://127.0.0.1:4200/member/dev` and pick a simulated LINE account (A, B, C or your own). One simulated account is one LINE account and can manage several family members. A staff **invite link** (สร้างลิงก์สมัคร) opens signup without any LINE account.
5. Messages that would go to LINE/email appear on **ข้อความแจ้งเตือน** (the worker runs every 15 seconds).
6. The sample "run that studies today" has registration already closed on purpose: use **รับลงทะเบียนหน้างาน** to try walk-ins, then **เช็คชื่อ**.

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

- **API:** `npm test` — real PostgreSQL integration tests (isolation, concurrency, deadlines, delivery against local HTTP stubs, retention, production config).
- **Browser:** run `npx playwright install chromium` once, then `npm run test:e2e` — every workflow through the real screens, phone layouts and automated accessibility checks. `tests/e2e/poc-acceptance.spec.ts` is the whole POC in one run.
- **Release:** `npm run release:check` runs all of the above plus the production build, compose validation and a secrets scan.
- **Static/build:** `npm run lint`, `npm run typecheck`, `npm run build`.
- **Database:** tests use isolated organizations in `familylink_test`; browser fixtures are explicitly synthetic and require that dedicated test database. They never bootstrap production credentials.
- **Runtime dependencies:** latest check reports zero runtime advisories. An unresolved moderate `sprintf-js` advisory remains in Jest-related development dependencies; do not apply the audit tool's incompatible forced downgrades.

---

## Design and Progress

- **Product:** `PRODUCT.md` records current audience and constraints.
- **UX evidence:** [staff login](docs/archives/ux/staff-login.md) records the scoped Impeccable review.
- **Progress:** [roadmap checkboxes](docs/plans/2026-10-17-poc-roadmap.md) separate completed planning from verified implementation.
- **Specification:** `FamilyLink — System Design (POC).md` is authoritative. Every POC feature must be ready by **31 December 2026**.
