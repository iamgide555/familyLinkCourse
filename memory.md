# FamilyLink Session Memory

- **Saved:** 11 October 2026, `Asia/Bangkok`. **Updated:** 17 October 2026.
- **Purpose:** resume website-first planning using local Markdown documents.
- **Current status:** user approved five spec-gap decisions on 17 October. Redesigned roadmap and five milestone plans now live under `docs/plans/`, awaiting plan review and execution-method selection. `docs/superpowers/` remains removed; production implementation has not started.
- **Source of truth:** `FamilyLink — System Design (POC).md`. This memory records discussion state; unresolved proposals below are not approved requirements.
- **Documentation workflow:** edit local `.md` files directly. No further Claude Docs editing, syncing or export dependency. Remote artifact has not been deleted.

---

## 1. User Preferences and Working Rules

- **Communication:** caveman mode, full intensity, remains active until user says otherwise. Keep wording terse; preserve technical accuracy. Use full explanations when compression would create ambiguity.
- **Collaboration:** discuss consequential product choices one at a time, with recommendation and trade-off. Avoid repeatedly requesting approval for decisions already made.
- **Markdown:** logical heading hierarchy, short bullets, bold key terms, horizontal dividers between major sections, and backticks around paths, commands, filenames, and variables.
- **Scope:** continue implementation planning using local Markdown only. Initial planning documents drafted; no production implementation has started.
- **Delegation:** no subagents used or requested.

---

## 2. Workspace and Documentation

- **Workspace:** `/Users/iamgide/Desktop/project/familylink`.
- **Current specification:** `FamilyLink — System Design (POC).md`, revision 17 October 2026. Local Markdown is the sole maintained specification. Earlier Claude Docs copy is historical; do not resume its sync or export workflow.
- **Archive (13 Oct):** `Project_Summary_For_GF.pdf` and `FamilyLink-Phase1-Proposal-TH.docx` also moved to `docs/archives/`. Root keeps only spec + this file.
- **Archive:** user requested all older docs move to `docs/archives/`; seven files moved without content changes, preserving nested paths.
- **Existing code:** static HTML/CSS/JavaScript prototype under `prototype/`; production Angular/NestJS application still needs building.
- **Repository:** earlier `git status --short` reported that workspace was not a Git repository. Recheck before planning Git operations; do not claim commits exist.
- **Implementation plans:** previous roadmap and bootstrap plan discarded at the user's request; `docs/superpowers/` deleted. New plans use `docs/plans/2026-10-17-poc-roadmap.md` and five linked milestone files, created from the revised authoritative spec rather than restoring discarded drafts.

### Archived Documents

- **Planning:** `docs/archives/familylink-phase1-full-overview.md`.
- **English questions:** `docs/archives/familylink-phase1-questions.md`.
- **Thai questions:** `docs/archives/familylink-phase1-questions-th.md`.
- **Thai memo:** `docs/archives/familylink-phase1-short-memo-th.md`.
- **Prototype product brief:** `docs/archives/PRODUCT.md`.
- **Prototype design system:** `docs/archives/DESIGN.md`.
- **Prototype surface brief:** `docs/archives/prototype/.impeccable/surfaces/index-html.md`.

### Existing Prototype

- **Screens:** `prototype/index.html`, `prototype/create-run.html`, `prototype/register.html`, `prototype/registrations.html`.
- **Shared behavior/style:** `prototype/app.js`, `prototype/styles.css`.
- **Visual reference:** Thai-first UI, Sarabun/Kanit typography, mint background, paper-ticket surfaces, teal actions. Archived prototype docs are reference material, not current production requirements.

---

## 3. Product and Delivery Baseline

- **Product:** one system for FamilyLink member records, course registration, and staff operations, replacing fragmented Google Forms, spreadsheets, LINE, and paper workflows.
- **Members:** caregivers and people with psychosocial disabilities; spec treats entire member database as sensitive.
- **Users:** approximately two admins and six to ten staff; members use LINE self-service, staff use browser dashboard.
- **Membership before registration:** one LINE account may manage several family members; each member links to at most one LINE account.
- **Core hierarchy:** reusable course → run/batch → sessions. Support whole-run and selected-session registration.
- **POC features:** member signup, paper/walk-in intake, LINE linking, profile approval, document upload, case notes, course operations, question library, capacity/approval/waitlists, cancellations, paid membership records, PDFs, Excel exports, notifications, consent, and audit logs.
- **Paid membership:** offline cash/transfer payment records, tiers, expiry, filters, and reports. Benefits are labels only; no registration eligibility changes or online payment processing.
- **Stack:** Angular, NestJS, Prisma, PostgreSQL 16; Docker Compose on home server; Caddy HTTPS; Gotenberg PDFs; domain `familylink.wongnok.dev`.
- **Organization isolation:** FamilyLink only initially; `organization_id` scopes data for future NGO separation.
- **Delivery:** every POC feature complete, tested with staff and ready for real use by **31 December 2026**. December staff dry-run is acceptance; early-2027 real course is follow-up. Extend DPA term through real-course operation.
- **After POC:** QR check-in, certificates, old spreadsheet import, member login without LINE, interest-based invitations, partner NGOs, and billing. Manual attendance is in POC scope under the approved timing below.

---

## 4. Approved Decisions Already Recorded in Current Spec

### Permissions

- **Approved option A:** staff handle intake, including citizen ID, disability details, household income, case notes, and printing completed signup forms.
- **Admin-only documents:** viewing/downloading stored ID-card copies and other uploaded sensitive documents, and deleting those documents. Staff cannot access stored copies.
- **Existing admin restrictions retained:** sensitive Excel exports, member deletion, staff-account management, payment edit/void, and tier/fee management.
- **Encryption versus permissions:** encrypted fields can be readable by authorized staff; encryption does not itself mean admin-only.
- **Documented implementation interpretation:** staff may upload general documents and see receipt/status metadata; verification requires admin access. Signed-form scan upload remains admin-only from original spec.
- **Generated PDFs:** may contain staff-accessible intake fields; case-note section remains blank; uploaded document copies are not included.

### Seats, Approval, and Waitlists

- **Approved reservation rule:** both `submitted` and `confirmed` consume capacity. Approving a pending entry does not consume a second seat.
- **Approved per-session capacity:** selected sessions have independent capacity, status, and waitlist position.
- **Approved partial outcomes:** available sessions reserve seats even when another selected session is full and waitlisted.
- **Approved warning:** selecting a full session warns that member joins waitlist without guaranteed seat. Full sessions without waitlists cannot be selected.
- **Confirmation:** display each session's actual outcome clearly; warning does not eliminate mixed statuses in database.
- **Promotion:** rejection/cancellation of reserved entry releases seat; queue promotes to `submitted` if approval required, otherwise `confirmed`.
- **Whole-run mode:** keeps run-level capacity, status, and queue; per-session mode stores authoritative state in `registration_sessions`.

### Access Outside LINE

- **Approved boundary:** staff invite links allow member signup in ordinary browser only.
- **LINE self-service:** course registration and profile access remain in LINE.
- **Members without LINE:** staff handle course registration and profile changes.

### Shared Question Library

- **Approved custom questions:** staff configure extra registration questions, similar to Google Forms.
- **Approved shared library:** staff create reusable questions and select them across courses.
- **Accepted proposed behavior:** course templates hold defaults; new runs copy definitions for independent adjustment; later library edits do not change existing runs or past answers.
- **Question types in spec:** short text, paragraph, single choice, dropdown, checkboxes, and date; configurable labels, options, required/optional, and ordering.
- **Standard member fields:** remain fixed and reuse member profile data.
- **Historical records:** registration snapshots preserve submitted answers and question wording/options.

### Reminders

- **Approved timing:** one day before each confirmed session, not only first session.
- **Approved grouping:** combine same-day reminders for members/sessions sharing one LINE account.
- **Excluded statuses:** pending, waitlisted, rejected, and cancelled.
- **Delivery:** LINE first when reachable and quota available, email fallback where supported and available; otherwise staff contact.
- **Schedule in spec:** daily at 09:00, `Asia/Bangkok`.

---

## 5. Latest Review: Unresolved Product Rules

- **Readiness correction:** assistant initially said spec was ready for planning. User requested another check. Full review found additional material gaps; assistant acknowledged earlier readiness assessment was too broad.
- **Important distinction:** following recommendations were presented in latest review but user has not approved them. They have not been added to current spec as decisions.

### 5.1. Existing-Member LINE Linking

- **Current rule:** exact match on first name, last name, birth date, and phone automatically links an unlinked existing member.
- **Finding:** knowing those values does not prove ownership of member record. Server verification of LINE identity does not verify ownership of existing member identity.
- **Proposed change:** staff verification before linking any existing member, including exact matches. New members still sign up directly.
- **Resolved 13 Oct:** approved. Every match (exact or partial) goes to staff review; nothing auto-links. Also decided 13 Oct and added to spec: caregiver unlink/transfer control, staff-as-member self-approval block (`users.member_id`), duplicate check on staff entry (`citizen_id_hash`), manual attendance in POC.

### 5.2. Pending Signup and Matching

- **Current rule:** partial matches create review requests without creating duplicate members.
- **Finding:** consent model requires a member, while pending signup has none; browser invite applicant may also lack LINE account expected by link-review model. Applicant experience while waiting is undefined.
- **Proposed change:** pending signup record holds submitted details and consent; staff resolve to existing or new member; applicant sees awaiting-review state.
- **Resolved 13 Oct (A+B):** link QR (`signup_invites.mode = link`) shown after staff save paper/walk-in member, scan in LINE = instant link. Rare matches → `signup_requests` (replaces `link_review_requests`); member sees waiting screen, no extra step; staff link/create/reject; 30-day purge.

### 5.3. Cancellation, Rejoining, and Promotion Cutoff

- **Current rule:** self-cancel deadline remains relative to run's first session, even when member selected only later sessions.
- **Finding:** individual-session cancellation, rejoining after cancellation, and automatic promotion cutoff are undefined.
- **Proposed change:** selected session date controls cancellation in per-session mode; whole-run bookings retain first-session deadline; rejoining goes to queue end; automatic promotion stops at registration close.
- **Resolved 13 Oct:** one cancel deadline per run in both modes (user choice; late registrants ask staff); per-session members may cancel some sessions. Rejoin reuses row + normal seat check, full → end of queue. Auto-promotion only until `registration_closes_at` (or 1 day before session); after that staff promote by hand.

### 5.4. Live Question Editing and Sensitive Answers

- **Current rule:** run questions can be adjusted; snapshots preserve past answers.
- **Finding:** live structural changes and classification of sensitive custom answers lack clear rules, especially for staff exports.
- **Proposed change:** freeze question structure after first submission, preserve stable question IDs, classify sensitive questions, and exclude sensitive answers from staff exports.
- **Resolved 13 Oct:** after first registration only safe edits (wording, reorder, add optional question, append options); type change/delete/add required blocked; export keyed on stable question id. `sensitive` flag per question (default off, builder hint); sensitive answers encrypted in snapshot, staff see on screen, excluded from staff export, in admin export.

---

## 6. Engineering Gaps Identified for Planning

- **Encryption coverage:** sensitive values copied into `profile_change_requests`, registration snapshots, or audit history need equivalent protection; protecting only original member fields is insufficient.
- **Key recovery:** spec excludes encryption keys from backups but lacks separate recovery storage. Restore procedures must include usable keys after server loss.
- **Reliable notifications:** durable retry queue/outbox, notifications after successful registration transaction, and duplicate-reminder prevention.
- **Registration deadlines:** enforce opening/closing times on each request; fifteen-minute scheduled closure cannot be sole enforcement.
- **Schema consistency:** browser-invite member source, payment-void history, precise actor IDs, expiry scheduling, and email-fallback wording need alignment.
- **Course cancellation/rescheduling:** define effects on existing registrations, reminders, and waitlists; do not allow cancelled sessions to continue sending reminders or promoting seats. Behavior may require user decision.
- **Resolved 13 Oct (all 6 approved, in spec):** encrypt sensitive parts of change requests/snapshots/signup requests, audit logs field names only; key in password manager + sealed printed copy at FamilyLink, restore test fetches it; notification outbox (same transaction, 5 retries, `dedupe_key`); API enforces open/close + cancel deadline per request; schema: source `invite`, membership void fields, audit `actor_type`; org cancel → `cancel_reason = organization` + notify all, reminders/promotion stop; reschedule → notify, reminders follow, self-cancel reopens 7 days.

---

## 7. External Inputs Still Needed

- **LINE:** OA/Developers access and actual account push quota.
- **Email:** sender address and sending provider choice.
- **Paid membership:** tier names, fees, yearly/lifetime renewal periods, and whether current paid-member import is needed. Expiry behavior approved on 14 October (section 10).
- **Privacy:** retention periods, privacy contact, lawyer review, completed DPA/privacy-notice placeholders, and DPA term extension.
- **Trial:** first real course date and concrete acceptance criteria with staff.
- **Operations:** tracked server electricity cost.
- **Dependency distinction:** these need not prevent initial foundation work, but real integrations and real-data launch depend on relevant inputs. Do not treat pending legal decisions as settled.

---

## 8. Work Completed and Verification Limits

- **Read:** all eight original project Markdown files, including hidden prototype surface brief.
- **Archived:** seven older docs; checked moved files retained exact contents and newest spec remained at root.
- **Updated:** current spec with approved rules, permission table, registration workflow, shared-question tables, per-session state, grouped notification records, and reminder rules.
- **Checked:** agreed phrases present, several superseded contradictory phrases removed, heading hierarchy valid, seven archived docs still present.
- **Limit:** those text checks did not establish full design readiness. Latest manual review found the unresolved issues recorded above.
- **Not done:** implementation plan, production code, production tests, deployments, or commits.

---

## 9. Resume Point

- **Next action:** review new `docs/plans/2026-10-17-poc-roadmap.md` and milestone plans, choose execution method, then start the staff-intake milestone. Do not restore discarded plans or recreate `docs/superpowers/` automatically.
- **Current discussion:** five spec gaps resolved and patched; user asked what comes next. Implementation plans were written and statically checked; no production implementation yet. Documentation remains local Markdown only.
- **Build-order discussion:** staff login → create paper member → search → open member profile was discussed as the first usable workflow. Member search is already approved scope; do not ask whether staff may search members again. The discarded milestone sequence is not an active plan.
- **Narrow ambiguity:** no-close-time automatic promotion cutoff for a whole-run capacity pool with sessions on different dates needs resolution in registration planning. Do not change the approved run-wide self-cancel deadline.
- **Verification:** remote document showed Saved; reload retained remaining edits and both embedded diagrams. Plans received static review only; no production tests/builds have been run.

---

## 10. Review Follow-up — 14 October 2026

- **Approved session cancellation:** cancelling one session in whole-run mode preserves bookings for remaining sessions and leaves run seats/waitlist unchanged; cancelled session has no reminders or attendance. Notify all registered/waitlisted members. Entire-run cancellation cancels active bookings and stops promotion. Recorded in `FamilyLink — System Design (POC).md`, section 5.
- **Rescheduling decision:** keep bookings; notify confirmed, pending and waitlisted members; reminders follow new date. Self-cancel deadline is the later of the existing deadline and 7 days after change, capped at affected session's new start. Per-session members may cancel that session; whole-run members withdraw from remaining course, preserving previous attendance. Released seats follow existing promotion/cutoff rules.
- **Website-first direction:** user prefers building website before real LINE integration. Proposed sequence: website/backend → member flows with development-only test identities and simulated delivery → real LINE integration → end-to-end checks. Production member access still requires real identity verification; complete POC acceptance includes LINE testing.
- **Approved walk-ins:** staff may register after closing on the session day with a reason; immediately confirm and mark present only for today's attended session. Full capacity requires an explicit, reasoned increase. Show waitlist first; admitting ahead of it requires a reason. Capacity increase and walk-in seat reservation are atomic for that explicit exception; remaining seats follow normal promotion rules. Cancelled sessions/runs blocked; own/family confirmation requires another staff member.
- **Approved duplicate citizen IDs:** same ID blocks a second member within the organization; use existing record or correct a mistyped ID. Name/birth-date/phone matches with different or missing ID may be overridden with a reason. Missing ID is allowed for incomplete members; uniqueness applies when adding/changing it, excluding the member's own unchanged ID.
- **Approved LINE profile access:** view/request staff-approved changes to name, birth date, mobile, email, province/district, member type and requested services. View-only registration/session status, tier/expiry, completeness and signed-form receipt status. Hide citizen ID, disability details, income, other extended intake fields, case notes and stored documents. Same rules for all members linked to the LINE account; hidden-field corrections go through staff.
- **Approved pending-signup scope:** block only the applicant awaiting review; show request status without exposing matched existing records. Already-linked family members retain access and registration actions. Approved linked/created member enters the switcher; accounts with no linked members see the waiting screen until review finishes.
- **Approved membership expiry:** store tier/start/expiry; lifetime has no expiry. Preserve paid tier and history, display “Expired”, and keep course registration available. Staff record renewal payment and new expiry date. Actual tier names, fees and renewal periods await FamilyLink. Removed automatic downgrade from the spec.
- **Review progress:** all six main gaps and three planning corrections from the 14 October review have recorded decisions. Engineering details still belong in implementation planning; external inputs in section 7 remain pending.
- **Approved attendance timing:** target December 2026 staff dry-run; allowed fallback January 2027 before first real course. Full POC acceptance requires working manual attendance. QR check-in and certificates remain outside POC scope.
- **Approved email fallback:** all operational notices (signup review, registration results, profile edits, cancellations, rescheduling and reminders) use LINE first when reachable and quota available; email when LINE unavailable/fails and recipient email exists; otherwise flag staff follow-up. Brief notices exclude sensitive intake details/documents. Sending outcomes are tracked without claiming the recipient read the notice.
- **Approved grouped reminders:** one LINE reminder record per account/template/target date within the organization. Repeated jobs and retries reuse it; successfully sent records are not resent. Recheck eligibility before sending, remove ineligible entries, skip empty messages. Email fallback uses separately tracked per-member records with only that member's details. Keys include channel; successful LINE sends do not also trigger email.
- **Website-first spec update:** section 2 now explicitly records website/backend first, development-only test identities and simulated delivery, then real LINE integration and end-to-end testing. Real LINE testing remains part of full POC acceptance.
- **Planning handoff:** translate conceptual tables into executable schema, including session cancellation/rescheduling state, notification recipients for pending applicants, channel fallback linkage and worker concurrency/retry behavior. Audit events record changes without storing sensitive field values. Define acceptance tests for approved exceptions and grouped reminders; this is engineering planning work, not additional unapproved product scope.
- **Verification scope:** reviewed recorded decisions and removed the superseded per-member LINE reminder key; aligned the normal self-cancel rule and scheduled closure wording with approved exceptions. Documentation checks do not verify production behavior; no production code or tests exist yet.
- **Sync status:** Claude Docs sync started and remains partial. Website-first sequence, attendance scope, profile access table, signup/linking and duplicate-ID rules, pending-request scope, waitlist/walk-in exceptions, cancellation/rescheduling, attendance details, and membership expiry were applied through Chrome UI. Diagrams preserved. Reload/persistence verification remains pending; do not claim complete sync.
- **Sync resume point:** remaining Claude edits: section 5 profile-edit paragraph, section 8 delivery introduction and fallback rules, message table (profile-email cell plus signup/cancel/reschedule rows), grouped-reminder outbox rules, scheduled closure wording, membership open-question/checklist changes, revision date. A mistaken profile-edit paragraph in the duplicate-check subsection was corrected before interruption; the original section 5 paragraph still needs its update.
- **Sync blocker:** after user said `continue`, computer control repeatedly failed with `Sky Computer Use native pipe startup failed`, including after REPL reset. Codex Document Control reports no connected document sessions. No new remote edits could be made during this continuation. Restore computer-control connection, reacquire Chrome and fresh accessibility state, finish remaining edits, then reload and verify.
- **UI editing method:** native Chrome triple-click on the exact paragraph's current text element, confirm selected text, paste HTML, then refresh accessibility state. Whole-editor `selectText` offsets were wrong around date chips; browser Find did not change the editable selection. Both accidental pastes were undone. Match selected text with whitespace normalization; retain existing embedded diagrams and tables.

---

## 11. Sync and Planning — 17 October 2026

- **Authorization:** user requested completing Claude Docs sync before starting planning.
- **Connection:** computer control recovered; Chrome opened the existing artifact URL. Codex Document Control still reported no sessions; edits used Chrome native UI.
- **Completed remote edits:** section 5 editable-profile scope; section 8 operational-delivery introduction, LINE/email/staff follow-up rules, profile-email indicator and safe-content note, signup/cancellation/rescheduling message rows, grouped-reminder outbox rules, scheduled closure field and exceptions; membership renewal question and completed expiry checklist; revision date changed to 14 October to match local spec.
- **Persistence proof:** Saved indicator before reload and after reload; all new clauses present; old `else nothing`, per-member grouped-reminder key and combined expiry question absent. Both embedded diagrams remained. Membership expiry checkbox persisted checked; renewal periods remained unchecked.
- **Sync scope:** remaining approved changes are synchronized; remote message table places signup review after profile results rather than before registration results. No semantic difference; byte-for-byte export comparison was not performed.
- **Discarded planning files:** earlier roadmap and bootstrap drafts under `docs/superpowers/plans/` were deleted at the user's request after review. They are historical work, not current implementation instructions.
- **Discarded-plan proposals:** npm workspace layout, separate bootstrap milestone, server-side staff sessions and PostgreSQL worker leases were engineering proposals. Reassess during redesign; do not treat them as approved requirements.
- **Environment observed:** Node `v22.22.3`, npm `10.9.8`, Docker CLI `29.8.2`; Docker daemon not checked. Official Angular/Nest docs consulted for initial generator/runtime compatibility. Exact dependency versions require resolution and locking at execution.
- **Limits:** no Git initialization, dependency installation, production source generation, tests, builds, commits or deployment during this planning turn.

---

## 12. Approved Spec Gaps and New Planning — 17 October 2026

- **Deadline supersedes attendance fallback:** all POC features, real LINE integration and manual attendance ready by **31 December 2026**. December staff dry-run is acceptance; January fallback removed. Early-2027 course provides follow-up feedback.
- **Gap 1 — matching:** same normalized full name **and** birth date triggers staff review regardless of phone. Shared phone alone permits separate patient record under explicitly selected/signed-in caregiver; never grants access by itself. Removed fuzzy/partial match rule and `match_kind` model field.
- **Gap 2 — signature and consent:** online signup/course registration precedes physical signing; staff print form when member arrives. Unsigned/caregiver-paper-verification pending does not block registration. Sensitive-data consent appears and is required before **any** online document upload, no document-type exceptions; no upload means no sensitive-upload prompt. Required privacy acknowledgment stays separate. Processing basis remains subject to the existing lawyer review before real data.
- **Gap 3 — booked-run edits:** first saved booking permanently locks registration mode, approval requirement and session additions/removals, including pending/waitlisted bookings. Rescheduling/cancellation and capacity edits remain allowed; capacity never falls below submitted plus confirmed reservations in the applicable pool.
- **Gap 4 — rejoin history:** prefill previous answers, allow updates, save new immutable snapshot version, preserve old versions. Reuse registration identity; new/rejoined session entries reference new snapshot while existing entries retain theirs. Added `registration_snapshots` model.
- **Gap 5 — notes:** encrypted `case_note_revisions` store original and edited text; same note permissions apply. Own-note 24-hour window remains from original creation. Audit logs contain event metadata and field names, never note text.
- **Approval:** user confirmed all five decisions and said nothing missing, then asked what comes next. No execution method has been chosen yet.
- **New plans:** `docs/plans/2026-10-17-poc-roadmap.md`, `2026-10-17-01-staff-intake.md`, `2026-10-17-02-member-self-service.md`, `2026-10-17-03-course-booking.md`, `2026-10-17-04-staff-operations.md`, `2026-10-17-05-integration-and-launch.md`. Five usable milestones, **18 tasks**; first usable workflow staff intake, no standalone bootstrap milestone.
- **Builder calls:** roadmap labels engineering choices explicitly, including npm workspaces, server-side sessions, run-lock transaction interface, whole-run no-close cutoff at one day before earliest non-cancelled session, and per-session export rows. These are plan proposals for review, not additional user decisions.
- **Verification:** static plan checks cover headers, heading hierarchy, fences, task interfaces, five checkbox steps per task and absence of unresolved placeholders. No production tests/builds run because no production app exists. No Git repository, dependency install, scaffold, commit, deployment or external message created.
