# Integration and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace simulated integrations, prove reliable notifications and recovery, deploy the complete system and obtain December staff acceptance.

**Architecture:** real LINE and email adapters implement the established identity/outbox boundaries. A database-claimed worker runs inside the API service; scheduled jobs create deduplicated messages. A six-service Compose stack exposes only Caddy while encrypted backups and restore rehearsals prove recoverability.

**Tech Stack:** roadmap stack; LINE LIFF/Messaging APIs; Resend email adapter unless FamilyLink selects Brevo; `@nestjs/schedule`; Caddy; PostgreSQL 16; Gotenberg; backup cron with `pg_dump`, `rsync`, `rclone crypt`.

**Spec:** `FamilyLink — System Design (POC).md`, sections 1–2, 8–11; depends on all earlier milestones.

---

## Global Constraints

- **Inherited:** roadmap Global Constraints and all feature-service/outbox contracts apply.
- **Identity:** backend verifies real LIFF ID token; browser-supplied LINE user ID never establishes identity.
- **Delivery:** LINE first; email only when LINE unavailable or failed after retries; neither available/successful → staff follow-up.
- **Retries:** up to **5 retries** with growing delays; successful records are not resent.
- **Reminders:** daily **09:00 Asia/Bangkok**, for tomorrow's confirmed sessions; one LINE record per organization/account/template/target date; separate per-member email fallback.
- **Operations:** backups daily **02:00**, prelaunch restore then monthly; only proxy public; all POC features ready by **31 December 2026**.

---

## Review Focus

- **Invalid token/webhook signature:** no user impersonation or reachability mutation; T1.
- **Provider timeout or worker crash:** stable delivery keys/claims avoid local duplicate sends and untracked retries; T2.
- **Queued recipient/state changes:** recheck current linkage, confirmation, date and cancellation before sending; T2.
- **Grouped fallback privacy:** separate member email records cannot disclose sibling details; T2.
- **Restore missing files/key or monitoring leaks:** recovery includes encrypted uploads and recovered keys; telemetry strips sensitive values; T3.

---

## 1. File Map and Interfaces

- **LINE:** `apps/api/src/identity/line-identity.adapter.ts`, `line/line-api.client.ts`, `line/line-webhook.controller.ts`, `line/rich-menu.service.ts`, `apps/web/src/app/core/liff.service.ts`.
- **Messaging/jobs:** `apps/api/src/notifications/notification-worker.ts`, `delivery-policy.ts`, `line.transport.ts`, `email.transport.ts`, `templates.ts`, `jobs/reminders.job.ts`, `jobs/retention.job.ts`, `jobs/registration-close.job.ts`; extend notification schema and admin status UI.
- **Operations:** `compose.yml`, `infra/proxy/Caddyfile`, `infra/api/Dockerfile`, `infra/web/Dockerfile`, `infra/backup/Dockerfile`, `infra/backup/backup.sh`, `infra/backup/restore.sh`, `.env.example`, `scripts/release-check.sh`, `docs/operations/runbook.md`, `docs/operations/acceptance-2026-12.md`.
- **Transport:** `Transport.send(input:DeliveryInput):Promise<DeliveryResult>`; `DeliveryInput={notificationId:Id,dedupeKey:string,recipient:ResolvedRecipient,template:string,items:NotificationItem[]}`; `DeliveryResult={kind:'sent',providerId:string|null}|{kind:'retryable',code:string}|{kind:'unavailable'|'permanent_failure',code:string}`. Define these and item/recipient unions in `packages/contracts/src/notifications.ts` without sensitive intake fields.
- **Worker/jobs:** `NotificationWorker.tick(now:Date):Promise<void>`; `Reminders.createForDate(orgId:Id,targetBangkokDate:string):Promise<void>`; `Retention.purge(now:Date):Promise<void>`. Persist claim lease owner/expiry, attempt count, next attempt, channel, event references, fallback linkage and redacted provider error codes.

---

## 2. Tasks

### M5-T1: Real LINE Identity, Menus and Webhooks

**Files:** create LINE/LIFF files above; modify identity binding/configuration, signup/link event hooks and member routes; tests `apps/api/test/line-identity.integration.spec.ts`, `line-webhook.integration.spec.ts`, `tests/e2e/line-session.spec.ts`.

**Interfaces:** consumes `ParticipantIdentity.resolve`, reviewed link/member records; produces `LineIdentity.resolve(req:Request):Promise<MemberActor>`, `RichMenus.sync(orgId:Id,lineAccountId:Id):Promise<void>`, signed raw-body webhook handling and current reachability/quota metadata. Failed menu sync queues retry instead of rolling back a valid signup/link.

- [ ] **Step 1 — Write failing tests:** `forged_line_user_id_is_ignored`, `expired_wrong_audience_token_is_rejected`, `invalid_webhook_signature_has_no_effect`, `production_has_no_development_identity_route`, `pending_sibling_keeps_member_menu`. Mock provider responses through an HTTP stub; production tests never substitute frontend-supplied identity for server verification.

```ts
expect(forgedIdentity.status).toBe(401);
expect(invalidSignature.status).toBe(401);
expect(reachabilityAfterInvalidWebhook).toBe(reachabilityBefore);
expect(developmentIdentityInProduction.status).toBe(401);
expect(menuForLinkedAccount).toBe('member');
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/line-identity.integration.spec.ts` and `npm run test:api -- test/line-webhook.integration.spec.ts`; expect token/signature assertions to fail before connecting real adapter.
- [ ] **Step 3 — Implement:** obtain FamilyLink channel credentials/LIFF ID/OA menu access and confirm provider/channel alignment. Follow official token verification and raw webhook-signature documentation at execution; validate intended audience/expiry and bind trusted subject to organization LINE account. LIFF initializes/login securely; browser invite stays signup-only unless real LINE identity is verified. Sync guest/member menus after successful new membership, reviewed links, removals and moves; preserve existing menu/access for pending siblings. Signed follow/unfollow updates reachability; replay-safe event processing avoids duplicate mutations. Expose admin quota view and block missing-config production startup; never log tokens/secrets.
- [ ] **Step 4 — Verify:** run named API suites and browser auth suite; on actual FamilyLink test accounts run guest signup, caregiver add, reviewed existing-member link, profile, course booking, menu switch, unfollow/follow and browser invite checks. Record real LINE proof with synthetic member data; provider stubs alone do not satisfy acceptance.
- [ ] **Step 5 — Commit:** scoped LINE/config/web files; commit `feat: integrate verified LINE member access`.

### M5-T2: Outbox Delivery, Fallback, Reminders and Staff Follow-Up

**Files:** create messaging/job files above; extend M2 schema/outbox and admin notification UI; tests `apps/api/test/notification-worker.integration.spec.ts`, `reminders.integration.spec.ts`, `tests/e2e/notification-followup.spec.ts`.

**Interfaces:** consumes transactional events from every feature and current recipient/booking state; produces transport, worker and reminder contracts above. Notifications track pending signup applicants without requiring a member ID; fallback creates a separately tracked channel record linked to its source.

- [ ] **Step 1 — Write failing tests:** `two_workers_claim_once`, `retry_reuses_record_and_attempt_history`, `successful_line_has_no_email`, `no_channel_becomes_staff_followup`, `grouped_reminder_is_idempotent`, `cancel_or_relink_before_send_removes_stale_item`, `email_fallback_contains_only_one_member`. Enqueue tomorrow's sessions for two members sharing LINE; rerun scheduler and mutate eligibility before worker sends.

```ts
expect(lineReminderRecords).toHaveLength(1);
expect(successfulLineFallbackEmails).toHaveLength(0);
expect(emailForMemberA.items.every(i => i.memberId === memberA.id)).toBe(true);
expect(cancelledSessionItems).toHaveLength(0);
expect(unreachableNotice.status).toBe('staff_followup');
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/notification-worker.integration.spec.ts` and `npm run test:api -- test/reminders.integration.spec.ts`; expect claim/fallback/privacy assertions to fail.
- [ ] **Step 3 — Implement:** atomically claim eligible pending/retry records using database locking and bounded leases; reclaim expired claims without creating a new record. Use stable provider idempotency/retry keys where documented/supported, verify behavior against official provider docs, and do not claim exactly-once remote delivery after ambiguous timeouts. Send after commit, mark success/provider ID, and retry same channel record up to five retries at 1 minute, 5 minutes, 15 minutes, 1 hour and 6 hours; permanent/unavailable LINE can fall back immediately. Track separate fallback email or staff-follow-up state, using current recipient and safe template content. Recheck linkage, status, cancellation and session date at sending; drop stale items and skip empty reminder. Group tomorrow's confirmed items by organization/LINE account with exact specified date/channel key; email fallback per member/date with no sibling details. Repeated jobs preserve successful records and attempt history. Add quota use, failed notice/follow-up list and staff-resolution action; no false read receipt.
- [ ] **Step 4 — Verify:** run API suites and follow-up browser test; require tests for every spec event: signup resolved/rejected, registration result, approval/rejection, promotion, profile review, cancellation, reschedule and session reminder. Against actual LINE/email test recipients verify LINE success, email fallback, grouped reminder and staff follow-up; a forced provider failure must leave visible retry/follow-up state. Run two workers and a simulated crash/restart to prove claim recovery. Verify daily schedule at 09:00 Bangkok and every-15-minute display closure without weakening API time checks.
- [ ] **Step 5 — Commit:** scoped notification/job/UI files; commit `feat: deliver reliable notices and grouped reminders`.

### M5-T3: Deployment, Recovery, Cleanup and Staff Acceptance

**Files:** create operations files above; wire sanitized API/web monitoring and health checks; tests `apps/api/test/retention.integration.spec.ts`, `production-config.integration.spec.ts`, `tests/e2e/poc-acceptance.spec.ts`.

**Interfaces:** consumes complete app, encryption config and all milestone checks; produces six-service Compose deployment, `GET /api/health` with DB check, scheduled cleanup, `backup.sh` nonzero exit on any failed backup, `restore.sh` into isolated staging, and recorded staff acceptance evidence.

- [ ] **Step 1 — Write failing checks:** `production_refuses_missing_secrets_or_dev_identity`, `unset_retention_does_not_purge_members`, `signup_request_purges_after_30_days`, `telemetry_redacts_sensitive_fields`. Define release smoke checks for all POC workflows and backup restore including encrypted file hashes and successful decryption after recovering key separately.

```ts
expect(productionWithDevIdentityStartup).rejects.toThrow();
expect(memberCountWithUnsetRetention).toBe(originalCount);
expect(expiredPendingRequest).toBeNull();
expect(telemetryPayload).not.toContain(citizenIdPlaintext);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/retention.integration.spec.ts` and `npm run test:api -- test/production-config.integration.spec.ts`; expect missing config/cleanup guards to fail. Run `docker compose -f compose.yml config --quiet`; expect failure until production service definitions exist.
- [ ] **Step 3 — Implement operations:** only proxy publishes 443; web/API/DB/PDF internal, backup no ports. Mount encrypted private upload storage; secrets outside Git/images/backups; Caddy HTTPS/HSTS, Tailscale SSH administration, least-privilege DB/runtime credentials. Backups at 02:00 include database and matching uploaded files on second HDD plus encrypted Google Drive copy; capture a consistent restore set by pausing write traffic during dump/file capture and resume via cleanup trap even on failure. Ping healthchecks.io only after all required stages succeed. Add UptimeRobot five-minute DB-aware health, Sentry scrubbing before transmission, smartd/disk alerts, and monthly restore procedure. Implement policy-configurable soft-delete purge, default inactive when unset; separately purge rejected/abandoned signup requests/held files after 30 days and expired unsubmitted drafts after 24 hours. Do not purge active file references. Runbook includes key recovery from password manager/sealed copy, outage/restart, backup failure, staff access revocation, breach contacts and operational dates from approved paperwork.
- [ ] **Step 4 — Verify release and dry-run:** run `npm run lint`, `npm run typecheck`, `npm run test:integration`, `npm run test:e2e -- tests/e2e/poc-acceptance.spec.ts`, `npm run build`, Compose config validation and clean-volume migrate/start. Restore complete backup into staging; recover keys separately, decrypt sample member/revision/snapshot/file and verify counts/file hashes. Demonstrate only proxy public and sanitized telemetry. Complete checklist below with staff, record failures/owner/retest and resolve workflow blockers by 31 December. Do not use real member data until external launch inputs are signed off.
- [ ] **Step 5 — Commit:** scoped operations/acceptance files; commit `chore: prepare verified POC deployment and recovery`. Deployment/publishing is a later execution action on the concrete verified release, not an action performed by this planning document.

---

## 3. Staff Acceptance Checklist

**Evidence format:** each row in `docs/operations/acceptance-2026-12.md` records date, build identifier, tester/role, synthetic scenario, expected/actual result, evidence and issue/retest. FamilyLink admin records final acceptance only when every POC area passes and workflow blockers are resolved.

- [ ] **Staff access:** admin manages/disables staff; existing session immediately expires; staff sees only permitted organization data.
- [ ] **Intake:** paper member, shared-phone caregiver/patient, citizen-ID conflict, search/profile and existing-member signup review all work.
- [ ] **Member access:** real LIFF signup/add-member/switcher/profile works; browser invite cannot access profile/registration; pending applicant cannot view matched record; existing siblings remain usable.
- [ ] **Consent/documents:** no-upload signup lacks sensitive-upload prompt; every uploaded type requires prior consent; staff receipts/admin-only contents and signed-scan permissions hold.
- [ ] **Profiles/notes:** approved profile change, own/family review denial, note creation/revision/24-hour limit, no participant note access and no text in audit logs.
- [ ] **Courses/questions:** templates/runs/sessions, service tags, six question types, post-booking edit limits and sensitive-answer handling work.
- [ ] **Bookings:** both modes, mixed outcomes, pending seat reservation, approval/rejection, waitlist FIFO/promotion/cutoff, concurrent last seat and rejoin versioned answers work.
- [ ] **Changes/walk-ins:** cancellation, reschedule window, capacity floor, permanent mode/session lock, explicit walk-in queue exception and today's-only attendance work.
- [ ] **Attendance/forms:** mobile present/absent/unmarked, dashboard totals, batch unsigned forms, readable Thai PDF with blank Part 3 and explicit physical-signature receipt work.
- [ ] **Membership/reports:** paid upgrade/renew/expiry/lifetime/admin correction/void, label-only eligibility, filters/monthly totals and both-role Excel exports work.
- [ ] **Messages:** actual LINE delivery, email fallback, grouped confirmed-session reminder, dedupe/retries, cancellation/relink recheck, quota view and staff-follow-up work.
- [ ] **Operations:** production config, monitoring alerts, encryption keys, daily backup, prelaunch restore and key retrieval verified; scheduled jobs use Bangkok time.
- [ ] **Real-use inputs:** approved paperwork/processing basis/privacy contact, extended DPA term, actual tiers/form labels, LINE access/quota and verified email sender recorded.
- [ ] **Deadline:** complete and ready for real use by **31 December 2026**; no attendance/integration fallback to January. First real course is operational follow-up.
