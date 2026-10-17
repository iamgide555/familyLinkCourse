# FamilyLink POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deliver every approved POC feature, deployed and accepted through a staff dry-run by **31 December 2026**.

**Architecture:** one Angular application serves staff and LINE member routes; a NestJS modular API owns PostgreSQL, encrypted local files, PDFs and outbound integrations. Build complete website workflows with development-only member identities and simulated delivery, then replace those adapters with real LINE and email integrations. Keep seat mutations, snapshots, audits and notification creation within database transactions.

**Tech Stack:** Angular, NestJS, Prisma, PostgreSQL 16, TypeScript, npm workspaces, Jest API tests, Playwright browser tests, Docker Compose, Caddy, Gotenberg, Sarabun, `@nestjs/schedule`, `pg_dump`, `rsync`, `rclone crypt`.

**Spec:** `FamilyLink — System Design (POC).md`, updated **17 October 2026**; authoritative for product behavior. Read this roadmap and the relevant milestone plan together.

---

## Progress Checklist

**Updated:** 17 October 2026. **Implementation:** 0 of 18 tasks verified complete. Check a build task only after its implementation and verification steps pass; update this summary alongside the detailed task checkboxes.

### Planning

- [x] **Spec:** resolve and patch the five reviewed gaps.
- [x] **Deadline:** require all POC features ready by 31 December 2026.
- [x] **Plans:** write roadmap and five milestone plans.
- [x] **Document checks:** verify headings, task steps, interfaces and plan links.
- [ ] **Execution handoff:** review plan and select native or subagent-driven execution.

### M1: Staff Intake — 0 of 4

**Details:** [Staff intake plan](2026-10-17-01-staff-intake.md).

- [ ] **M1-T1:** authenticated staff shell and protected persistence.
- [ ] **M1-T2:** paper intake, member search, profiles and configuration.
- [ ] **M1-T3:** case notes with encrypted revisions.
- [ ] **M1-T4:** printable signup form and signature receipt.

### M2: Member Self-Service — 0 of 4

**Details:** [Member self-service plan](2026-10-17-02-member-self-service.md).

- [ ] **M2-T1:** signup, invites, match queue and simulated identity.
- [ ] **M2-T2:** upload consent, processing and document permissions.
- [ ] **M2-T3:** staff review, caregiver links and profile changes.
- [ ] **M2-T4:** complete signup and family profile screens.

### M3: Course Booking — 0 of 4

**Details:** [Course booking plan](2026-10-17-03-course-booking.md).

- [ ] **M3-T1:** course, run, session and question configuration.
- [ ] **M3-T2:** transactional registration, approval and snapshot versions.
- [ ] **M3-T3:** cancellation, rescheduling and safe capacity changes.
- [ ] **M3-T4:** atomic walk-in intake, booking and today's attendance.

### M4: Staff Operations — 0 of 3

**Details:** [Staff operations plan](2026-10-17-04-staff-operations.md).

- [ ] **M4-T1:** attendance, dashboard and run form printing.
- [ ] **M4-T2:** offline paid membership and renewal records.
- [ ] **M4-T3:** role-safe Excel, filters and organization settings.

### M5: Integration and Launch — 0 of 3

**Details:** [Integration and launch plan](2026-10-17-05-integration-and-launch.md).

- [ ] **M5-T1:** real LINE identity, menus and webhooks.
- [ ] **M5-T2:** outbox delivery, fallback, reminders and staff follow-up.
- [ ] **M5-T3:** deployment, recovery, cleanup and staff acceptance.

### Final Acceptance

- [ ] **Staff dry-run:** exercise every POC area and resolve workflow blockers.
- [ ] **Ready for real use:** all POC features and launch prerequisites complete by 31 December 2026.

---

## Global Constraints

- **Deadline:** “Every POC feature must be complete, tested with staff and ready for real use by **31 December 2026**.”
- **Member boundary:** “Browser invites grant sign-up access only.” Production profile/course access requires real server-verified LINE identity.
- **Seats:** “both `submitted` and `confirmed` consume seats.” Per-session outcomes remain independent.
- **Isolation:** “every table except `organizations` carries `organization_id`; every query is scoped by it.”
- **Documents:** uploaded contents, download, verification and deletion are admin-only; signed-form scan upload is admin-only. All online document types require explicit sensitive-data consent before accepting files; no upload means no sensitive-data consent prompt.
- **History:** case-note revisions and registration snapshots retain encrypted sensitive values; audit logs contain metadata and changed field names only.
- **Time:** business dates and scheduled jobs use `Asia/Bangkok`; reminders run daily at `09:00`; backups at `02:00`.
- **Scope exclusions:** QR check-in, certificates, spreadsheet import, standalone member login, interest invitations, partner NGOs, billing and payment processing stay after POC.

---

## Review Focus

- **Cross-organization IDs:** composite foreign keys and actor-derived scopes prevent a valid ID from another organization bypassing permissions; covered in M1-T1/M1-T2.
- **Concurrent last-seat submissions:** separate PostgreSQL connections cannot overbook or allocate one queue entry twice; covered in M3-T2/M3-T3.
- **Token consumption retries:** competing invite/link requests produce one outcome, and production rejects development identity headers; covered in M2-T1/M2-T3/M5-T1.
- **State changed before delivery:** a cancellation, LINE reassignment or reschedule between enqueue and send removes stale recipient/items; covered in M5-T2.
- **Thai document/export content:** long Thai names, multipage forms and spreadsheet formula prefixes remain usable without leaking restricted values; covered in M1-T4/M4-T3.

---

## 1. Current Workspace and Builder Calls

- **Observed:** production application and Git repository do not exist; `prototype/` contains synthetic static screens. Preserve prototype files as visual references, including local Sarabun/Kanit fonts. Never copy prototype localStorage persistence into production.
- **Plan location:** `docs/plans/`; do not restore discarded `docs/superpowers/` plans. No packages, Git repository or production files are created by writing these documents.
- **Engineering calls:** npm workspaces at `apps/api` and `apps/web`; feature-owned modules; API contract types in `packages/contracts/src/`; Jest integration tests against actual PostgreSQL 16; Playwright for complete browser workflows. These are builder choices, not additional user requirements.
- **Runtime versions:** at execution, check official Angular/NestJS/Prisma compatibility against installed Node, select compatible supported releases and commit exact lockfile versions. No unverified version claim is made here.
- **Staff auth call:** opaque server-side sessions, `HttpOnly`/`Secure`/`SameSite=Lax` cookie, CSRF check on mutating browser requests, Argon2 password hashing, 30-minute inactivity expiry, login rate limit. Disabling a user revokes sessions immediately.
- **API convention:** `/api`; JSON errors `{code, message, fields?}`; ISO timestamps in UTC, local business-date conversion on server. Validation and authorization always run server-side.
- **Transaction call:** `Tx` means the active Prisma transaction client; `RunLock.withRun<T>(orgId, runId, fn: (tx: Tx) => Promise<T>): Promise<T>` uses a parameterized PostgreSQL row lock. Every seat/queue/capacity mutation shares this lock.
- **Schema translation:** export `Tx` from `apps/api/src/database/prisma.service.ts`. Normalize conceptual `org_id` fields to `organization_id`; include it on every child/join table with scoped foreign keys. Add explicit run/session cancellation and rescheduling state, actor type alongside polymorphic actor IDs, signup draft/held-file ownership, pending-applicant notification recipients, notification fallback links/leases and idempotent operation records. These implement existing behavior; they are not additional product features.
- **Consent refusal call:** refusing upload consent prevents file transmission; the applicant may omit attachments and finish signup. Staff/admin handle later consent withdrawal through the existing privacy-request workflow and append-only consent records; no automatic member deletion is inferred.
- **Whole-run cutoff call:** with no explicit close time, automatic promotion ends one day before the earliest non-cancelled session in the run. Per-session pools use their own session start. This resolves the spec's singular “session” fallback without changing its run-wide self-cancel deadline.
- **Access-removal call:** removing a member from one's own LINE switcher revokes that LINE account's link; it never assigns a new caregiver/account. Staff still handle all reassignment. No new independent access-grant system.
- **Deletion call:** soft deletion preserves historical references; cancellation policies stop active operational effects before course/run removal from active lists. Retention purge handles actual removal when policy permits. No merge/import project is added.
- **Registration export call:** per-session exports use one member/session row and that entry's referenced snapshot, so mixed snapshot versions cannot overwrite each other.

---

## 2. Shared Contracts and Commands

- **Shared types:** `Id = string`; `Role = 'admin' | 'staff'`; `BookingStatus = 'submitted' | 'confirmed' | 'waitlisted' | 'rejected' | 'cancelled'`. Declare them in `packages/contracts/src/core.ts`.
- **Actor:** `StaffActor = {kind:'staff', organizationId:Id, userId:Id, role:Role, memberId:Id|null}`; `MemberActor = {kind:'member', organizationId:Id, lineAccountId:Id}`; `Actor = StaffActor | MemberActor | {kind:'system', organizationId:Id}`. Never accept organization or actor identity from untrusted request fields.
- **Requests:** define feature DTOs in `packages/contracts/src/<feature>.ts` when their owning task starts; runtime validation is performed by the API, independent of TypeScript types.
- **Checks:** M1-T1 establishes root commands `npm run test:api -- <test-path>`, `npm run test:e2e -- <spec-path>`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run db:migrate:test`, and `npm run dev`. API test paths are relative to `apps/api`; browser paths relative to root.
- **Tests:** use real PostgreSQL transactions for concurrency/isolation; injected fixed clocks for deadlines/retries; synthetic fixtures only. RED steps must fail at behavior assertions, not merely missing imports, before implementation proceeds.
- **Test commands:** `test:integration` includes every API integration suite against isolated PostgreSQL; `test:e2e` starts the API/web test stack and Playwright, with no live provider traffic by default. Actual provider smoke checks are explicitly manual in M5 and use designated synthetic recipients only.
- **Commits:** execution starts by initializing Git if still absent. Each task ends with a reviewed scoped commit containing only that task's files and schema changes; never stage prototype or unrelated documents accidentally.

---

## 3. Milestones and Target Dates

**Scheduling assumption:** these are proposed delivery targets, not capacity estimates; review actual pace after the first usable milestone. The end-of-year requirement stays fixed.

| Order | Working deliverable | Proposed target | Detailed plan |
| --- | --- | --- | --- |
| M1 | Staff log in, create/search/open paper member, write notes and print signup form | 30 Oct | [Staff intake](2026-10-17-01-staff-intake.md) |
| M2 | Website signup, invites, uploads, caregiver linking and profile review using simulated member identities | 13 Nov | [Member self-service](2026-10-17-02-member-self-service.md) |
| M3 | Courses, configurable questions, seats, approvals, queues, cancellations and walk-ins | 27 Nov | [Course booking](2026-10-17-03-course-booking.md) |
| M4 | Attendance, paid membership, dashboard and Excel exports | 4 Dec | [Staff operations](2026-10-17-04-staff-operations.md) |
| M5 | Real LINE/email integration, reliable reminders, deployment and restore proof | 18 Dec | [Integration and launch](2026-10-17-05-integration-and-launch.md) |
| Acceptance | Staff exercise every POC area; resolve workflow-blocking failures | Dry-run 19–23 Dec; ready by 31 Dec | M5-T3 |

**Dependencies:** execute M1 → M2 → M3 → M4 → M5. Each milestone delivers working software on prior milestones; no subsystem assumes another unpublished interface.

---

## 4. Feature Ownership

| Spec area | Owning tasks |
| --- | --- |
| Staff auth, roles, organization scoping, admin management, crypto/audit | M1-T1; verification throughout |
| Intake fields, matching, citizen-ID uniqueness, search, deletion requests | M1-T2; M2-T1/M2-T3 |
| Case notes/revisions, PDFs and signatures | M1-T3/M1-T4; run print action M4-T1 |
| Member signup, consent, invites, documents, approvals and caregiver access | M2-T1 through M2-T3 |
| Website participant/staff review workflows | M2-T4; extension in M3 |
| Courses/runs/sessions and shared questions | M3-T1 |
| Capacity, snapshots, approval, queues, rejoin | M3-T2 |
| Run edit locks, cancellation, rescheduling and promotion | M3-T3 |
| Atomic walk-in/member/booking/attendance | M3-T4 |
| Attendance/dashboard and paid membership | M4-T1/M4-T2 |
| Filters, exports and configurable organization templates/settings | M4-T3; settings established by owning features |
| LINE identity/rich menus/webhooks | M5-T1 |
| All operational messages, fallback, retries, reminders and follow-up | M5-T2; event creation from M2 onward |
| Hosting, monitoring, scheduled cleanup, backup, restore and acceptance | M5-T3 |

---

## 5. External Inputs and Launch Dependencies

- **Start collecting now:** LINE OA/Developer access and visible push quota; approved sender/domain; member form reference; six service labels; actual membership tiers/fees/renewal periods. These do not block the first staff workflow using synthetic fixtures.
- **Before live integration:** LINE channel IDs/secrets, LIFF configuration, guest/member menus, email sender verification and provider account. Use Resend as the initial email adapter; keep its interface replaceable if FamilyLink selects Brevo.
- **Before real data:** completed/reviewed paperwork, confirmed processing basis and privacy contact, DPA extension, real membership values, deployment secrets and key-recovery copies. Record sign-off; do not claim document drafting constitutes legal approval.
- **Retention:** support organization settings; inactive purge remains the documented default while retention is unset. Rejected/abandoned signup requests and held uploads still expire after 30 days as explicitly required.
- **Form/reference detail:** map actual Part 1/2 fields and service labels before M1-T2 is accepted; do not invent live labels from prototype placeholders. Synthetic labels allow development to continue while obtaining originals.
- **No outbound messages to FamilyLink:** this plan records dependencies only; staff outreach needs separate user instruction.

---

## 6. Execution and Acceptance

- [ ] **Review engineering calls:** confirm roadmap and milestone scope, then choose native or subagent-driven execution.
- [ ] **Execute M1 first:** first result is login → create paper member → search → open profile → print; no standalone bootstrap milestone.
- [ ] **Review each milestone:** run its named automated checks and demonstrate its complete workflow using synthetic data.
- [ ] **Finish all milestones:** replace simulated integrations, run cross-role browser tests, and complete deployment/restore proof.
- [ ] **Accept in December:** record staff dry-run results and resolve all failures that block an approved POC workflow before **31 December 2026**. Early-2027 course feedback is follow-up.
