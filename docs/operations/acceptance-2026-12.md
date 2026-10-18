# POC Staff Acceptance — December 2026

Acceptance is a staff dry-run on the deployed system with **synthetic** data, finished and signed by **31 December 2026**.
FamilyLink's admin records final acceptance only when every area passes and workflow blockers are resolved.
No real member data is used until the launch inputs in `runbook.md` §9 are signed off.

**Build under test:** _git commit / image tag_ · **Server:** _address_ · **Dry-run dates:** 19–23 Dec 2026

Each row: date, tester and role, synthetic scenario, expected vs actual, evidence (screenshot/export/log line), issue and retest.

| # | Area | What staff do (synthetic data) | Expected | Date | Tester / role | Actual | Evidence | Issue / retest | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Staff access | Admin adds a staff user, disables them; staff has an open session | Disabled user is signed out at once; staff see only permitted data; staff cannot reach settings, accounts, document contents | | | | | | ☐ |
| 2 | Intake | Enter a paper member; a caregiver and a patient sharing a phone; reuse a citizen ID; open a matching signup | Shared phone creates separate members; citizen-ID reuse is blocked; matching signup goes to review | | | | | | ☐ |
| 3 | Member access | Real LIFF signup, add family member, switch members, view profile; open a browser invite link | Signup works in LINE; browser invite stops at signup; pending applicant sees only “รอเจ้าหน้าที่ยืนยัน”; linked siblings keep working | | | | | | ☐ |
| 4 | Consent and documents | Sign up with and without attachments; staff upload; admin open, verify, delete | No consent box without a file; consent needed for every file type; staff see receipts only; admin-only contents | | | | | | ☐ |
| 5 | Profiles and notes | Member requests a correction; staff approve; staff review own family record; write, edit, revise notes | Approved change appears; own/family review is refused; 24 h edit limit; no note text for members or in audit logs | | | | | | ☐ |
| 6 | Courses and questions | Create a template with all six question types; make a run; edit questions after a booking | Edit limits enforced; sensitive answers marked; run independent of later template edits | | | | | | ☐ |
| 7 | Bookings | Both registration modes, mixed outcomes, approval, waitlist, cutoff, last-seat race, rejoin | Seats never overbooked; queue order kept; history versions kept | | | | | | ☐ |
| 8 | Changes and walk-ins | Cancel, reschedule, lower capacity, cancel a session/run, walk-in to a full class | Policies enforced; walk-in needs reasons; attendance only for today | | | | | | ☐ |
| 9 | Attendance and forms | Mark attendance on a phone; dashboard; print forms for unsigned members; record a signed form | Unmarked ≠ absent; totals correct; printed form is readable Thai with blank staff section; printing does not mark signed | | | | | | ☐ |
| 10 | Membership and reports | Record payment, expiry, renewal, lifetime, admin correction/void; staff and admin exports | Expired keeps tier; filters and monthly totals right; staff export has no sensitive columns | | | | | | ☐ |
| 11 | Messages | Real LINE message, email fallback, grouped reminder at 09:00, forced failure, cancel/relink before send | Delivery as specified; failures visible; no duplicate sends; staff-follow-up list works | | | | | | ☐ |
| 12 | Operations | Production config, alerts, key retrieval, daily backup, restore rehearsal, jobs at Bangkok times | Restore opens sample data with separately recovered keys; only the proxy is public | | | | | | ☐ |
| 13 | Real-use inputs | Check each item in `runbook.md` §9 | All recorded and signed off | | | | | | ☐ |

**Automated evidence available before the dry run:** `npm run release:check` runs the API suites (isolation, concurrency,
deadlines, delivery, retention, production config), the whole-POC browser test (`tests/e2e/poc-acceptance.spec.ts`)
and every focused browser suite. It does **not** replace real LINE/email delivery or the restore rehearsal, which need
FamilyLink's accounts and the production server.

**Final acceptance:** ☐ every row passes or its blocker is resolved and retested · Admin: ______________ · Date: __________
