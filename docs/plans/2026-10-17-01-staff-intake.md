# Staff Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** staff can log in, create/search/open a paper member, record case notes and print a signup form.

**Architecture:** establish the workspace through this usable staff workflow. NestJS feature modules use actor-scoped Prisma repositories; Angular staff routes call the API. Database-backed sessions, encryption and audit helpers are shared infrastructure for subsequent milestones.

**Tech Stack:** roadmap stack; Argon2; server-side sessions; Gotenberg with Sarabun; Jest/PostgreSQL and Playwright.

**Spec:** `FamilyLink — System Design (POC).md`, sections 2–7, 9–10; read `docs/plans/2026-10-17-poc-roadmap.md` first.

---

## Global Constraints

- **Inherited:** all roadmap Global Constraints and Shared Contracts apply.
- **First workflow:** staff login → paper member creation → search → profile → print.
- **Permissions:** “Edit own case note (24 h window)”; “Only admins may delete case notes.”
- **Signature:** unsigned status does not block future registration; printing alone never marks a signature received.
- **PDF:** include authorized intake fields, leave Part 3 blank, exclude stored documents, generate on demand and do not retain generated output.

---

## Review Focus

- **Disabled staff sessions:** immediate invalidation, including existing cookies; T1.
- **Cross-organization foreign IDs:** reject valid IDs from another organization; T1/T2.
- **Missing or changed citizen IDs:** nullable uniqueness and self-edit exclusion; T2.
- **Expired case-note edit windows:** exactly 24 hours from original creation, never renewed by edits; T3.
- **Long Thai form values:** no clipped labels/signature area or accidental document inclusion; T4.

---

## 1. File Map and Interfaces

- **Workspace:** `package.json`, `package-lock.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/contracts/package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `compose.test.yml`, `playwright.config.ts`.
- **API shell:** `apps/api/src/main.ts`, `app.module.ts`, `database/prisma.service.ts`, `config/config.ts`, `common/clock.ts`, `common/errors.ts`; `apps/api/prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`.
- **Contracts:** `packages/contracts/src/core.ts`, `members.ts`, `case-notes.ts`.
- **Features:** `apps/api/src/auth/`, `authorization/`, `crypto/`, `audit/`, `members/`, `case-notes/`, `forms/`; each owns its controller, service, DTO validation and tests.
- **Web:** `apps/web/src/app/app.routes.ts`, `core/api-client.ts`, `core/session.service.ts`, `staff/login/`, `staff/members/`, `staff/case-notes/`, `staff/settings/`; use focused component, template and stylesheet files within each feature.
- **Produced contracts:** `Clock.now(): Date`; `Authorization.requireRole(actor: Actor, roles: Role[]): void`; `Authorization.assertCanReview(tx: Tx, actor: StaffActor, memberId: Id): Promise<void>`; `Audit.record(tx: Tx, actor: Actor, event: AuditEvent): Promise<void>` where `AuditEvent={action:string, entity:string, entityId:Id, fields:string[]}`.
- **Crypto:** `FieldCrypto.encrypt(plain:string): EncryptedValue`, `decrypt(value:EncryptedValue):string`, `citizenIdIndex(orgId:Id, normalizedId:string):string`; `EncryptedValue={keyVersion:string, nonce:string, ciphertext:string, tag:string}`. Use separate encryption and HMAC keys, include organization context in blind index, authenticated encryption and fresh nonces.
- **Test support:** create `apps/api/test/test-app.ts` exposing `createTestApp(): Promise<{app: INestApplication, db: PrismaService, clock: MutableClock, close():Promise<void>}>`; `MutableClock.set(instant:string):void`. Tests seed users/actors directly into isolated synthetic organizations and log in through HTTP for cookies; no production test-login endpoint.

---

## 2. Tasks

### M1-T1: Authenticated Staff Shell and Protected Persistence

**Files:** create workspace/API shell, core contracts, auth/authorization/crypto/audit modules, schema, seed and web login/session files above; tests `apps/api/test/auth.integration.spec.ts`, `crypto.integration.spec.ts`, `tests/e2e/staff-login.spec.ts`.

**Interfaces:** consumes approved spec; produces shared contracts above, `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/health`, admin `/api/staff` management and member association. `SessionService.resolve(token:string):Promise<StaffActor|null>` checks expiry and active user on every request.

- [ ] **Step 1 — Define failing behavior tests:** name tests `disabled_user_cannot_reuse_session`, `member_actor_cannot_manage_staff`, `ciphertext_is_authenticated`, and `scoped_foreign_keys_reject_other_org`. Include CSRF and login-rate-limit assertions. Prepare two organizations and a previously issued staff cookie; disable that user, then request session with old cookie.

```ts
expect(disabledSession.status).toBe(401);
expect(memberStaffManagement.status).toBe(403);
expect(() => crypto.decrypt(tamperedCiphertext)).toThrow();
expect(crossOrganizationForeignKeyWrite).rejects.toThrow();
```

- [ ] **Step 2 — Establish runnable RED:** initialize Git if still absent, create workspace/config/test harness and minimal Nest/Angular shells; resolve compatible versions from official documentation and pin lockfile. Establish roadmap scripts and isolated PostgreSQL test database. Run `npm run test:api -- test/auth.integration.spec.ts`; expect failed authorization assertions before adding real auth behavior.
- [ ] **Step 3 — Implement protected shell:** create sessions table with hashed opaque tokens, expiry/revocation and organization/user references; users/organizations plus all-tenant composite keys. Implement password auth, cookie/CSRF protections, idle timeout, rate limiting, role guards, staff management and admin association of a user's own member record. Bootstrap first admin through a CLI/env secret, with no default password. Add encrypted value validation, audit field-name allow-list and sanitized errors. Serve Thai staff navigation/login and session expiry feedback.
- [ ] **Step 4 — Verify:** run `npm run test:api -- test/auth.integration.spec.ts`, `npm run test:api -- test/crypto.integration.spec.ts`, `npm run test:e2e -- tests/e2e/staff-login.spec.ts`, `npm run typecheck`, `npm run build`; expect passing login/logout/disable/role/isolation checks and successful builds. Verify production refuses missing encryption/session secrets.
- [ ] **Step 5 — Commit:** stage only new workspace infrastructure and auth files; commit `feat: add protected staff application shell`.

### M1-T2: Paper Intake, Search, Member Profiles and Configuration

**Files:** create `apps/api/src/members/members.service.ts`, `members.controller.ts`, `member-matching.ts`, `members.repository.ts`, `member-validation.ts`, `reference-data.service.ts`; corresponding `packages/contracts/src/members.ts`; web `staff/members/`, `staff/settings/`; modify schema/seed; tests `apps/api/test/members.integration.spec.ts`, `tests/e2e/staff-intake.spec.ts`.

**Interfaces:** consumes `StaffActor`, crypto/audit/authorization; produces `Members.createPaper(tx:Tx, actor:StaffActor, input:StaffIntakeInput):Promise<MemberRecord>`, `Members.findCandidates(tx:Tx, orgId:Id, name:MemberName, birthDate:string):Promise<Id[]>`, `Members.getParticipantView(actor:MemberActor, memberId:Id):Promise<ParticipantProfile>`. Define `StaffIntakeInput`, `MemberName`, `MemberRecord`, `ParticipantProfile` in `members.ts`; participant shape includes only section 3 allowed fields.

- [ ] **Step 1 — Write failing tests:** `same_name_and_birth_date_requires_staff_choice`, `shared_phone_alone_creates_separate_patient`, `citizen_id_conflict_cannot_be_overridden`, `unchanged_own_id_is_not_duplicate`, `other_org_member_is_inaccessible`. Create caregiver and patient with different names/birth dates but same Thai mobile; also create an ID collision with a different name.

```ts
expect(sharedPhonePatient.status).toBe(201);
expect(nameAndBirthMatch.body.code).toBe('MEMBER_REVIEW_REQUIRED');
expect(idConflict.body.code).toBe('CITIZEN_ID_EXISTS');
expect(otherOrgProfile.status).toBe(404);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/members.integration.spec.ts`; expect failed matching/uniqueness assertions.
- [ ] **Step 3 — Implement intake:** map every field group in section 7 and the actual Part 1/2 form into typed fields/options; normalize titles/whitespace for first/last-name-plus-birth-date matching. Require explicit staff existing/new choice and reason for pair match; no phone-only warning; enforce citizen-ID HMAC unique per organization even under concurrent insert. Allow missing IDs and incomplete profiles. Add valid Thai phone/check-digit/birth/address validation, caregiver/emergency relations, service/document-type settings and source. Implement scoped search by name/phone/member number, pagination and profile with decrypted staff-authorized fields; sensitive views audited. Admin soft deletion and logged PDPA access/deletion request workflow exclude records from active search while preserving required history; no merge. Populate reference data from verified sources/form, with synthetic fixtures until original labels arrive.
- [ ] **Step 4 — Verify:** run API test above and `npm run test:e2e -- tests/e2e/staff-intake.spec.ts`; expect create → search → open to work after reload, missing ID accepted, invalid Thai inputs rejected, staff unable to delete, and cross-organization IDs hidden. Confirm household/disability/ID sensitive values are ciphertext in DB.
- [ ] **Step 5 — Commit:** scoped member/schema/web files; commit `feat: add staff member intake and search`.

### M1-T3: Case Notes with Encrypted Revisions

**Files:** create `apps/api/src/case-notes/case-notes.service.ts`, `case-notes.controller.ts`, `packages/contracts/src/case-notes.ts`, web `staff/case-notes/`; modify schema; test `apps/api/test/case-notes.integration.spec.ts`.

**Interfaces:** consumes actor, clock, crypto and audit; produces `CaseNotes.create(actor:StaffActor, memberId:Id, body:string):Promise<CaseNote>`, `edit(actor:StaffActor, noteId:Id, body:string):Promise<CaseNote>`, `history(actor:StaffActor, noteId:Id):Promise<CaseNoteRevision[]>`, `delete(actor:StaffActor, noteId:Id):Promise<void>`. Define both returned types in `case-notes.ts`.

- [ ] **Step 1 — Write failing tests:** `revision_keeps_previous_text_encrypted`, `edit_does_not_restart_24_hour_window`, `cannot_edit_another_author`, `history_never_reaches_participant`. Set clock to creation plus exactly 24 hours; editing is denied. Editing at 23 hours does not extend deadline.

```ts
expect(history.map(r => r.body)).toEqual(['original', 'corrected']);
expect(editAt24Hours.status).toBe(403);
expect(participantHistory.status).toBe(403);
expect(JSON.stringify(auditRows)).not.toContain('corrected');
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/case-notes.integration.spec.ts`; expect revision/access assertions to fail.
- [ ] **Step 3 — Implement:** create current note and initial revision atomically; append encrypted revision and update current note on each allowed edit. Use original creation time for 24-hour check; preserve parent access/deletion/retention rules. Show history and author/time in staff profile; participants receive no note route or serialized note fields. Log sensitive history views and edit metadata without text.
- [ ] **Step 4 — Verify:** run same test; expect complete history, encrypted database text, admin-only soft deletion, concurrent edits producing distinct versions, and exact edit deadline enforcement.
- [ ] **Step 5 — Commit:** scoped case-note files; commit `feat: preserve encrypted case note history`.

### M1-T4: Printable Form and Signature Receipt

**Files:** create `apps/api/src/forms/forms.service.ts`, `forms.controller.ts`, `templates/signup-form.html`, `apps/api/test/forms.integration.spec.ts`, `tests/e2e/signup-form.spec.ts`, `infra/pdf/Dockerfile`; add staff profile print/signature controls; copy required licensed font assets from `prototype/fonts/` into production assets.

**Interfaces:** consumes authorized member reads and audit; produces `Forms.renderSignup(actor:StaffActor, memberIds:Id[]):Promise<Buffer>`, `Forms.markSigned(actor:StaffActor, memberId:Id, receivedAt:string):Promise<void>`; endpoints `POST /api/forms/signup`, `POST /api/members/:id/signature-receipt`. Use Gotenberg only through API.

- [ ] **Step 1 — Write failing tests:** `form_has_intake_but_blank_part_three`, `print_does_not_mark_signed`, `long_thai_values_render_without_clipping`. Seed long Thai names/addresses, missing fields, note text and an uploaded-file sentinel; verify extracted PDF text and rendered pages.

```ts
expect(pdfText).toContain(member.firstName);
expect(pdfText).not.toContain(caseNote.body);
expect(pdfText).not.toContain(documentSentinel);
expect(memberAfterPrint.signedFormAt).toBeNull();
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/forms.integration.spec.ts`; expect missing/incorrect form and signature assertions.
- [ ] **Step 3 — Implement:** reproduce actual signup layout with Sarabun, blank absent values and Part 3, stable page breaks and signature areas. Escape HTML member content, disable arbitrary external renderer URLs, stream generated PDF without retaining it. Mark signed only on explicit staff receipt action; log all prints and receipt updates.
- [ ] **Step 4 — Verify:** run API test and `npm run test:e2e -- tests/e2e/signup-form.spec.ts`; inspect rendered PDF pages at normal and long-value fixtures. Expect readable Thai, complete signature area, successful print and explicit receipt status after reload. No generated PDF remains in persistent storage.
- [ ] **Step 5 — Commit:** scoped form/font/container files; commit `feat: print member signup forms and record receipt`.

---

## 3. Milestone Gate

- [ ] **Automated:** all M1 tests plus lint/typecheck/build pass; record commands and results.
- [ ] **Demonstration:** authorized staff login → paper intake → shared-phone patient → search/profile → note revision → print → record signature; admin demonstrates staff disabling and deletion permission.
- [ ] **Delivery limit:** member self-service and production integrations begin in later milestones; only synthetic data is used until launch prerequisites are met.
