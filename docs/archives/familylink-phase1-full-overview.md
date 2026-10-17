# FamilyLink Phase 1 Full Overview

This document summarizes the current understanding of Phase 1 for the Thai FamilyLink Association project. It is meant to let a future session understand what the project is, why it exists, what Phase 1 should build, and what still needs confirmation from FamilyLink.

## One-Line Summary

Build a mobile-friendly web registration and course management system for Thai FamilyLink Association, using LINE Official Account as a communication channel, with a SaaS-ready multi-tenant architecture for future partner NGOs.

## Background

Thai FamilyLink Association currently manages training/course registration with a mix of Google Forms, Google Sheets/Excel, LINE, and paper. Every time staff open a new course, they may need to create a new form and a new spreadsheet. Different organizers may keep separate spreadsheets, so the same participant can appear in multiple places.

Phase 1 should replace this scattered workflow with one central system that stores participants, courses, registrations, attendance, and PDPA consent in a structured database.

## Project Owner And Future Direction

Current assumption:

- Gide is the system owner for now.
- Thai FamilyLink Association is the first tenant/customer.
- Future SaaS spin-off may support separate partner NGOs.
- The system should be designed as SaaS-ready from the start, but billing and public tenant signup are not part of Phase 1.

Important product rule:

- FamilyLink should be able to use the system.
- FamilyLink controls its own organization data.
- Gide can reuse and improve the software for future NGOs.
- FamilyLink personal data must not be reused or shared with other organizations without proper consent.

## Phase 1 Goal

Phase 1 focuses on course registration and course operations.

Main goal:

- Help staff open courses, collect registrations, view participants, export data, and reduce manual Google Form/Excel work.

Secondary goals:

- Keep participant records in one place per organization.
- Reduce duplicate participant data.
- Support one-day and multi-day courses.
- Capture PDPA consent.
- Prepare architecture for future partner NGOs.

## Target Users

### Participants

Participants register for courses using a mobile-friendly web form. Most will receive the registration link through LINE Official Account or from staff manually.

Participant should not need to install a native mobile app.

### FamilyLink Staff

Staff use a web admin dashboard to create courses, manage registrations, view participant lists, export data, and communicate through LINE where appropriate.

### Organization Admin

Organization admin manages staff access, course settings, and organization-level configuration.

### Platform Owner

Platform owner manages organizations/tenants, global settings, infrastructure, security, backups, and future SaaS expansion.

## High-Level User Flow

### Registration Link Flow

1. Staff creates a course run in the admin dashboard.
2. System generates a registration link.
3. Link can be shared through:
   - LINE Official Account
   - Staff manual message
   - QR code
   - Facebook/email
   - Walk-in staff tablet or phone
4. Participant opens the link on mobile browser.
5. Participant fills registration form.
6. Participant accepts PDPA consent.
7. System stores participant profile and registration snapshot.
8. Staff sees registration in admin dashboard.

### LINE Official Account Flow

Current assumed flow:

1. Participant adds LINE Official Account.
2. Participant taps Register option.
3. LINE sends registration link.
4. Participant opens mobile web registration form.
5. If possible, system links registration to LINE user ID.

Important decision:

- LINE should be a communication channel, not a mandatory identity system.
- People should still be able to register without LINE.

### Staff Walk-In Flow

1. Staff opens course registration link on phone/tablet.
2. Staff helps participant fill form.
3. System marks registration source as walk-in or staff link.
4. Registration appears in admin dashboard.

## Phase 1 Scope

### In Scope

- Organization setup for FamilyLink.
- Staff login.
- Course management.
- Course run management.
- Session/day management for one-day and multi-day courses.
- Mobile-friendly registration form.
- Shareable registration links.
- Base participant fields.
- Staff-configurable custom fields.
- Participant profile.
- Registration snapshot.
- Registration dashboard.
- Excel export.
- PDPA consent capture.
- Basic multi-tenant database structure.
- LINE Official Account link sharing/integration as communication channel.

### Likely Later In Phase 1

- Manual attendance.
- QR check-in.
- Reminder messages through LINE.
- Certificate generation.
- Historical Google Sheet import.

### Out Of Scope For Phase 1

- Native mobile app.
- Donor CRM.
- Fala Natural Soap operations.
- Volunteer/Peer Mentor matching.
- SaaS billing.
- Public self-service signup for partner NGOs.
- Advanced marketing automation.
- Complex conditional form logic unless FamilyLink confirms it is needed.

## Recommended Technical Direction

### Application Type

Use a web application:

- Participant side: mobile-friendly responsive web form.
- Staff side: web admin dashboard.
- No native iOS/Android app for Phase 1.

Reason:

- Registration through shared link is easier than app install.
- Staff can send links through LINE or manually.
- Web app works for walk-ins.
- Faster build and easier maintenance.

### Database

Recommended database:

- PostgreSQL.

Recommended hosting/service direction:

- Supabase PostgreSQL is a good first option.
- Use Singapore region if Thailand-specific managed region is not available.

Reason:

- Project data is relational: organizations, staff, participants, courses, sessions, registrations, attendance, consents.
- PostgreSQL supports strong querying and reporting.
- Supabase can provide auth, storage, database, row-level security, and backups.

## Multi-Tenant Model

Future assumption:

- Each partner NGO is a separate organization/tenant.

Design rule:

- Most rows include `organization_id`.
- Staff can only see data for their own organization.
- Platform owner can manage all organizations.
- Participant data is not shared across organizations by default.

First organization:

- Thai FamilyLink Association.

Future organization:

- Separate partner NGO.

## Data Model Overview

### Organizations

Stores each tenant/customer.

Examples:

- Thai FamilyLink Association.
- Future partner NGO.

### Organization Members

Stores staff/admin access for each organization.

Possible roles:

- Platform owner.
- Organization admin.
- Staff.
- Viewer.

### Participants

Stores current participant profile per organization.

Purpose:

- Reduce duplicate records.
- Reuse participant profile across future courses.
- Support alumni database.

Possible fields:

- Full name.
- Phone number.
- Email.
- LINE user link.
- Province/district.
- Age or birth year.
- Gender.
- Caregiver relationship.

Important rule:

- Deduplicate inside same organization by phone number first.
- Link LINE user ID when available.
- Do not merge participants across partner NGOs unless future consent flow exists.

### Registrations

Stores course-specific registration record.

Important design:

- Keep registration snapshot separate from participant profile.

Reason:

- Participant profile may change later.
- Past course records should remain accurate.
- Certificate/report history should stay stable.

Registration should store:

- Participant ID.
- Course run ID.
- Registration source.
- Submitted name/phone/email snapshot.
- Registration status.
- PDPA consent reference.
- Custom answers.
- Submitted timestamp.

### Courses

Stores reusable course template.

Example:

- Family caregiver training.

Possible fields:

- Course name.
- Description.
- Category.
- Target audience.
- Default certificate rule.

### Course Runs

Stores one opened batch of a course.

Example:

- Family caregiver training, Batch 12, Bangkok, July 2026.

Possible fields:

- Course ID.
- Organization ID.
- Batch name.
- Location.
- Capacity.
- Registration open/close dates.
- Status.
- Certificate rule.

### Course Sessions

Stores actual training days/sessions inside a course run.

This is required because some courses have one training day and some have three training days.

Possible fields:

- Course run ID.
- Session name/day number.
- Date.
- Start time.
- End time.
- Location or online link.
- Required/optional.

### Attendance

Stores attendance per participant per session.

Reason:

- One course may have multiple sessions.
- Certificate eligibility may depend on attendance count.

Possible fields:

- Registration ID.
- Course session ID.
- Attendance status.
- Check-in method.
- Checked-in by staff.
- Timestamp.

### Forms And Custom Fields

Recommended model:

- Standard base fields.
- Optional custom fields per course run.

Base fields stay consistent for reporting and deduplication.

Custom fields allow staff to adapt each course form.

Possible custom field types:

- Short text.
- Long text.
- Dropdown.
- Radio.
- Checkbox group.
- Date.

File upload can wait unless FamilyLink confirms it is needed.

### PDPA Consents

Stores consent records and versions.

Possible consent purposes:

- Course registration.
- Future contact/news.
- Photo/video use.
- Data sharing with partner/supporter.

Store:

- Consent version.
- Consent purpose.
- Accepted timestamp.
- Participant/registration reference.
- Consent text version reference.

### LINE Accounts

Stores optional LINE identity link.

Possible fields:

- LINE user ID.
- LINE display name.
- Participant ID.
- Organization ID.
- Linked timestamp.

### Message Logs

Stores outbound message history.

Examples:

- Registration link sent.
- Reminder sent.
- Certificate link sent.

## Registration Form Design

Recommended approach:

- Keep core identity fields standard.
- Let staff customize additional questions per course.

Core fields should not be removed if needed for deduplication and reporting.

Likely core fields:

- Full name.
- Phone number.
- PDPA consent.
- Course selection or preselected course run.

Fields to confirm with FamilyLink:

- Email.
- LINE account.
- Age or birth year.
- Gender.
- Province/district.
- Caregiver relationship.
- Emergency contact.
- Sensitive health/family data.

## Admin Dashboard Scope

Staff should be able to:

- Log in.
- View dashboard overview.
- Create course.
- Create course run/batch.
- Set session dates.
- Configure registration form.
- Copy/share registration link.
- View registration list.
- Search participants.
- View participant history inside organization.
- Export Excel.
- Open/close registration.
- Manually add walk-in registration.

Later admin features:

- Attendance check-in.
- QR check-in.
- Certificate generation.
- LINE reminders.
- Historical data import.

## Registration Status Model

Possible statuses:

- Submitted.
- Approved.
- Waitlisted.
- Cancelled.
- Attended.
- Completed.

Need confirmation:

- Does FamilyLink need approval before confirming registration?
- Does FamilyLink need waitlist?
- Does FamilyLink need capacity limit?

## Attendance And Certificate Model

Known:

- Some courses have one day.
- Some courses have three training days.

Recommended:

- Track attendance per session.
- Let certificate rule live on course or course run.

Possible certificate rules:

- Attend all sessions.
- Attend at least X of Y sessions.
- Staff manually approves certificate.

Need confirmation:

- Does FamilyLink issue certificates now?
- Are certificates required in first MVP?
- What data appears on certificates?

## Reports And Exports

Excel export should be built early because staff currently uses spreadsheet workflows.

Possible reports:

- Participant list.
- Registration list per course run.
- Attendance list.
- No-show rate.
- Completion count.
- Certificate count.
- Province breakdown.
- Monthly/yearly training report.

Need confirmation:

- What exact Excel columns does FamilyLink use now?
- Do exports need to match current spreadsheet format?
- What reports do they send to funders/board?

## PDPA And Security

Phase 1 must include PDPA basics from start.

Required principles:

- Collect only necessary data.
- Capture consent before submission.
- Store consent version and timestamp.
- Limit staff access by role.
- Separate organization data by `organization_id`.
- Avoid sharing data across NGOs.
- Export/delete process should exist or be planned.

Sensitive data warning:

- If FamilyLink needs health, diagnosis, disability, family condition, or financial hardship data, PDPA risk increases.
- Sensitive data should be avoided in MVP unless required.
- If sensitive data is required, add stronger access control and clear consent wording.

## MVP Build Order Recommendation

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

Next after core registration works:

1. LINE Official Account integration.
2. Registration reminders.
3. Manual attendance.
4. QR check-in.
5. Certificate generation.
6. Historical Google Sheet import.

## Key Decisions Already Made

- Use web app, not native mobile app.
- Support LINE Official Account, but do not require LINE for registration.
- Staff can send registration link manually.
- Store participant profile and registration snapshot separately.
- Model courses as course -> course run -> course sessions.
- Support one-day and multi-day courses.
- Staff should be able to customize forms.
- Use multi-tenant architecture because future partner NGOs may use the system.
- Treat organizer as separate partner NGO for now.
- Keep FamilyLink as first organization/tenant.

## Open Questions For FamilyLink

### Highest Priority

1. What participant fields must appear in every registration form?
2. Does FamilyLink need to store sensitive health or family data?
3. How are courses structured: one day, multiple days, batches, sessions?
4. Does registration need approval, waitlist, or capacity limits?
5. What attendance rule allows certificate issuance?
6. What reports or Excel exports does staff need?
7. What PDPA consent wording and data retention rules are required?

### Participant Data

1. Which participant fields are required?
2. Which participant fields are optional?
3. Does FamilyLink need emergency contact information?
4. Should participants be able to update their own profile later?
5. Should only staff edit participant data?
6. How does staff identify duplicate participants today?

### Sensitive Data

1. Does FamilyLink currently collect health-related data?
2. Does FamilyLink need health or family condition data in Phase 1?
3. Who can view sensitive data?
4. How long should sensitive data be kept?
5. Can Phase 1 avoid sensitive data at first?

### Course Data

1. What information does staff need to create a course?
2. Do courses repeat as batches?
3. Should same course template be reused for multiple batches?
4. Does each course belong to one organizer or multiple organizers?
5. Does course need public description for participants?

### Sessions

1. Does participant register for the whole course run?
2. Can participant choose specific sessions?
3. Can session location change between days?
4. Can course run be cancelled or postponed?

### Registration Form

1. Which fields should always be in every registration form?
2. Which fields may change depending on course?
3. What custom field types are needed?
4. Should custom fields support required/optional setting?
5. Should staff be able to reorder fields?
6. Is conditional logic needed, or can it wait?

### Registration Workflow

1. Can anyone with link register?
2. Does staff need to approve registration before confirming seat?
3. Should system support waitlist?
4. Should system block registration when course reaches capacity?
5. Should staff be able to manually add walk-in participants?
6. Should participants receive confirmation message after registration?
7. Should participants receive reminder before course date?

### LINE Official Account

1. Should LINE menu show one register button or list active courses?
2. Should registration link be course-specific or generic course list?
3. Should participant need to add LINE Official Account before registration?
4. Can people register without LINE?
5. Should reminders be sent through LINE only?
6. If participant registers without LINE, should reminder use SMS or email?
7. Does FamilyLink already have LINE Official Account?
8. Who manages LINE Official Account now?

### Attendance

1. How does staff track attendance today?
2. Does attendance need to be tracked per session/day?
3. Who checks in participants?
4. Is QR check-in required for MVP?
5. Should manual attendance edit be allowed?
6. Should attendance export be available?

### Certificate

1. Does FamilyLink issue certificates now?
2. Are certificates needed in Phase 1 MVP?
3. What attendance rule allows certificate?
4. What information appears on certificate?
5. Should participant download certificate from link?
6. Should staff export certificates in bulk?

### Reports And Historical Data

1. What reports does FamilyLink send to funders or board?
2. What Excel columns do they use today?
3. Should export match current Google Sheet format?
4. Do they want to import old Google Sheets into the new system?
5. How many files exist now?
6. Are columns consistent across files?
7. Are there duplicates across files?

## Risks

### Scope Creep

Phase 1 can grow too large if it includes registration, LINE automation, QR check-in, certificates, custom forms, reports, and historical import all at once.

Mitigation:

- Build core registration and export first.
- Add LINE automation, QR check-in, certificate, and import after core flow works.

### PDPA Risk

Health/family data may be sensitive.

Mitigation:

- Avoid sensitive data in MVP if possible.
- Confirm consent wording and retention rules.
- Use role-based access and organization isolation.

### Staff Adoption Risk

Staff may be used to Google Forms and Excel.

Mitigation:

- Keep Excel export.
- Make admin dashboard simple.
- Match current workflows where practical.

### LINE Dependency Risk

If LINE integration is delayed or limited, registration should still work.

Mitigation:

- Registration link works outside LINE.
- Staff can send link manually.

### Multi-Tenant Complexity

Future SaaS needs tenant separation, but Phase 1 should not overbuild billing or public signup.

Mitigation:

- Add `organization_id` now.
- Keep billing/public signup out of Phase 1.

## Related File

Detailed question checklist exists here:

- `familylink-phase1-questions.md`

