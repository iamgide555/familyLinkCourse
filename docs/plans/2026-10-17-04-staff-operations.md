# Staff Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** staff operate session attendance, paid membership records, dashboards, filters and role-safe Excel exports.

**Architecture:** attendance reads authoritative booking/session states; membership records are informational and never gate registration. Server-side report projections reuse permission policies and referenced booking snapshots. Extend staff pages without adding another data store.

**Tech Stack:** roadmap stack; streamed XLSX generation; decimal money storage; existing Gotenberg form service.

**Spec:** `FamilyLink — System Design (POC).md`, sections 1, 3, 5–7, 9; depends on M1–M3.

---

## Global Constraints

- **Inherited:** roadmap constraints, actor/audit contracts and M3 booking state ownership apply.
- **Attendance:** manual present/absent per session, walk-in auto-present today only; dashboard and export required by **31 December 2026**.
- **Membership:** payment occurs offline; expiry preserves paid tier/history, displays **Expired** and does not block course registration.
- **Payment permissions:** staff/admin record; admin alone edits/voids and manages tiers/fees.
- **Export:** staff exclude sensitive columns/custom answers; admin sensitive exports and every export/print are audited.

---

## Review Focus

- **Unmarked attendance:** distinct from absent so counts do not invent absence; T1.
- **Cancelled/rescheduled session:** cancelled blocks marking; reschedule preserves prior history; T1.
- **Expired/lifetime/voided payments:** recomputation preserves correct tier and history; T2.
- **Formula-like or long Thai cells:** exported as text without execution or truncation; T3.
- **Mixed snapshot versions:** per-session exports keep the right answers per entry; T3.

---

## 1. File Map and Interfaces

- **API:** extend `apps/api/src/attendance/attendance.service.ts`; create `attendance/attendance.controller.ts`, `dashboard/dashboard.service.ts`, `memberships/memberships.service.ts`, `memberships/memberships.controller.ts`, `reports/reports.service.ts`, `reports/export-policy.ts`, `settings/settings.service.ts`, `settings/settings.controller.ts`.
- **Contracts:** `packages/contracts/src/attendance.ts`, `memberships.ts`, `reports.ts`, `settings.ts`; extend member/organization schemas and existing feature settings.
- **Web:** `apps/web/src/app/staff/attendance/`, `staff/dashboard/`, `staff/memberships/`, `staff/reports/`, `staff/settings/`; extend member profile and run print action.
- **Attendance:** `Attendance.mark(actor:StaffActor,sessionId:Id,memberId:Id,status:'present'|'absent'):Promise<void>`; `Attendance.roster(actor:StaffActor,sessionId:Id):Promise<AttendanceRow[]>`; row includes booking status and nullable attendance.
- **Membership:** `Memberships.record(actor:StaffActor,memberId:Id,input:PaymentInput):Promise<MembershipRecord>`; `correct(actor:StaffActor,paymentId:Id,input:PaymentCorrection):Promise<void>`; `void(actor:StaffActor,paymentId:Id,reason:string):Promise<void>`; `recompute(tx:Tx,memberId:Id,now:Date):Promise<void>`.
- **Reports:** `Reports.exportMembers(actor:StaffActor,filter:MemberFilter,includeSensitive:boolean):Promise<Readable>`; `Reports.exportRun(actor:StaffActor,runId:Id,includeSensitive:boolean):Promise<Readable>`; `Dashboard.summary(actor:StaffActor,range:DateRange):Promise<DashboardSummary>`. Define DTOs/results in owning contract files.

---

## 2. Tasks

### M4-T1: Attendance, Dashboard and Run Form Printing

**Files:** attendance/dashboard feature files and contracts above, run print UI; tests `apps/api/test/attendance.integration.spec.ts`, `dashboard.integration.spec.ts`, `tests/e2e/session-attendance.spec.ts`.

**Interfaces:** consumes M3 `Attendance.markInTransaction`, authoritative status and M1 `Forms.renderSignup`; produces roster/mark/summary methods above and run action selecting unsigned members for batch print.

- [ ] **Step 1 — Write failing tests:** `unmarked_is_not_absent`, `waitlisted_or_pending_member_cannot_be_marked_present`, `cancelled_session_rejects_attendance`, `walkin_marks_only_today`, `dashboard_counts_independent_sessions`. A cancelled whole-run registration retains already recorded past attendance.

```ts
expect(roster.unmarked).toBe(1);
expect(roster.absent).toBe(0);
expect(waitlistedAttendance.status).toBe(409);
expect(cancelledSessionAttendance.status).toBe(409);
expect(summary.attended).toBe(actualPresentRecords);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/attendance.integration.spec.ts` and `npm run test:api -- test/dashboard.integration.spec.ts`; expect invalid booking eligibility/count assertions to fail.
- [ ] **Step 3 — Implement:** phone-friendly confirmed roster with present/absent controls and explicit unmarked state, actor/time metadata, duplicate-safe unique member/session marking and scoped logs. Reject non-confirmed and cancelled eligibility; preserve attendance history when future course withdrawal happens. Add dashboard submitted/confirmed/waitlisted, attended vs registered, unsigned forms, pending reviews and failed-message-follow-up slots. Run print selects unsigned members and invokes existing renderer; signature receipt remains explicit. Dashboard denominators clearly distinguish reservations from attendance.
- [ ] **Step 4 — Verify:** run both API suites and `npm run test:e2e -- tests/e2e/session-attendance.spec.ts`; expect readable mobile roster, saved marks after reload, accurate dashboard across both modes and printable unsigned forms with blank case-note section.
- [ ] **Step 5 — Commit:** scoped attendance/dashboard/UI files; commit `feat: operate attendance and staff dashboard`.

### M4-T2: Offline Paid Membership and Renewal Records

**Files:** membership feature/contract/web files above; extend schema/seed; tests `apps/api/test/memberships.integration.spec.ts`, `tests/e2e/membership-renewal.spec.ts`.

**Interfaces:** consumes scoped members, clock, audit; produces membership methods above and tier configuration. `PaymentInput` includes tier, explicit start/expiry, amount, paid date, method, optional receipt and note; money uses decimal representation, never floating-point sums. Lifetime tier expiry is null.

- [ ] **Step 1 — Write failing tests:** `expired_paid_tier_is_preserved`, `lifetime_has_no_expiry`, `staff_cannot_correct_or_void_payment`, `admin_void_recomputes_current_tier`, `expired_member_can_register`. Use two successive payments and void the latest; verify both payment records remain.

```ts
expect(expiredMember.currentTierId).toBe(paidTier.id);
expect(expiredMember.membershipStatus).toBe('expired');
expect(lifetime.expiresAt).toBeNull();
expect(staffVoid.status).toBe(403);
expect(expiredMemberRegistration.status).toBe(201);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/memberships.integration.spec.ts`; expect expiry/role assertions to fail.
- [ ] **Step 3 — Implement:** default general tier, admin tier/fee/duration configuration, staff record/renew screen and member payment history. Preserve previous payments; staff enter explicit renewal expiry rather than inventing a roll-forward rule. Admin corrections/voids require logged metadata/reason. Recompute denormalized tier from latest effective, non-voided record ordered by start, payment date and ID; retain expired tier, display expiry separately. Support active/expired/next-30-days filters and monthly totals excluding voided payments. Tier names/fees for real use must come from FamilyLink, not test fixtures.
- [ ] **Step 4 — Verify:** run API test and `npm run test:e2e -- tests/e2e/membership-renewal.spec.ts`; expect complete upgrade → expiry → renewal → admin void history, deterministic current tier, lifetime behavior, exact money totals and no course eligibility changes.
- [ ] **Step 5 — Commit:** scoped membership/schema/UI files; commit `feat: record offline membership payments and renewals`.

### M4-T3: Role-Safe Excel, Filters and Organization Settings

**Files:** reports/export-policy/settings files and contracts above, web report/settings pages; tests `apps/api/test/reports.integration.spec.ts`, `settings.integration.spec.ts`, `tests/e2e/report-export.spec.ts`.

**Interfaces:** consumes member/booking/attendance/membership read models and audit; produces export methods above, `Settings.update(actor:StaffActor,patch:OrganizationSettingsPatch):Promise<void>`. Settings include service/document types, consent versions, PDF/message templates, membership tiers and optional retention values; existing feature services own validation.

- [ ] **Step 1 — Write failing tests:** `staff_export_excludes_sensitive_columns_and_answers`, `admin_sensitive_export_is_logged`, `per_session_export_uses_own_snapshot`, `formula_prefix_is_exported_as_text`, `staff_cannot_change_org_settings`. Seed Thai long text and values starting `=`, `+`, `-`, `@`; parse generated XLSX instead of asserting only download success.

```ts
expect(staffHeaders).not.toContain('citizen_id');
expect(staffHeaders).not.toContain(sensitiveQuestion.id);
expect(parsedFormulaCell.type).toBe('string');
expect(sessionTwoAnswers).toEqual(sessionTwoSnapshot.answers);
expect(exportAuditCount).toBe(1);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/reports.integration.spec.ts`; expect sensitive/header/snapshot assertions to fail.
- [ ] **Step 3 — Implement:** member search/filter export in section 7 form order, tier/expiry/status columns, registration statuses, attendance and custom question columns keyed by stable run-question IDs. Use per-member/session rows where mode requires it, preserving each referenced snapshot. No document content or unauthorized note history enters exports. Staff cannot request sensitive columns by forging flags; admin opts in and is audited. Stream on demand without permanent files, preserve Thai and escape formula-like text. Admin-only versioned consent, bounded escaped templates and organization lookup/retention settings; template edits cannot enable arbitrary script/external fetch or leak restricted fields. Show available filters, download scope and audit result in staff UI.
- [ ] **Step 4 — Verify:** run reports/settings API suites, `npm run test:e2e -- tests/e2e/report-export.spec.ts`, lint/typecheck/build; expect both-role exports correct after reload, safe text cells, current membership filters/monthly totals and no persistent generated XLSX files.
- [ ] **Step 5 — Commit:** scoped reporting/settings/UI files; commit `feat: add role safe exports and organization settings`.

---

## 3. Milestone Gate

- [ ] **Demonstrate:** phone attendance, run unsigned-form batch print, staff dashboard, upgrade/renew/void, expiring-member filters, and separate staff/admin exports.
- [ ] **Website completion:** all POC website workflows work with development identities and simulated delivery; real LINE/email and operational proof remain M5.
