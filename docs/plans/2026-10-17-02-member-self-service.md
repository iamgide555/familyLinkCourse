# Member Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** members sign up through LINE-shaped development flows or browser invites; staff review matches, profiles and links; uploads obey consent and document permissions.

**Architecture:** reuse staff intake and access policies from M1. A participant identity adapter supplies verified account context in production and explicitly enabled synthetic identities in development. Persist pending signup data separately from member records and emit transactional notification events through a simulated transport.

**Tech Stack:** roadmap stack; encrypted filesystem uploads; image/PDF processing; transactional PostgreSQL outbox; development-only identity adapter.

**Spec:** `FamilyLink — System Design (POC).md`, sections 3–4, 5 profile approval, 7–9; depends on M1 and roadmap contracts.

---

## Global Constraints

- **Inherited:** roadmap Global Constraints and M1 public interfaces apply.
- **Matching:** same normalized full name **AND** birth date triggers staff review, regardless of phone; no fuzzy matching or phone-only match.
- **Tokens:** one-time signup/link tokens expire after **7 days**; store token hashes only.
- **Uploads:** all document types require sensitive-data consent before accepting files; JPG/PNG/HEIC/PDF, **≤ 10 MB**; signed scans admin-upload-only; stored contents admin-only.
- **Pending applicants:** do not expose candidate member data; existing linked family members keep access.
- **Paper:** online registration may proceed while unsigned; staff print and collect signature on site.

---

## Review Focus

- **Competing token redemption:** one outcome, no duplicate member/link; T1/T3.
- **Production test identity escape:** disabled regardless of client headers; T1 and M5-T1.
- **Consent missing on upload:** API refuses file bytes independently of UI; T2.
- **Caregiver reassignment:** stale account loses access and cannot keep old profile visibility; T3.
- **Profile request races:** approval does not silently overwrite intervening staff corrections; T3.

---

## 1. File Map and Interfaces

- **API features:** `apps/api/src/identity/identity.service.ts`, `identity/dev-identity.adapter.ts`, `signup/signup.service.ts`, `signup/signup.controller.ts`, `signup/invites.service.ts`, `documents/documents.service.ts`, `documents/upload-policy.ts`, `documents/file-store.ts`, `profile/profile-changes.service.ts`, `linking/line-linking.service.ts`, `notifications/outbox.service.ts`, `notifications/simulated.transport.ts`.
- **Contracts:** `packages/contracts/src/signup.ts`, `documents.ts`, `profile.ts`, `notifications.ts`; schema adds drafts, held files, token state, review state and notification recipient references.
- **Web:** `apps/web/src/app/member/signup/`, `member/switcher/`, `member/profile/`, `member/pending/`, `staff/reviews/`, `staff/documents/`; forms share input components, not privileged profile DTOs.
- **Identity contract:** `ParticipantIdentity.resolve(req:Request):Promise<MemberActor>`; later LINE adapter replaces development adapter without changing feature services. Production must fail closed if real identity verification is unavailable.
- **Signup contract:** `Signup.submit(context:SignupContext, input:SignupInput):Promise<SignupResult>` where context is verified LINE or validated browser invite; result is `{kind:'created',memberId:Id}` or `{kind:'pending',requestId:Id}`. `SignupInput` includes required online fields, relationship, versioned consent records and owned draft file IDs, never candidate member IDs.
- **Outbox contract:** `Outbox.enqueue(tx:Tx, actor:Actor, event:NotificationEvent):Promise<void>`; `NotificationEvent={eventId:Id, kind:NotificationKind, recipient:RecipientRef, entityRefs:Record<string,Id[]>}`; `RecipientRef={kind:'member',memberId:Id}|{kind:'signup_request',requestId:Id}`. Define all spec event kinds in `notifications.ts`; no sensitive field values enter event payloads. `eventId` is stable per business transition and distinct on rejoin/repeated reschedule.
- **Draft/file contract:** `Documents.beginDraft(context:SignupContext):Promise<{draftId:Id,draftToken:string}>`; `Documents.grantUploadConsent(context:SignupContext,draftId:Id,consent:ConsentInput):Promise<void>`; `Documents.upload(context:SignupContext,draftId:Id,file:UploadInput):Promise<DocumentReceipt>`. Draft tokens are hashed, expire in 24 hours and can access only their own staged files; rejected/abandoned submitted requests retain the separate 30-day policy.

---

## 2. Tasks

### M2-T1: Signup, Invites, Match Queue and Simulated Identity

**Files:** create identity/signup/outbox files and contracts above; modify schema and M1 member matching; tests `apps/api/test/signup.integration.spec.ts`, `identity.integration.spec.ts`, `outbox.integration.spec.ts`.

**Interfaces:** consumes `Members.findCandidates`, crypto and audit; produces `Signup.submit`, `Invites.issue(actor:StaffActor, mode:'signup'|'link', memberId:Id|null, prefill:InvitePrefill):Promise<{url:string}>`, and `Outbox.enqueue`. Define `SignupContext`, `SignupResult`, `SignupInput`, `ConsentInput`, `InvitePrefill` in `signup.ts`.

- [ ] **Step 1 — Write failing tests:** `name_birth_date_match_never_creates_or_exposes_member`, `different_phone_still_matches`, `same_phone_different_person_is_created`, `one_time_signup_invite_is_atomic`, `production_ignores_dev_identity`, `outbox_rollback_matches_business_rollback`. Submit same invite on two database connections; test expiry at exactly seven days and supplied forged candidate/organization IDs.

```ts
expect(match.body.kind).toBe('pending');
expect(match.body).not.toHaveProperty('candidateMemberIds');
expect(createdByCompetingInviteRequests).toBe(1);
expect(productionDevHeaderResponse.status).toBe(401);
expect(notificationsAfterRollback).toHaveLength(0);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/signup.integration.spec.ts` and `npm run test:api -- test/identity.integration.spec.ts`; expect matching/identity assertions to fail.
- [ ] **Step 3 — Implement:** enable synthetic LINE identities only with development/test environment plus explicit config. Browser tokens permit signup only. Issue random hashed tokens, consume atomically with successful member/pending-request creation; bind draft/final submissions to originating token/account. Copy staff prefill without treating it as verified. Create a member only with no name/birth match; create encrypted pending request otherwise, retain consent timestamps and held file ownership. Multiple matches remain staff choices. Preserve existing family access. Define append-only outbox with unique transition/channel keys and simulated delivery capture; pending review notices reference the applicant request, not the matched record or its email.
- [ ] **Step 4 — Verify:** run the three named API suites, plus `npm run test:api -- test/outbox.integration.spec.ts`; expect atomic token redemption and event rollback. Verify browser signup context gets `403` on profile/course endpoints and no candidate values in its response or logs.
- [ ] **Step 5 — Commit:** scoped identity/signup/outbox files; commit `feat: add member signup and reviewed matching`.

### M2-T2: Upload Consent, Processing and Document Permissions

**Files:** create documents feature and contract files above, `apps/api/test/documents.integration.spec.ts`, `tests/e2e/upload-consent.spec.ts`; extend signup draft/held-file schema and member document records.

**Interfaces:** consumes authenticated staff or owned signup draft plus consent inputs; produces draft/upload methods above, `Documents.attachDraft(tx:Tx, draftId:Id, target:{memberId:Id}|{signupRequestId:Id}):Promise<void>`, `Documents.download(actor:StaffActor, documentId:Id):Promise<Readable>`, admin verify/delete operations and safe receipt metadata. `UploadInput` is server-controlled MIME/name/byte stream; `DocumentReceipt` excludes filesystem keys and content URLs.

- [ ] **Step 1 — Write failing tests:** `every_document_type_requires_upload_consent`, `staff_upload_does_not_grant_download`, `signed_scan_upload_requires_admin`, `magic_bytes_override_filename`, `oversize_file_rejected`. Parameterize all allowed types; include an innocently named document marked non-sensitive in settings and still require applicant consent. Interpret the spec's MB as decimal bytes: accept a valid file at 10,000,000 bytes, reject 10,000,001. Staff intake uploads use the signed-form/consent record rather than pretending staff are the consenting member; signed-form scan upload remains admin-only.

```ts
expect(uploadWithoutConsent.status).toBe(422);
expect(staffDownload.status).toBe(403);
expect(staffSignedScanUpload.status).toBe(403);
expect(fileAbove10MB.status).toBe(413);
expect(storedImageMetadata).not.toHaveProperty('GPS');
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/documents.integration.spec.ts`; expect missing consent/read checks.
- [ ] **Step 3 — Implement:** show unchecked consent on attachment choice, retain version/person/original timestamp on draft before accepting bytes, hide optional sensitive consent when no attachment. Validate allow-list/magic bytes/size, decode HEIC, re-encode images, strip EXIF/GPS and watermark exactly `ใช้สำหรับสมาคม FamilyLink เท่านั้น`; watermark each PDF page and reject malformed or unreadable/protected documents. Enforce limits for decompression/page processing. Encrypt sanitized files outside web root; API alone streams authenticated admin access. Staff see receipts/status only. Move held-file ownership transactionally on signup/review; compensate failed uploads and clean expired drafts without deleting committed files. Signed-form scan input is admin-only.
- [ ] **Step 4 — Verify:** run API test and `npm run test:e2e -- tests/e2e/upload-consent.spec.ts`; expect no consent prompt without files, explicit required consent for every attachment type, no upload request before agreement, and watermark/readable content after admin download. Verify no original plaintext file remains after processing and no static URL serves files.
- [ ] **Step 5 — Commit:** scoped document/schema/UI files; commit `feat: protect member document uploads`.

### M2-T3: Review, Caregiver Links and Profile Changes

**Files:** create profile/linking feature files, extend signup review controller/service, contracts `profile.ts`; tests `apps/api/test/member-review.integration.spec.ts`, `profile.integration.spec.ts`.

**Interfaces:** consumes `Authorization.assertCanReview`, transactions/outbox/document attachment; produces `Signup.review(actor:StaffActor, requestId:Id, decision:SignupDecision):Promise<void>`, `Linking.redeem(context:MemberActor, token:string):Promise<Id>`, `Linking.move(actor:StaffActor, memberId:Id, targetLineAccountId:Id, reason:string):Promise<void>`, `ProfileChanges.submit(actor:MemberActor, memberId:Id, changes:EditableProfilePatch):Promise<Id>`, `ProfileChanges.review(actor:StaffActor, requestId:Id, approve:boolean):Promise<void>`. Define decisions/patches in corresponding contracts; reject any non-allowlisted participant field.

- [ ] **Step 1 — Write failing tests:** `own_and_same_line_family_reviews_are_blocked`, `link_qr_is_single_use`, `old_caregiver_loses_access_after_reassignment`, `pending_sibling_does_not_block_existing_member`, `profile_approval_detects_intervening_change`. Compare encrypted old request values against current profile at approval, returning conflict for staff resolution instead of silently overwriting.

```ts
expect(selfReview.status).toBe(403);
expect(oldAccountProfile.status).toBe(404);
expect(existingSiblingProfile.status).toBe(200);
expect(staleProfileApproval.body.code).toBe('PROFILE_CHANGED');
expect(hiddenFieldPatch.status).toBe(422);
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:api -- test/member-review.integration.spec.ts` and `npm run test:api -- test/profile.integration.spec.ts`; expect authorization/link races to fail.
- [ ] **Step 3 — Implement:** staff choose existing/new/reject with optimistic pending-state check; same citizen ID still blocks new creation. Apply consent original timestamps, move uploads and enqueue applicant outcome atomically; no automatic merge of submitted fields into existing profile. Staff/admin self-family restrictions apply equally, including walk-in use later. Link QR is direct, seven-day, one-time member link, never silent replacement of an existing link; staff moves require reason and approval of destination account. Own-switcher removal only revokes own access. Profile requests contain encrypted old/new allowlisted values and staff decisions; approved fields update current profile only. Do not expose hidden fields or files through profile/history responses.
- [ ] **Step 4 — Verify:** run both API suites; expect complete link/reject/create flow, concurrent link consumption yielding one link, no self-review, no stale caregiver access, no overwrite on stale profile approval, and correctly scoped outbox notices.
- [ ] **Step 5 — Commit:** scoped review/link/profile files; commit `feat: review member links and profile corrections`.

### M2-T4: Complete Signup and Family Profile Screens

**Files:** create web member/review/document feature folders above, routing and shared validated input components; tests `tests/e2e/member-signup.spec.ts`, `member-profile.spec.ts`, `staff-reviews.spec.ts`.

**Interfaces:** consumes M2 HTTP DTOs and participant profile projection; produces member routes `/member/signup`, `/member/profile`, `/member/pending`, staff `/staff/reviews`, invite landing routes and selected-member state. Development identity selector lives only in development build configuration.

- [ ] **Step 1 — Write failing browser tests:** `caregiver_adds_shared_phone_patient`, `matched_signup_waits_without_exposing_candidate`, `browser_invite_stops_at_signup`, `staff_review_adds_member_to_switcher`, `unsigned_member_profile_remains_usable`. Assert displayed field set and reload persistence, not only screenshots.

```ts
await expect(page.getByText('ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน')).toBeVisible();
await expect(page.getByLabel('เลขประจำตัวประชาชน')).toHaveCount(0);
await expect(page.getByRole('button', {name: 'เพิ่มสมาชิก'})).toBeVisible();
```

- [ ] **Step 2 — Confirm RED:** run `npm run test:e2e -- tests/e2e/member-signup.spec.ts`; expect missing/incomplete user workflow assertions.
- [ ] **Step 3 — Implement:** Thai-first mobile signup, relationship selection, member switcher, per-applicant waiting state, approved profile fields and editable/request controls. Show staff review badge/queues, no field-by-field compare screen, and document receipts/admin actions. Use explicit loading/error/empty/submission states; prevent duplicate client submits while retaining server idempotency. Read course/membership statuses when later APIs become available without inventing registration access for browser invites.
- [ ] **Step 4 — Verify:** run all three named browser suites and `npm run build`; expect full signup → staff review → switcher/profile journey, approved edits visible after reload, no hidden-field network response, and usable narrow-screen forms/keyboard focus.
- [ ] **Step 5 — Commit:** scoped web/tests files; commit `feat: add member signup and family profile screens`.

---

## 3. Milestone Gate

- [ ] **Demonstrate:** browser signup only, synthetic LINE signup, caregiver-added patient, match review, direct link QR, profile correction, upload consent/admin document access, and signature receipt.
- [ ] **Integration limit:** no production member access or real notifications until M5; no simulated identity accepted in production build/config.
