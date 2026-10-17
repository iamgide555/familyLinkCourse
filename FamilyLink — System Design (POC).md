# FamilyLink — System Design (POC)

**Updated:** Oct 17, 2026 · @Guide

**FamilyLink POC:** one web system for member sign-up (LINE or paper), course registration and staff operations, built with Angular + NestJS + PostgreSQL on a home server. Every POC feature must be complete, tested with staff and ready for real use by **31 December 2026**. The first real course in early 2027 provides follow-up feedback after POC acceptance. Members are caregivers and people with psychosocial disabilities, so the whole member database is treated as PDPA sensitive data.

## 1. Scope

**POC goal:** let FamilyLink run one real course end to end without Google Forms or spreadsheets. Acceptance is based on a staff dry-run by **31 December 2026**, covering every POC feature below. All POC features must be ready for real use by that deadline; none may be deferred to January 2027.

| Area | POC (by end Dec) | After POC approval |
| --- | --- | --- |
| Members | Sign-up via LINE (LIFF), browser invite, and staff entry from paper; LINE linking; profile page in LINE; profile edit with staff approval; document upload | Member login without LINE (email/Google/LINE login) |
| Courses | Course → run → sessions; service-type tags; register per run or per session; shared question library and configurable registration questions | — |
| Registration | Pending approvals reserve seats; per-session capacity and mixed session outcomes; staff approval; waitlist with auto-promotion; self-cancel before deadline; walk-in (member + registration in one step) | — |
| Staff tools | Dashboard, member search, case notes, paid membership records and filters, Excel export, printable sign-up form (PDF) | Old spreadsheet import |
| Messaging | LINE push + email fallback: confirmation, waitlist promotion, reminder 1 day before each confirmed session; daily LINE reminders grouped by LINE account | Invite interested members to new runs |
| Attendance | Manual attendance per session (present/absent); walk-ins marked present; in export and dashboard. Complete and ready for real use by 31 December 2026; required in the staff dry-run and for POC acceptance | QR check-in, certificates |
| Platform | Single tenant (FamilyLink) with `organization_id` everywhere; admin/staff roles; consent records; audit log | Partner NGOs, billing |

**Acceptance by 31 December 2026:**

- **Complete scope:** every feature in the POC column works end to end in the deployed system; features in the after-POC column remain outside this deadline.
- **Staff dry-run:** staff exercise every POC area with test data, including attendance, exports and printable forms; failures that prevent those workflows are resolved before acceptance.
- **Real integrations:** real LINE identity verification, linking, rich menus, webhooks and message delivery pass end-to-end checks; email fallback and staff-follow-up behavior are verified.
- **Operational readiness:** deployment, access controls, scheduled jobs, backups and the pre-launch restore test work; the FamilyLink confirmations and paperwork required before real data use are complete.
- **2027 follow-up:** the first real course validates operation and supplies improvement feedback; it does not defer POC delivery or acceptance.

## 2. Architecture

&#91;embedded content: architecture · 6 containers, 5 outside services\]

- **Member self-service:** course registration and profile access use LINE (LIFF pages).
- **Browser invite:** a personal staff invite allows member sign-up only outside LINE; it does not grant course registration or profile access. Staff assist members without LINE.
- **Staff access:** desktop browser dashboard.
- **Backend boundary:** the NestJS API is the only service that talks to the database, file store, PDF renderer, LINE and email.
- **Build order:** implement the website and backend first, testing member flows with development-only test identities and simulated message delivery. Integrate real LINE identity verification, linking, menus, webhooks and messaging afterward, then run end-to-end checks. FamilyLink LINE access is required for integration, not to begin website development. Production member access requires real identity verification; full POC acceptance includes real LINE integration testing.

## 3. Roles and permissions

**Staff handle intake**, including citizen ID, disability details, household income, and case notes. **Admins alone** view/download uploaded document copies, delete those documents, export sensitive columns, delete members, or manage staff. Expected users: **2 admins, 6–10 staff**.

| Action | Admin | Staff |
| --- | --- | --- |
| Courses, runs, sessions: create, edit, view | ✅ | ✅ |
| Shared question library and course/run questions: create, edit, select, order | ✅ | ✅ |
| Delete course or run | ✅ | ❌ |
| View registrations; read/edit member intake fields, including citizen ID, disability type, household income | ✅ | ✅ |
| Create member from paper form / walk-in | ✅ | ✅ |
| Approve or reject registrations, profile edits, LINE link matches (never for own or own family's records) | ✅ | ✅ |
| Unlink or move a member's LINE link (reason required, logged) | ✅ | ✅ |
| Mark session attendance | ✅ | ✅ |
| Write and read case notes | ✅ | ✅ |
| Edit own case note (24 h window) | ✅ | ✅ |
| Delete case notes | ✅ | ❌ |
| Excel export (sensitive columns excluded, every export logged) | ✅ | ✅ |
| Print prefilled sign-up form PDF, including intake fields; case-note section remains blank | ✅ | ✅ |
| Upload member documents (signed-form scans remain admin-only); view document receipt/status metadata | ✅ | ✅ |
| View/download ID card copies and other uploaded documents; verify their contents | ✅ | ❌ |
| Delete uploaded documents | ✅ | ❌ |
| Export including sensitive columns | ✅ | ❌ |
| Delete members; handle PDPA access/deletion requests | ✅ | ❌ |
| Manage staff accounts and roles | ✅ | ❌ |
| Organization settings: service types, document types, consent text, PDF/message templates | ✅ | ❌ |

**Participants have no standalone web login.** Through LIFF, they access profiles and courses for members linked to their LINE account; they never see case notes, stored documents or restricted sensitive fields. Browser invites grant sign-up access only.

**LINE profile field access:** the same permissions apply to the LINE owner's own linked member record and to family members selected through the member switcher.

| Access | Fields |
| --- | --- |
| View and request changes, subject to staff approval | Name, birth date, mobile phone, email, province/district, member type, requested services |
| View only | Registration/session status, membership tier/expiry, profile completeness, signed-form receipt status |
| Staff-managed and hidden from the LINE profile | Citizen ID, disability details, household income, all other extended intake fields, case notes, stored documents |

- **Profile corrections:** every requested change to an editable profile field requires staff approval; members contact staff to correct hidden fields.
- **Server enforcement:** participant responses expose only the allowed fields; participant profile-change requests accept only the editable fields above.

**Document upload does not grant read access.** Staff may submit a file and see its receipt/status, but cannot retrieve or preview the stored copy. Printing a newly generated signup form is separate from viewing an uploaded signed form or ID-card scan.

Paid membership: staff and admin can record a payment and upgrade a member; only admin can edit or void a recorded payment and manage tiers and fees.

**Staff who are also members.** An admin can link a staff account to that person's own member record (`users.member_id`). Staff cannot approve or reject registrations, profile edits or LINE links for that record, or for members on the same LINE account; another staff member or an admin handles them. Viewing and editing those records stays allowed and is audit-logged.

## 4. Member sign-up and LINE linking

Every participant becomes a member before registering for a course. One LINE account can manage many members (a caregiver and family); each member links to at most one LINE account.

&#91;embedded content: member sign-up · 2 paths, staff confirm every match\]

**Existing-member review:** a signup with the same normalized full name and birth date as an existing member waits for staff confirmation, regardless of phone number. Matching details never grant automatic access to that record. The staff-issued one-time link QR below is a separate linking path.

**Paths in**

1. **LINE:** member opens LINE OA → rich menu “สมัครสมาชิก” → LIFF sign-up form (minimum fields, optional uploads, consent) → member saved with `line_account_id`.
2. **Paper / walk-in:** staff type the paper form into the web dashboard → member saved with `source = paper`, no LINE. Walk-ins on a course day: member and registration created in one screen. After saving, the screen shows a one-time link QR for that member (valid 7 days); scanning it in LINE links the member at once, with no form, matching or review. Staff can also send the same link later by LINE chat or SMS.
3. **“Add another member” in LINE:** same LIFF form, with “registering for” + relationship; the LINE owner is recorded as caregiver.
4. **Staff invite link:** staff generate a personal sign-up link from the dashboard and send it by LINE chat, SMS or email. One-time token, expires in 7 days, records which staff created it. Staff may prefill name and phone. Opens the same sign-up form in any browser; if opened inside LINE it signs up through LIFF and links LINE (a match with an existing member still goes to staff review). Otherwise the confirmation page offers “เพิ่มเพื่อน LINE OA” to link later. Outside LINE, the link permits **member sign-up only**; staff handle course registration and profile changes until LINE is linked. Same matching rules apply. New table: `signup_invites` (`token_hash`, `created_by`, `prefill`, `expires_at`, `used_at`, `member_id`).

**Matching on sign-up:** apply the same rule to LINE, “Add another member” and browser-invite signups. Normalize names first: trim spaces and strip นาย / นาง / นางสาว / เด็กชาย / เด็กหญิง. A match requires both first and last names to match after normalization, and the same birth date. Phone number is not part of this match; fuzzy spelling matches are outside the POC.

| Existing-member match | Action |
| --- | --- |
| Same normalized full name AND same birth date; member has no LINE link | Create a signup request, not a duplicate member; show “ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน” until staff link, create new, or reject |
| Same normalized full name AND same birth date; member already has a LINE link | Send to staff review; do not automatically link, move the existing link, or expose the existing record |
| No member matches both normalized full name and birth date | Create a new member; shared phone alone does not trigger review |

- **Caregiver and patient sharing a phone:** create a separate patient member when the name-and-birth-date rule finds no existing member. Through “Add another member”, link the new record to the submitting caregiver's LINE account and record the declared relationship; staff entry uses the explicitly selected caregiver relationship.
- **Access boundary:** sharing a phone never assigns a caregiver relationship or grants access to another member's record.

**After successful member creation or approved linking**, the system switches that LINE user’s rich menu to **ลงทะเบียนคอร์ส / โปรไฟล์** (+ “เพิ่มสมาชิก”). The profile page has a member switcher when one LINE manages several members. Adding a pending signup request does not remove access to already-linked members.

**New-member status:** members start with **ข้อมูลไม่ครบ** (incomplete) and **ยังไม่ได้ลงนาม** (unsigned). After online sign-up with the required fields and online consents, members may register for courses before signing the paper form. Staff complete the remaining intake fields and print the physical form for the member or guardian to sign when they attend on site.

**Caregiver control.** Only staff or admin can unlink a member from a LINE account or move them to another; they pick a reason and the change is logged. The new LINE account goes through the review queue. A LINE owner may remove a member from their own switcher, which only drops their own access. An adult member who wants privacy from a caregiver asks staff to unlink.

**Added by a caregiver:** a new member created through “เพิ่มสมาชิก” is saved with `consented_by = caregiver` and stays unverified until the member or guardian signs the paper form on site. Pending paper verification does not block course registration after the required online sign-up fields and consents are submitted. Re-consent at age 18 is outside the POC.

**Duplicate check on staff entry and edits:** check normalized full name and birth date together, plus citizen ID through `citizen_id_hash`, before saving a member. Shared phone alone does not trigger a duplicate warning.

- **Same citizen ID:** block a second member with the same ID within the organization; staff must use the existing record or correct the mistyped ID. “Create new anyway” cannot override this constraint.
- **Same normalized full name and birth date with a different or missing ID:** show the existing-member match for staff review; staff may choose “use existing” or “create new anyway” with a recorded reason, since different people can share these details.
- **Missing citizen ID:** allow an incomplete member record with no ID. Enforce uniqueness when staff add the ID later.
- **Member edits:** apply the same duplicate checks when editing an existing member; its own unchanged ID is not a duplicate.
- **Duplicate cleanup:** no merge tool in the POC; an admin deletes a duplicate by hand, logged.

**Signup requests.** When a signup matches an existing member, the member takes no extra step: the form submits as usual and LIFF shows “ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน”. The submitted details (encrypted), consent and any uploads wait in `signup_requests`. Staff link it to the existing member, create a new member, or reject; the member gets one LINE push or email. On resolve, the consent becomes `consents` rows with its original timestamp and uploads move to `member_documents`. No field-by-field compare screen in the POC: staff edit differing details by hand. Rejected or abandoned requests and their uploads are purged after 30 days.

- **Pending-request access:** block course registration and member-profile access only for the applicant awaiting review. Show the submitted request as “Awaiting staff review”; never expose a matched existing member record before linking is approved.
- **Already-linked members:** keep their profiles and registration actions available, even when the same LINE account has another pending signup request.
- **Review completion:** after staff approve linking or create a new linked member, add that member to the switcher. If the LINE account has no linked members yet, show the waiting screen until review finishes.

## 5. Other flows

### Course registration and seats

1. **Choose:** member opens ลงทะเบียนคอร์ส in LINE, or staff register them; pick member, open run, and sessions when per-session registration is enabled.
2. **Show availability:** each session displays available, full with waitlist, or full and closed. Selecting a full session with waitlist warns that no seat is guaranteed. A full session without waitlist cannot be selected.
3. **Answer questions:** show the run's configured questions; reuse standard profile fields and save answers for the selected member's registration. On rejoin, prefill the previous question answers and let the member or staff update them before submitting; standard profile fields come from the current approved member profile.
4. **Check seats transactionally:** lock the run before checking and changing seats or queues. Recheck current availability on submission; show actual saved outcomes if availability changed after selection.
5. **Assign outcomes:** use the rules below independently for each selected session in per-session mode. Whole-run registration uses one run-level outcome and capacity.
6. **Confirm clearly:** list each selected session's outcome and any queue position. Save an immutable snapshot version of member details, question wording/options, and submitted answers in the same transaction as the booking. Rejoining creates a new version; earlier versions remain unchanged.

| Availability and settings | Outcome | Occupies a seat? |
| --- | --- | --- |
| Seat available, no approval | `confirmed` | Yes |
| Seat available, approval required | `submitted`; staff later approve or reject | Yes |
| Full, waitlist enabled | `waitlisted`, with queue position | No |
| Full, waitlist disabled | Refused; show full message | No |

- **Capacity:** both `submitted` and `confirmed` consume seats. Approving a pending registration changes status without consuming another seat. Rejected and cancelled entries consume none.
- **Paper signature:** unsigned status or caregiver paper-verification pending status does not block course registration. Online consent is collected during sign-up; the physical form is printed and signed when the member attends on site. Registration approval and capacity rules still apply.
- **Per-session mode:** capacity, status, and waitlist position belong to each selected session. Available sessions reserve seats even if another selection is waitlisted. Staff approve/reject session entries independently; a run-level summary must show mixed outcomes without replacing session statuses.
- **Whole-run mode:** one registration reserves one run place, covering all sessions. Capacity and waitlist remain run-level.

**Waitlist auto-promotion:** when a pending or confirmed reservation is rejected/cancelled, or capacity increases, fill available seats from that capacity pool's queue in order, in the same transaction. In per-session mode, promote only that session's queue. Promotion becomes `submitted` when approval is required, otherwise `confirmed`; both reserve a seat. Send notice naming the member and affected session or run.

- **Walk-in queue exception:** an explicit staff decision to admit a walk-in ahead of waiting members follows the audited exception below. Reserve that walk-in's seat in the same transaction as any required capacity increase; remaining free seats follow normal promotion rules and cutoff.

**Self-cancel:** normally allowed from the LINE profile until `cancel_deadline_days` before the run's first session, as defined per run (e.g. 7 or 30). After that, only staff can cancel, except during the rescheduling cancellation window below. Cancelling a registration releases its reserved seats; each affected queue is promoted independently, subject to the promotion cutoff.

- **One deadline per run:** the same deadline applies in both modes. In per-session mode a member may cancel some sessions and keep the others before that deadline. A member who registers after the deadline cannot self-cancel; LIFF shows “ติดต่อเจ้าหน้าที่เพื่อยกเลิก” and staff cancel.
- **Rejoin:** registering again after cancelling reuses the same registration row and runs the normal seat check. A free seat is taken as usual (`confirmed`, or `submitted` when approval is on); if full, the member joins the end of the queue. The earlier cancellation stays in `audit_logs`.
- **Rejoin answers and history:** prefill previous question answers, allow updates, and validate against the run's current permitted question configuration. A saved rejoin outcome (`submitted`, `confirmed` or `waitlisted`) creates a new snapshot version and points the rejoined booking to it. A refused submission does not replace a snapshot. Preserve all earlier versions outside `audit_logs`; audit logs continue to contain field names and event metadata, never answer values.
- **Per-session snapshot scope:** rejoining cancelled sessions or adding another session later creates a new snapshot version for the newly submitted session entries only. Existing session entries retain their snapshot references and answers. Current booking views and exports use each booking's referenced version; previous versions remain available as history under the same registration-access and sensitive-field permissions.
- **Promotion cutoff:** automatic waitlist promotion runs only while registration is open (until `registration_closes_at`; with no close time, until 1 day before the session). After that a freed seat stays empty, staff see “N seats free, M waiting”, and promote by hand after calling the member.

### Staff walk-in registration

- **Closed registration:** on the session day, staff may register a walk-in after registration closes; record the reason and actor in `audit_logs`.
- **Approval and attendance:** the staff action immediately confirms the booking, including when approval is normally required. Mark the member present only for today's attended session, not other sessions in the booking.
- **Full capacity:** staff must explicitly increase the applicable run or session capacity, with a recorded reason, before admitting the walk-in. Recheck capacity transactionally; never silently overbook.
- **Existing waitlist:** show waiting members before staff confirm the walk-in. Admitting a walk-in ahead of them requires an explicit reason, recorded in `audit_logs`; it does not remove their queue entries.
- **Cancelled session or run:** block walk-in registration.
- **Own or family records:** another authorized staff member must confirm the walk-in under the existing self-approval restriction.

### Editing runs after bookings exist

- **Lock trigger:** the first saved registration locks the run's registration mode (`per_session_registration`), approval setting (`require_approval`) and session list. Pending and waitlisted registrations count; later cancellation or rejection does not unlock these settings.
- **Session list:** after the lock, staff cannot add or delete sessions. Existing sessions may be rescheduled or cancelled through the rules below; cancelled sessions remain recorded.
- **Allowed edits:** staff may change dates, times and locations, cancel sessions or the run, and adjust the applicable capacity. Date/time changes follow the existing notification and rescheduling-cancellation rules.
- **Capacity floor:** whole-run capacity cannot fall below the number of `submitted` plus `confirmed` registrations. In per-session mode, each session's capacity cannot fall below its own `submitted` plus `confirmed` entries. Waitlisted, rejected and cancelled entries do not count toward this floor.
- **Transactional enforcement:** use the same run lock as registration and promotion when checking these edits. Reject locked-setting changes and capacity reductions below the current reserved-seat count in the API, with the reason shown to staff. Capacity increases retain the existing promotion rules and audited walk-in exception.

### Staff cancel or reschedule

- **Cancel one session, whole-run mode:** mark that session cancelled and stop its reminders and attendance. Keep whole-run bookings valid for the remaining sessions; run-level seat reservations and waitlist stay unchanged. Notify everyone registered or waitlisted for the run.
- **Cancel one session, per-session mode:** affected session entries become `cancelled` with `cancel_reason = organization`; other session entries stay unchanged. Stop reminders, attendance and promotion for the cancelled session. Notify everyone registered or waitlisted for that session.
- **Cancel the entire run:** cancel all active bookings, including pending and waitlisted entries, with `cancel_reason = organization`. Stop reminders, attendance and promotion for the run. Notify everyone affected, including the waitlist.
- **Cancellation notices:** send one notice per affected member through LINE push, else email where available. Each push uses LINE quota.
- **Reschedule a session (new date or time):** bookings stay. Notify confirmed, pending (`submitted`) and waitlisted members; reminders follow the new date.
- **Rescheduling cancellation window:** allow self-cancellation until 7 days after the change. Preserve an existing later cancellation deadline, but cap the resulting deadline at the affected session's new start time. If that start time has passed, cancellation requires staff assistance.
- **Rescheduling cancellation scope:** in per-session mode, members may cancel the changed session and keep other bookings. In whole-run mode, members may withdraw from the remaining course; previous attendance stays recorded. Dropping only the changed session from a whole-run booking is outside the POC. Released seats follow the existing promotion rules and cutoff.

### Shared question library

- **Reusable questions:** staff and admins create questions in an organization-scoped library, then select them for course templates.
- **Supported types:** short text, paragraph, single choice, dropdown, checkboxes, and date.
- **Course defaults:** staff select and order questions, configure labels/options, and set required/optional. Standard member fields stay fixed and come from the member profile.
- **Run configuration:** each new run copies its course's questions; staff can adjust that run's form. Later library or course edits do not change existing runs.
- **History:** immutable registration snapshot versions preserve the question wording/options and submitted answers for each submission. Rejoining saves a new version; later question edits or submissions do not change past answers.
- **Access:** additional answers follow registration access permissions; custom questions do not expose restricted uploaded documents or bypass export restrictions.
- **Editing after first registration:** once a run has a registration, staff may fix wording, reorder, add optional questions (earlier registrants show a blank) and append options. Changing a type, deleting a question or option, or adding a required question is blocked, with the reason shown. Excel columns key on the stable question `id`, so wording fixes do not break exports.
- **Sensitive questions:** each question has a `sensitive` flag, default off; the builder hints “ถามเรื่องสุขภาพ/ความพิการ/รายได้ → ติ๊ก”. Sensitive answers are encrypted 🔒 in the snapshot, visible to staff on screen, left out of the staff Excel export, and included in the admin export (logged).

### Case-note history

- **Encrypted revisions:** creating a case note saves its first revision; every permitted edit appends a new encrypted revision and updates the current note in the same transaction. Previous text versions are never overwritten by edits.
- **Existing edit limits:** staff and admins may edit only their own notes within 24 hours of the note's original creation. Saving a revision does not restart that window. Only admins may delete case notes.
- **History access:** staff and admins may read revision history under the same organization scope and visibility rules as the parent case note. Participants never receive current or historical note text. Revisions follow the parent note's deletion and retention policy.
- **Audit boundary:** log note creation, edits, deletion and history views with actor, time, entity references and changed field names. Store note text only in encrypted case-note records and revisions, never in `audit_logs`.

### Profile edit approval

**Member edits** to the allowed profile fields in section 3 create a `profile_change_request` holding old and new values. Staff see a dashboard badge and approve or reject each request. Approved changes update the profile only; past registration snapshots stay unchanged. Members contact staff for corrections to hidden intake fields.

### Printable sign-up form

1. **Choose members:** when members arrive for the course, staff open the run → “Print forms for unsigned members”, or print one member from the profile. Staff may also print forms before the course day.
2. **Prefill:** render the แบบคำขอรับบริการ layout from an HTML template, including intake fields staff may read. Leave missing values and Part 3 blank.
3. **Generate and log:** PDF is generated on demand, never stored; every print is logged.
4. **Collect signature:** member or guardian signs the physical form on site; staff tick “ได้รับเอกสารลงนามแล้ว”. Online sign-up or course registration alone never marks the paper form as signed. Optional signed-form scan remains admin-only to upload, view, download, and delete.

### Attendance

**Session attendance:** on each session day staff open the confirmed list on a phone and tick present or absent. Confirmed walk-ins are marked present only for today's attended session, under the walk-in rules above. Attendance feeds the Excel export and the dashboard (attended vs registered).

- **Delivery deadline:** manual attendance must be complete and ready for real use by **31 December 2026**, including the staff dry-run, dashboard and Excel export.
- **Acceptance:** the full POC cannot be accepted until manual attendance works; no January 2027 fallback. QR check-in and certificates remain outside the POC.

## 6. Data model (PostgreSQL)

**Organization isolation:** every table except `organizations` carries `organization_id`; every query is scoped by it. **🔒 means field-level encryption**, not an admin-only permission. Section 3 defines who can read/write each category; staff can access encrypted intake fields and case notes, while stored document contents remain admin-only.

| Table | Key fields | Notes |
| --- | --- | --- |
| `organizations` | id, name, settings | FamilyLink = first row |
| `users` | id, org\_id, email, password\_hash, role (admin/staff), active, member\_id (nullable) | Staff login; member\_id blocks self-approval; Google/LINE login later |
| `line_accounts` | id, org\_id, line\_user\_id (unique), display\_name, rich\_menu\_state | One LINE → many members |
| `members` | id, org\_id, line\_account\_id (nullable), source (line/paper/walkin/invite), member\_type 🔒, first\_name, last\_name, birth\_date, phone\_mobile, phone\_home, email, facebook, address fields, province\_id, district\_id, subdistrict\_id, postcode, marital/education/occupation/housing fields, household\_size, household\_earners, household\_income 🔒, disability\_type 🔒, citizen\_id 🔒, citizen\_id\_hash, completeness, signed\_form\_at, deleted\_at | Fields from แบบคำขอรับบริการ Part 1; citizen\_id\_hash = HMAC blind index, unique per org, used for duplicate check |
| `member_relations` | member\_id, related\_member\_id or name, relationship, citizen\_id 🔒, kind (caregiver/emergency), contact fields | Part 1 §2.1 and §2.2 |
| `member_documents` | `id`, `member_id`, `doc_type_id`, `file_key` 🔒, `mime`, `size`, `uploaded_by` (member/staff/admin), `verified_by`, `verified_at`, `deleted_at` | ID card copy + other docs; admin-only stored-file access, verification, and deletion |
| `document_types` | id, org\_id, name, sensitive | Editable list |
| `service_types` | id, org\_id, name, active | The 6 circled services |
| `member_service_interests` | member\_id, service\_type\_id | Part 2 |
| `case_notes` | id, member\_id, body 🔒, author\_id, created\_at, edited\_at, deleted\_at | Part 3; current text; encrypted text history in `case_note_revisions`, event metadata only in `audit_logs` |
| `case_note_revisions` | `id`, `case_note_id`, `version`, `body` 🔒, `created_by`, `created_at` | Initial text and every permitted edit; unique (`case_note_id`, `version`); append-only during editing; parent note's access, deletion and retention rules apply |
| `profile_change_requests` | id, member\_id, changes 🔒 (jsonb old/new), status, reviewed\_by, reviewed\_at | Member edits awaiting approval |
| `signup_requests` | id, line\_account\_id (nullable), invite\_id (nullable), submitted\_data 🔒 (jsonb), consent (jsonb), held file keys 🔒, candidate\_member\_ids, status (pending/linked/created\_new/rejected), reviewed\_by, resolved\_member\_id, created\_at | Signups matching an existing normalized full name and birth date; consent copied to `consents` on resolve; rejected/abandoned purged after 30 days |
| `courses` | id, org\_id, name, description | Reusable template |
| `course_service_tags` | course\_id, service\_type\_id | Links courses to interests |
| `course_runs` | `id`, `course_id`, `batch_name`, `location`, `capacity`, `require_approval`, `waitlist_enabled`, `per_session_registration`, `registration_opens_at`, `registration_closes_at`, `cancel_deadline_days`, `status` | One batch; run capacity applies to whole-run registration |
| `course_sessions` | `id`, `run_id`, `day_no`, `date`, `start_time`, `end_time`, `location`, `online_url`, `capacity` | Session capacity applies in per-session registration mode |
| `registrations` | `id`, `run_id`, `member_id`, `status`, `waitlist_position`, `source`, `snapshot_id` (current whole-run snapshot; nullable in per-session mode), `registered_by` (member/staff), `cancelled_at`, `cancel_reason` (member/staff/organization) | Unique (`run_id`, `member_id`). Whole-run status: `submitted` / `confirmed` / `waitlisted` / `rejected` / `cancelled`. In per-session mode, run-level status/queue are unused; display summary from session entries |
| `registration_sessions` | `registration_id`, `session_id`, `status`, `waitlist_position`, `snapshot_id`, `cancelled_at`, `cancel_reason` | Per-session mode; unique (`registration_id`, `session_id`); same five statuses, with independent session queues; each entry references its own submission's snapshot version |
| `registration_snapshots` | `id`, `registration_id`, `version`, `snapshot` (jsonb member details + question definitions + answers; sensitive parts 🔒), `created_at`, `created_by` | Immutable submission history; unique (`registration_id`, `version`). Initial submission, rejoin or adding sessions creates a version; existing versions are never overwritten by later submissions |
| `attendance` | `session_id`, `member_id`, `status` (present/absent), `marked_by`, `marked_at` | Unique (`session_id`, `member_id`); walk-ins auto present |
| `question_library` | `id`, `label`, `type`, `options` (jsonb), `sensitive`, `active` | Organization-scoped reusable questions; staff/admin editable |
| `course_questions` | `id`, `course_id`, `library_question_id`, `label`, `type`, `options`, `required`, `sensitive`, `position` | Copied question definitions and course-specific defaults |
| `run_questions` | `id`, `run_id`, `course_question_id`, `label`, `type`, `options`, `required`, `sensitive`, `position` | Copied when run is created; independent of later library/course edits; structure locked after first registration; `id` is the stable export column |
| `signup_invites` | `id`, `token_hash`, `mode` (signup/link), `created_by`, `prefill`, `expires_at`, `used_at`, `member_id` | One-time, expires after 7 days. `signup`: new member sign-up only. `link`: link QR for an existing member (`member_id` preset) |
| `consents` | id, member\_id, purpose, version, granted, consented\_by (self/guardian/caregiver), guardian\_name, guardian\_relationship, ip, user\_agent, created\_at | Never updated; new row per change |
| `notifications` | `id`, `org_id`, `member_id` (nullable for grouped messages), `line_account_id` (nullable), `items` (jsonb member/session references), `channel` (line/email), `template`, `status`, `error`, `attempts`, `next_attempt_at`, `dedupe_key` (unique), `sent_at` | One row per outbound message; grouped LINE reminder records all included members/sessions; also tracks LINE quota use; outbox written in the same transaction, sent after commit, up to 5 retries |
| `audit_logs` | id, org\_id, actor\_type (user/line\_account/system), actor\_id, action, entity, entity\_id, details (field names only, never values), created\_at | Views of sensitive data, exports, prints, edits |

**Paid membership.** Members are `general` by default; staff or admin upgrade them after payment, which is handled offline (cash/transfer). The system records it for filtering and reports, it does not take payments.

| Table | Key fields | Notes |
| --- | --- | --- |
| `membership_tiers` | id, org\_id, name (e.g. สมาชิกทั่วไป / สมาชิกสามัญ / สมาชิกตลอดชีพ), fee, duration\_months (null = lifetime), active | Editable by admin |
| `memberships` | id, member\_id, tier\_id, starts\_at, expires\_at, amount\_paid, paid\_at, payment\_method, receipt\_no, recorded\_by, note, voided\_at, voided\_by, void\_reason | One row per payment/upgrade; history kept |
| `members` (added) | current\_tier\_id, membership\_expires\_at | Denormalized for fast filtering; updated from membership records; expiry preserves the paid tier and displays an expired status instead of downgrading to general |

**Membership expiry and renewal:**

- **Membership record:** store paid tier, start date and expiry date; lifetime membership has no expiry date.
- **Expired membership:** display “Expired” alongside the previous paid tier. Preserve membership and payment history; do not automatically downgrade the tier to general.
- **Course access:** expiry does not restrict course registration; paid membership remains informational in the POC.
- **Renewal:** staff record the renewal payment and new expiry date; retain earlier payment and membership records.
- **FamilyLink confirmation:** actual tier names, fees and renewal periods must be confirmed before real use.

**Reports and filters:** members by tier, active vs expired, expiring in next 30 days, fees collected per month. Excel export gets tier, expiry and active/expired status columns. Upgrades and renewals are logged in `audit_logs`.

## 7. Member form fields

Online sign-up takes about 2 minutes; the most sensitive fields are filled by staff on site, so they never pass through a phone form unless the member chooses to upload.

| Field group | Online (LIFF) | Staff on site |
| --- | --- | --- |
| Member type (ผู้ดูแล / คนพิการ / ผู้มีแนวโน้มจะพิการ) | Required | Edit |
| First name, last name, birth date | Required | Edit |
| Mobile phone | Required | Edit |
| Province, district | Required (dropdown) | Edit |
| Requested services (tags) | Required, at least 1 | Edit |
| Relationship to LINE owner (when registering someone else) | Required | Edit |
| Email | Optional | Edit |
| ID card copy, other documents | Optional upload | Staff/admin upload; admin alone views, downloads, verifies, or deletes stored documents |
| Consents: privacy notice (required), sensitive data for any document upload, news, photo; self or guardian | Privacy notice required; sensitive-data consent shown and required only when uploading any document; news/photo optional | Paper signature |
| Citizen ID, full address, subdistrict, postcode, home phone, Facebook | — | Fill |
| Disability type | — | Fill |
| Marital status, education, occupation, housing, household size/earners/income | — | Fill |
| Caregiver details, emergency contact | — | Fill |

**Validation:** citizen ID check digit; Thai mobile format; birth date not in future; address via province → district → subdistrict dropdown with postcode auto-fill. Excel export columns follow this form order.

**Online document-upload consent:** apply the same rule to LINE sign-up, “Add another member” and browser-invite sign-up.

- **Any document:** treat every uploaded document as sensitive because its contents are unknown before upload. No document type is exempt.
- **Consent before upload:** when the applicant chooses to attach a document, show an unchecked sensitive-data consent box and require explicit agreement before accepting or storing the file. Enforce the requirement in the API as well as the form.
- **No documents:** do not show or require the sensitive-data consent box. The required privacy-notice acknowledgment remains separate.
- **Record consent:** save the consent purpose, text version, person consenting and original timestamp with the signup. Pending signup requests retain this consent and copy it to `consents` on resolution under the existing review flow.

## 8. LINE, notifications and scheduled jobs

**Operational delivery:** all operational notices follow the same LINE → email → staff-follow-up rule below. Email fallback requires an available recipient email address. LINE quota use is shown to admins; actual quota must be confirmed with FamilyLink.

**LINE pieces**

- **LIFF app** (Angular route inside LINE): sign-up, add member, course list, profile. Backend verifies the LIFF ID token server-side to get the real `line_user_id`; never trust a user ID sent from the browser.
- **Rich menus:** two menus — guest (สมัครสมาชิก) and member (ลงทะเบียนคอร์ส / โปรไฟล์ / เพิ่มสมาชิก). Guest is the default; the backend links the member menu per user after sign-up.
- **Webhook:** follow/unfollow events (mark LINE unreachable on unfollow).
- **Needs from FamilyLink:** admin access to their LINE OA and LINE Developers console.

**Messages**

| Event | LINE push | Email | Notes |
| --- | --- | --- | --- |
| Signup review: linked / created / rejected | ✅ | ✅ | Tell the applicant the outcome without exposing matched existing records |
| Registration result: confirmed / submitted / waitlisted | ✅ | ✅ | Names the member; lists each selected session's outcome in per-session mode |
| Approved / rejected | ✅ | ✅ | Names affected session or whole run |
| Waitlist promoted | ✅ | ✅ | Names affected session or whole run and resulting status |
| Reminder, 1 day before each confirmed session | ✅ | ✅ | Daily job; combine reminders for tomorrow into one LINE message per linked account, covering its members and sessions |
| Profile edit approved / rejected | ✅ | ✅ | Outcome only; no sensitive intake values |
| Session or run cancelled | ✅ | ✅ | Notify affected registered and waitlisted members |
| Session rescheduled | ✅ | ✅ | Notify confirmed, pending and waitlisted members of the new date/time |

- **LINE first:** send when the account is linked, reachable and has quota available.
- **Email fallback:** when LINE is unavailable or sending fails after applicable retries, use the recipient's available email address. Do not also send email after a successful LINE send.
- **Staff follow-up:** if neither channel is available or sending fails on both, flag the notice for staff follow-up instead of silently dropping it.
- **Message content:** keep notices brief; exclude sensitive intake details and document contents. Delivery tracking records sending outcomes, not proof that a recipient read the notice.

**Reminder eligibility:** only `confirmed` session entries receive reminders in per-session mode. A `confirmed` whole-run registration receives reminders for each session in that run. Exclude `submitted`, `waitlisted`, `rejected`, and `cancelled` entries. For grouped LINE messages, identify each member and session clearly; email fallback goes to the relevant member's email without exposing other members' details.

**Delivery (outbox).** A `notifications` row is written in the same database transaction as the change that causes it. A worker sends it after commit and retries up to 5 times with growing delays. Scheduled reminder creation also uses a transaction and a unique `dedupe_key` so repeated job runs reuse existing records.

- **Grouped LINE reminders:** one record per organization, LINE account, reminder template and target session date (`Asia/Bangkok`), with the LINE channel included in `dedupe_key`. Its `items` list covers the linked members' eligible confirmed sessions on that date.
- **Repeated jobs and retries:** reuse the existing reminder record and its attempt history; do not create another reminder for the same key or resend a successfully sent record. Failed attempts retry that record under the outbox retry policy.
- **Eligibility before sending:** recheck the current linked account, confirmed status, session date and session/run cancellation state. Remove cancelled or otherwise ineligible items before sending; skip an empty reminder.
- **Email fallback:** create separately tracked email records per member, reminder template and target session date within the organization. Each contains only that member's eligible items. Include the email channel in `dedupe_key`; repeated fallback processing reuses those records. Successful LINE sends do not also generate fallback email.

**Scheduled jobs** (NestJS `@nestjs/schedule`)

| Job | When |
| --- | --- |
| Reminders for confirmed sessions tomorrow; group by LINE account | Daily 09:00, `Asia/Bangkok` |
| Close registration at `registration_closes_at` | Every 15 min (display only; the API checks open/close times and cancellation deadlines on every request, including the explicit staff walk-in and rescheduling exceptions) |
| Retention / soft-delete purge (inactive until retention is set) | Daily |
| DB backup + ping healthchecks.io | Daily 02:00 |

## 9. Security and PDPA

Membership in a psychosocial disability centre is itself health data (PDPA s.26), so the whole member database gets sensitive-data controls, not only a few fields.

| Control | How |
| --- | --- |
| Legal basis | Online sensitive-data consent is collected before any document upload; the physical form is signed on site. FamilyLink's lawyer must confirm the legal basis for membership and intake processing before real data use, including whether the s.26(2) non-profit exemption applies. Guardian consent path; consent rows are append-only and versioned |
| Encryption in transit | HTTPS only (Let’s Encrypt via reverse proxy); HSTS |
| Encryption at rest | Disk encryption on server; field-level AES-256-GCM for 🔒 fields and files; key from env/secret file, never in DB, git or backups; case-note revision text and sensitive parts of change requests, snapshots and signup requests are encrypted too. Key recovery: key kept in the owner's password manager plus a sealed printed copy held by a FamilyLink admin; the monthly restore test includes fetching it |
| Access control | Role guard on every NestJS route; organization scope on every query; staff may read/edit intake fields and case notes; stored document contents, download access, verification, and deletion are admin-only; strip restricted fields from participant responses server-side |
| Audit | Log every sensitive view, including case-note history, document view, export, PDF print, delete, role change; case-note edits log event metadata and changed field names, never current or historical note text; logs hold field names, never values |
| Uploads | Allow-list types (JPG/PNG/HEIC/PDF), ≤ 10 MB, magic-byte check, re-encode images, strip EXIF/GPS, watermark “ใช้สำหรับสมาคม FamilyLink เท่านั้น”, stored outside web root, served only via authenticated endpoint |
| Exports and PDFs | Generated on demand, not stored; sensitive Excel columns and sensitive custom answers admin-only; staff may print intake fields on signup PDFs, with case-note section blank and no uploaded document copies; every export/print logged |
| Messaging | No sensitive data in LINE or email |
| Auth | bcrypt/argon2 passwords, login rate limit, session timeout, admin can disable staff |
| Retention | “Keep forever” for now; soft-delete + purge job built so a policy becomes config |
| Breach | Tell FamilyLink within 24 h; FamilyLink reports to PDPC within 72 h (DPA §6) |
| Paperwork | DPA + privacy notice updated for membership-as-sensitive-data (10 Oct 2026); lawyer review and placeholders still needed before real data goes in |

## 10. Infrastructure

One Docker Compose stack on the home server, same pattern as jubBad; only the reverse proxy is reachable from the internet.

| Service | Image / tech | Exposed |
| --- | --- | --- |
| `proxy` | Caddy (auto HTTPS) | 443 public |
| `web` | Angular build served by Caddy or nginx | internal |
| `api` | NestJS + Prisma | internal |
| `db` | PostgreSQL 16 | internal only, never public |
| `pdf` | Gotenberg (headless Chromium) with Sarabun font | internal |
| `backup` | cron container: pg\_dump + rclone crypt | none |

Domain: `familylink.wongnok.dev` (subdomain, so it can move to FamilyLink’s own domain with a redirect later). Admin access via Tailscale SSH.

**Backups (3-2-1)**

| What | Where | How often |
| --- | --- | --- |
| `pg_dump` | Second HDD | Daily |
| Uploaded files | Second HDD | Daily (rsync) |
| DB dump + files, encrypted with `rclone crypt` | Google Drive | Daily |
| Restore test | Staging container | Before launch, then monthly |

**Monitoring**

- UptimeRobot checks `https://familylink.wongnok.dev/api/health` every 5 min (health endpoint checks DB); alerts to LINE/email.
- healthchecks.io pinged by backup job; alerts if a backup is missed.
- Sentry free tier for API and Angular errors.
- `smartd` for HDD health; disk space alert.

Email sending: Resend or Brevo free tier; sender address to confirm with FamilyLink.

## 11. Open questions

**Gide**

- [x] Other documents: บัตรคนพิการ, ทะเบียนบ้าน, ใบรับรองแพทย์ (sensitive), ใบรับรองการอาศัยในนนทบุรี, other — seeded into `document_types`, admin can add more
- [ ] **First real course:** confirm the early-2027 date for operational follow-up; POC readiness does not depend on this date.
- [x] **POC deadline and acceptance:** every POC feature complete, tested with staff and ready for real use by **31 December 2026**; acceptance through the December staff dry-run.
- [ ] Fill DPA and privacy-notice placeholders, incl. liability cap

**POC timing decision:** every POC feature must be complete, tested with staff and ready for real use by **31 December 2026**. The December staff dry-run is the acceptance gate, including attendance and real LINE integration. The first real course in early 2027 is operational follow-up after acceptance. The DPA term still needs extension past that course to cover continued operation.

**Ask FamilyLink**

- [ ] Admin access to LINE OA + LINE Developers console
- [ ] Exact free-plan push quota they see in LINE OA Manager
- [ ] Email sender address
- [ ] Retention periods (general, sensitive, ID copies)
- [ ] Privacy contact person / DPO
- [ ] Lawyer review of DPA and privacy notice (now covering membership as sensitive data)
- [ ] Electricity cost per month (tracked on server)

**Paid membership (ask FamilyLink)**

- [ ] Tier names and fees
- [ ] Confirm yearly/lifetime tiers and renewal periods
- [x] Expiry behavior: preserve paid tier and history, show “Expired”, keep course registration available; staff record renewal payment and new expiry date
- [x] Benefits in the system: label only for now (filter and report), no rule changes
- [x] Payment stays outside the system; receipt number recorded as an optional text field
- [ ] Import current paid-member list (maybe)
