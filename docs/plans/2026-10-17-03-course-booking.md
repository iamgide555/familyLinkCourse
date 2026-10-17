# Course Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** staff configure courses and runs; members register with correct seats, approvals, queues, snapshots, cancellations and walk-ins.

**Architecture:** one run-level PostgreSQL lock serializes all seat-affecting actions. Whole-run status lives on registration; per-session status lives on session entries. Every business mutation writes snapshots, audit metadata and outbox events in its database transaction; transport stays simulated until M5.

**Tech Stack:** roadmap stack; actual PostgreSQL 16 concurrency tests; injected clock; Angular course/registration screens.

**Spec:** `FamilyLink — System Design (POC).md`, sections 3–6, 8; depends on M1/M2.

---

## Global Constraints

- **Inherited:** roadmap constraints, actor types and `Outbox.enqueue` apply.
- **Seats:** `submitted` and `confirmed` reserve one seat; approval never reserves twice; other statuses reserve none.
- **Modes:** per-session pools/status/queue are independent; whole-run capacity covers every session.
- **Locks:** first saved booking, including pending/waitlisted, permanently locks mode, approval setting and session additions/deletions.
- **Cancellation:** one run-wide deadline from first session; rescheduling can extend cancellation up to seven days after change, capped at affected new start.
- **History:** rejoin reuses registration identity but creates a new immutable snapshot; unchanged session entries retain earlier references.

---

## Review Focus

- **Last-seat races and duplicate retries:** exactly one reservation per member/pool; T2.
- **Queue promotion racing walk-in/capacity edits:** no silent overbooking or unlogged queue bypass; T3/T4.
- **Boundary times:** exact registration/cancel/promotion/reschedule deadline enforcement in Bangkok; T2/T3.
- **Mixed states:** session-level approval/cancel/rejoin does not rewrite siblings or snapshots; T2/T3.
- **Run mutation after cancellation:** existing booking history still locks structural settings; T1/T3.

---

## 1. File Map and Interfaces

- **API:** `apps/api/src/courses/courses.service.ts`, `courses.controller.ts`, `questions/questions.service.ts`, `questions/question-validation.ts`, `bookings/run-lock.ts`, `bookings/bookings.service.ts`, `bookings/booking-policy.ts`, `bookings/queue.service.ts`, `bookings/snapshots.service.ts`, `bookings/cancellations.service.ts`, `bookings/walkins.service.ts`, `attendance/attendance.service.ts`.
- **Contracts:** `packages/contracts/src/courses.ts`, `questions.ts`, `bookings.ts`, `attendance.ts`; schema adds run/session cancellation state and reschedule timestamp/window, immutable snapshot references and idempotent operation keys.
- **Web:** `apps/web/src/app/staff/courses/`, `staff/registrations/`, `staff/walkins/`, `member/courses/`, `member/registrations/`; extend member profile registration list.
- **Booking DTOs:** `BookingInput={runId:Id, memberId:Id, sessionIds:Id[], answers:Record<Id,unknown>, operationKey:string}`; `PoolOutcome={sessionId:Id|null, status:BookingStatus|'refused', queuePosition:number|null}`; `BookingResult={registrationId:Id|null,outcomes:PoolOutcome[]}`; `CancelInput={registrationId:Id,sessionIds:Id[],reason:string,operationKey:string}`; `RunPatch` is allowlisted editable run fields.
- **Service boundary:** `Bookings.register(actor:StaffActor|MemberActor,input:BookingInput):Promise<BookingResult>`; internal `registerLocked(tx:Tx,actor:StaffActor|MemberActor,input:BookingInput):Promise<BookingResult>` requires caller to hold run lock; `Queue.fill(tx:Tx,orgId:Id,runId:Id,sessionId:Id|null,now:Date):Promise<void>`; `Cancellations.cancel(actor:StaffActor|MemberActor,input:CancelInput):Promise<void>`.
- **Deadlines:** `BookingPolicy.promotionCutoff(run:RunRecord, session:SessionRecord|null):Date`, `selfCancelDeadline(run:RunRecord, changedSession:SessionRecord|null):Date`; use roadmap's whole-run fallback and the spec's reschedule formula. Declare record/DTO types in `courses.ts`/`bookings.ts`.

---

## 2. Tasks

### Task 1: M3-T1 — Course, Run, Session and Question Configuration

**Files:** create courses/questions files and contracts above; modify schema; web course editor; tests `apps/api/test/course-configuration.integration.spec.ts`, `tests/e2e/create-run.spec.ts`.

**Interfaces:** consumes actor/audit; produces `Courses.createRun(actor:StaffActor,input:CreateRunInput):Promise<RunRecord>`, `Courses.updateRun(actor:StaffActor,runId:Id,patch:RunPatch):Promise<void>`, `Questions.validateAnswers(runQuestions:RunQuestion[],answers:Record<Id,unknown>):void`. Define inputs/records/question types in owning contracts; course/run delete endpoints are admin-only soft delete.

- [ ] **Step 1 — Write failing tests:** `run_copies_course_questions`, `later_library_edits_do_not_rewrite_run`, `first_waitlisted_booking_locks_structure`, `post_booking_optional_question_is_allowed`, `question_type_or_required_addition_is_blocked`. Test all six question types and required/options validation.

```ts
expect(copiedQuestion.label).toBe(originalLabel);
expect(lockedModeChange.status).toBe(409);
expect(optionalQuestionAddition.status).toBe(201);
expect(requiredQuestionAddition.status).toBe(409);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/course-configuration.integration.spec.ts`; expect copy/lock assertions to fail.
- [ ] **Step 3 — Implement:** reusable courses/service tags, runs with open/close/approval/waitlist/mode and sessions with capacity/date/time/location/online URL. Validate positive capacity and chronological dates/times. Library definitions copy to course and run; stable run-question IDs own exports. After first booking allow wording/reorder/optional append/options append only, block required additions/type/deletion; preserve snapshot definitions and sensitive flags. Apply run structural lock permanently; role-check soft deletion and preserve bookings/history. Build Thai run editor using prototype as visual reference and expose member-safe open run/session availability.
- [ ] **Step 4 — Verify:** run API suite and `npm run test:e2e -- tests/e2e/create-run.spec.ts`; expect usable run creation and question selection/order, no existing-run mutation from template changes, and structural lock after a booking later cancelled.
- [ ] **Step 5 — Commit:** scoped configuration files; commit `feat: configure courses runs and question forms`.

### Task 2: M3-T2 — Transactional Registration, Approval and Snapshot Versions

**Files:** create booking lock/service/policy/queue/snapshot files; contracts `bookings.ts`; modify schema; staff/member registration screens; tests `apps/api/test/booking-seats.integration.spec.ts`, `booking-snapshots.integration.spec.ts`, `tests/e2e/course-registration.spec.ts`.

**Interfaces:** consumes member ownership, question validation, audit/outbox; produces booking/lock/queue methods above and `Bookings.review(actor:StaffActor,registrationId:Id,sessionIds:Id[],approve:boolean):Promise<void>`. Whole-run calls use empty `sessionIds`; per-session calls explicitly select entries. One transition gets one stable event ID even on HTTP retry.

- [ ] **Step 1 — Write failing tests:** `two_requests_for_one_seat_do_not_overbook`, `approval_keeps_reserved_count`, `mixed_session_outcomes_are_independent`, `rejoin_preserves_old_snapshot`, `same_operation_key_is_idempotent`, `unsigned_member_can_register`. Use separate database connections, one available seat, approval on/off, waitlist on/off; same member concurrent submit must produce one registration.

```ts
expect(reservedSeats).toBe(1);
expect(mixed.outcomes.map(x => x.status)).toEqual(['submitted', 'waitlisted']);
expect(reservedAfterApproval).toBe(reservedBeforeApproval);
expect(snapshotVersions.map(x => x.version)).toEqual([1, 2]);
expect(originalSnapshot.answers).toEqual(originalAnswers);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/booking-seats.integration.spec.ts` and `npm run test:api -- test/booking-snapshots.integration.spec.ts`; expect seat/snapshot assertions to fail under real concurrent transactions.
- [ ] **Step 3 — Implement:** lock run, check ownership, current open/close times, not-cancelled state and selected sessions; deduplicate selections and reject foreign session/member IDs. Lock/persist operation key with result so retries do not produce another snapshot/notification. Recheck each pool: free → confirmed/submitted, full with queue → waitlisted, full without queue → transient refused result, never fake saved status. Persist mixed outcomes and snapshot only for saved entries. Approval/rejection enforces self-family prohibition; rejection releases reservations and fills queue in transaction. Rejoin cancelled entries, prefill previous answers, use current approved profile and permitted questions, append version and queue at tail if full. Adding sessions versions only those entries. Show actual outcomes/queue positions and explicit full/waitlist warnings in member/staff UI.
- [ ] **Step 4 — Verify:** run both API suites and `npm run test:e2e -- tests/e2e/course-registration.spec.ts`; expect no capacity breach under 20 competing requests, correct API deadline boundaries, no approval double-counting, no unsigned gate, consistent queue order and intact snapshot history. Browser-invite-only context remains forbidden.
- [ ] **Step 5 — Commit:** scoped booking/schema/UI files; commit `feat: reserve seats with independent session outcomes`.

### Task 3: M3-T3 — Cancellation, Rescheduling and Safe Capacity Changes

**Files:** create cancellation service; extend courses/policy/queue services and run/session schema; tests `apps/api/test/booking-changes.integration.spec.ts`, `tests/e2e/cancel-reschedule.spec.ts`; extend staff/member registration screens.

**Interfaces:** consumes `RunLock.withRun`, `Queue.fill`, outbox and clock; produces cancellation above, `Courses.cancelSession(actor:StaffActor,sessionId:Id,reason:string):Promise<void>`, `cancelRun(actor:StaffActor,runId:Id,reason:string):Promise<void>`, `reschedule(actor:StaffActor,sessionId:Id,newStart:string,newEnd:string):Promise<void>`, `Queue.promoteManually(actor:StaffActor,registrationId:Id,sessionId:Id|null,reason:string):Promise<void>`.

- [ ] **Step 1 — Write failing tests:** `cancel_promotes_queue_in_same_transaction`, `promotion_stops_at_cutoff`, `whole_run_session_cancel_keeps_run_seats`, `reschedule_extends_but_caps_self_cancel`, `capacity_cannot_fall_below_reserved`. At exact deadline reject self-cancel; before it allow. Test explicit close and no-close fallback in both modes, and two concurrent seat releases.

```ts
expect(afterCancelledSession.runReservedSeats).toBe(before.runReservedSeats);
expect(promoted.status).toBe('submitted');
expect(promotionsAtCutoff).toHaveLength(0);
expect(rescheduleCancelDeadline).toEqual(cappedLaterDeadline);
expect(capacityBelowReserved.status).toBe(409);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/booking-changes.integration.spec.ts`; expect deadline/promotion invariants to fail.
- [ ] **Step 3 — Implement:** API enforces run-first-session cancellation deadline for both modes, selected-session cancellation, staff after-deadline override, and reschedule formula `min(max(existingDeadline, changedAt + 7 days), affectedNewStart)`. Whole-run reschedule cancellation withdraws remaining course while retaining past attendance. Session/run organization cancellation updates only required pools with organization reason, blocks promotion/reminders/attendance and queues correct notices. Capacity changes hold run lock and never fall below submitted+confirmed count; normal increases fill FIFO only before promotion cutoff. Manual promotion after cutoff requires authorized staff action with recorded contact/reason, free seat and self-family review checks. Build confirmation UI with affected scope and reasons; lock mode/approval/session-list edits server-side even after all bookings cancel.
- [ ] **Step 4 — Verify:** run API suite and `npm run test:e2e -- tests/e2e/cancel-reschedule.spec.ts`; expect one queue winner per freed seat, no promotion after cancellation/cutoff, correct independent session outcomes, and notifications preserving unaffected sessions.
- [ ] **Step 5 — Commit:** scoped change-policy files; commit `feat: enforce cancellation and rescheduling policies`.

### Task 4: M3-T4 — Atomic Walk-In Intake, Booking and Today's Attendance

**Files:** create `apps/api/src/bookings/walkins.service.ts`, `attendance/attendance.service.ts`, attendance contracts/schema, staff walk-in page; tests `apps/api/test/walkins.integration.spec.ts`, `tests/e2e/walkin.spec.ts`.

**Interfaces:** consumes paper intake, locked booking internals and audit/outbox; produces `Walkins.admit(actor:StaffActor,input:WalkinInput):Promise<BookingResult>` and `Attendance.markInTransaction(tx:Tx,actor:StaffActor,sessionId:Id,memberId:Id,status:'present'|'absent'):Promise<void>`. `WalkinInput` includes member selection or intake, current session, other requested sessions, explicit new capacity where needed, close/capacity/queue reasons and operation key.

- [ ] **Step 1 — Write failing tests:** `closed_day_walkin_confirms_and_marks_today_only`, `capacity_increase_and_walkin_are_atomic`, `queue_bypass_requires_reason`, `own_family_walkin_is_blocked`, `cancelled_session_cannot_admit`. Induce transaction failure after intake to assert no orphan member/seat/attendance/notification survives.

```ts
expect(todayAttendance.status).toBe('present');
expect(otherSessionAttendance).toBeNull();
expect(unreasonedQueueBypass.status).toBe(422);
expect(reservedAfterWalkin).toBeLessThanOrEqual(capacityAfterWalkin);
expect(rollbackMember).toBeNull();
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/walkins.integration.spec.ts`; expect transactional exception/attendance tests to fail.
- [ ] **Step 3 — Implement:** same-day staff screen combines member selection/intake and confirmation; show waitlist before admission. Validate another staff handles self/family before writing anything. Within one run-locked transaction create member if needed, explicitly increase pool capacity with reason, reserve walk-in first only with audited queue exception, immediately confirm regardless of ordinary approval and mark today's attended session present. Remaining seats use ordinary cutoff-aware promotion. Return link QR for newly entered member under M2 token rules. No overbooking or cancelled-run/session admission.
- [ ] **Step 4 — Verify:** run API suite and `npm run test:e2e -- tests/e2e/walkin.spec.ts`; expect end-to-end same-day walk-in, accurate mixed booking/attendance, rollback safety and no queue bypass without explicit reason.
- [ ] **Step 5 — Commit:** scoped walk-in/attendance/UI files; commit `feat: admit audited walk ins without overbooking`.

---

## 3. Milestone Gate

- [ ] **Demonstrate:** both registration modes, approval, queue promotion, cancellation/rejoin history, rescheduling window, structural locks and walk-in exception using real database concurrency.
- [ ] **Checks:** all M3 API/browser suites plus lint/typecheck/build pass; simulated notices identify the correct member and affected session/run without sensitive intake values.
