# FamilyLink Phase 1 Questions

Purpose: confirm what data Phase 1 should store before database schema and registration form design are finalized.

## Project Assumptions

- Phase 1 starts with Thai FamilyLink Association.
- System owner is Gide for now.
- Future SaaS spin-off should support separate partner NGOs.
- Staff use web admin dashboard.
- Participants register through mobile-friendly web form.
- Registration link can be sent by LINE Official Account or manually by staff.
- LINE is a communication channel, not required identity.
- Database should support multi-tenant data separation by organization.
- PDPA consent must be included from start.
- Head of FamilyLink is the decision-maker/signoff for confirming answers, even if multiple staff join discussion meetings.
- UI language: Thai primary, English support included, focus effort on Thai first.

## Most Important Questions To Confirm First

1. What participant fields must appear in every registration form?
2. Does FamilyLink need to store sensitive health or family data?
3. How are courses structured: one day, multiple days, batches, sessions?
4. Does registration need approval, waitlist, or capacity limits?
5. What attendance rule allows certificate issuance?
6. What reports or Excel exports does staff need?
7. What PDPA consent wording and data retention rules are required?

## Participant Data

Ask which fields must be collected for every participant:

- Full name
- Phone number
- Email
- LINE account / LINE user link
- Age or birth year
- Gender
- Province
- District
- Occupation
- Caregiver relationship

Questions:

1. Which participant fields are required?
2. Which participant fields are optional?
3. Does FamilyLink need emergency contact information?
4. If yes, what emergency contact fields are needed?
   - Name
   - Phone number
   - Relationship
5. Should participants be able to update their own profile later?
6. Or should only staff edit participant data?

## Sensitive Data

Ask directly whether they need to store sensitive information, because this increases PDPA risk.

Possible sensitive data:

- Diagnosis
- Disability type
- Medication
- Health condition
- Family condition
- Patient or cared-person information
- Financial hardship information

Questions:

1. Does FamilyLink currently collect any health-related data?
2. Does FamilyLink need this data in Phase 1?
3. Who is allowed to view sensitive data?
4. How long should sensitive data be kept?
5. Can Phase 1 avoid storing sensitive data at first?

Recommendation:

- Avoid citizen ID and detailed medical data unless absolutely required.
- Use phone number first for duplicate detection.
- Use LINE user ID as secondary identity if available.

## Duplicate Participant Handling

Current problem: same participant may appear in multiple Google Sheets or organizer files.

Questions:

1. How does staff identify duplicate participants today?
2. Should duplicate detection use phone number?
3. Should duplicate detection use LINE account?
4. Do they ever need to merge duplicate records manually?
5. Should participant data be shared across partner NGOs in future?

Recommendation:

- Deduplicate inside same organization by phone number first.
- Link LINE user ID when available.
- Do not merge participants across partner NGOs unless future consent flow exists.

## Course Data

Ask what fields define a course.

Possible course fields:

- Course name
- Course description
- Course category
- Organizer
- Location
- Online meeting link
- Capacity
- Start date
- End date
- Trainer or speaker
- Target audience
- Certificate eligibility

Questions:

1. What information does staff need to create a course?
2. Do courses repeat as batches?
3. Should same course template be reused for multiple batches?
4. Does each course belong to one organizer or multiple organizers?
5. Does course need public description for participants?

## Course Runs And Sessions

Known requirement: some courses have 1 training day, some have 3 training days.

Recommended structure:

- Course = reusable template.
- Course run = one opened batch.
- Course session = actual training day or session inside course run.

Questions:

1. Does participant register for whole course run?
2. Or can participant choose specific sessions?
3. What data is needed per session?
   - Date
   - Start time
   - End time
   - Location
   - Online meeting link
   - Required or optional
4. Can session location change between days?
5. Can course run be cancelled or postponed?

## Registration Form

Current direction: base form plus optional custom fields.

Base fields should stay standardized so reporting, deduplication, and alumni database work reliably.

Questions:

1. Which fields should always be in every registration form?
2. Which fields may change depending on course?
3. Should staff create custom fields themselves?
4. What custom field types are needed?
   - Short text
   - Long text
   - Dropdown
   - Radio choice
   - Checkbox group
   - Date
   - File upload
5. Should custom fields support required/optional setting?
6. Should staff be able to reorder fields?
7. Is conditional logic needed, or can it wait until later?

Recommendation for MVP:

- Support required/optional fields.
- Support text, dropdown, radio, and checkbox first.
- Delay conditional logic and file upload unless clearly needed.

## Registration Workflow

Questions:

1. Can anyone with link register?
2. Does staff need to approve registration before confirming seat?
3. Should system support waitlist?
4. Should system block registration when course reaches capacity?
5. Should staff be able to manually add walk-in participants?
6. Should participants receive confirmation message after registration?
7. Should participants receive reminder before course date?

Possible statuses:

- Draft
- Submitted
- Approved
- Waitlisted
- Cancelled
- Attended
- Completed

## LINE Official Account Flow

Current direction:

- Participant adds LINE Official Account.
- Participant selects Register.
- LINE sends registration link.
- Staff can also send same link manually.

Questions:

1. Should LINE menu show one register button or list active courses?
2. Should registration link be course-specific or generic course list?
3. Should participant need to add LINE Official Account before registration?
4. Can people register without LINE?
5. Should reminders be sent through LINE only?
6. If participant registers without LINE, should reminder use SMS or email?
7. Does FamilyLink already have LINE Official Account?
8. Who manages LINE Official Account now?

Recommendation:

- Do not require LINE for registration.
- Use shareable web registration links.
- Use LINE as main delivery/reminder channel when available.

## Attendance

Questions:

1. How does staff track attendance today?
2. Does attendance need to be tracked per session/day?
3. Who checks in participants?
   - Staff scans participant QR code
   - Participant scans venue QR code
   - Staff manually marks attendance
4. Is QR check-in required for MVP?
5. Should manual attendance edit be allowed?
6. Should attendance export be available?

Recommendation:

- Store attendance per participant per session.
- Support manual attendance first.
- Add QR check-in after registration flow works.

## Certificate

Questions:

1. Does FamilyLink issue certificates now?
2. Are certificates needed in Phase 1 MVP?
3. What attendance rule allows certificate?
   - Attend all sessions
   - Attend at least X sessions
   - Staff manually approves
4. What information appears on certificate?
   - Participant name
   - Course name
   - Course date
   - Certificate number
   - Signature
   - Organization logo
5. Should participant download certificate from link?
6. Should staff export certificates in bulk?

## PDPA

Questions:

1. What PDPA consent text does FamilyLink use now?
2. Does FamilyLink have legal-approved wording?
3. Should consent be separated by purpose?
   - Course registration
   - Future news/contact
   - Photo/video usage
   - Data sharing with partner/supporter
4. How long should participant data be kept?
5. Can participant request data deletion?
6. Can participant request data export?
7. Who handles deletion/export requests?
8. Should staff access be logged?

Recommendation:

- Store consent version, accepted timestamp, accepted IP/user agent if appropriate, and purpose.
- Keep consent history even if wording changes later.

## Admin And Staff Roles

Questions:

1. Who can create courses?
2. Who can edit registration forms?
3. Who can see participant personal data?
4. Who can export Excel?
5. Who can delete participant data?
6. Does FamilyLink need multiple staff roles?

Possible roles:

- Platform owner
- Organization admin
- Staff
- Viewer

## Reports And Export

Questions:

1. What reports does FamilyLink send to funders or board?
2. What Excel columns do they use today?
3. Do they need monthly report?
4. Do they need yearly report?
5. Do they need participant count by province?
6. Do they need attendance rate?
7. Do they need no-show rate?
8. Do they need course completion count?
9. Do they need certificate count?
10. Should export match existing Google Sheet format?

Recommendation:

- Build Excel export early.
- Match current staff workflow where possible.

## Existing Data Import

Questions:

1. Do they want to import old Google Sheets into new system?
2. How many files exist now?
3. Are columns consistent across files?
4. Are there duplicates across files?
5. Is old data clean enough to import?
6. Should old data be imported before launch, or later?

Recommendation:

- Start Phase 1 with new course registration first.
- Import historical data after field structure is confirmed.

## Business Parameters

Questions:

1. Are courses free, paid, or sponsor-covered? Any fee, deposit, or partial cost to participant?
2. How many courses per month currently? How many participants per course? Total participants per year?
3. Is there a fixed deadline or trigger event Phase 1 must launch before (e.g. next batch, board demo, funder report)?
4. What test case/real course will FamilyLink use to evaluate Phase 1? What outcome from that test case counts as success?
5. If course run is cancelled or postponed, should already-registered participants be notified automatically? Auto-moved to next batch, or handled manually by staff?

## Database Entities To Plan For

Likely Phase 1 tables:

- `organizations`
- `organization_members`
- `participants`
- `participant_profiles`
- `line_accounts`
- `courses`
- `course_runs`
- `course_sessions`
- `registrations`
- `registration_answers`
- `attendance`
- `pdpa_consents`
- `message_logs`
- `audit_logs`

Important rule:

- Most rows should include `organization_id`.
- Partner NGO data must be isolated from other partner NGOs.
- FamilyLink data should not be reused or shared without consent.

## Proposed MVP Scope

Build first:

1. Organization and staff login.
2. Course and course run management.
3. Session date management.
4. Default registration form.
5. Shareable registration link.
6. Participant profile plus registration snapshot.
7. Registration dashboard.
8. Excel export.
9. Basic custom fields.
10. PDPA consent capture.

Build next:

1. LINE Official Account integration.
2. Registration reminders.
3. Manual attendance.
4. QR check-in.
5. Certificate generation.
6. Historical Google Sheet import.

