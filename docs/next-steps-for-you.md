# What You Need To Do Next

**Written:** 18 October 2026. **Deadline:** every POC feature tested with staff and ready for real use by **31 December 2026**; the December staff dry run is the acceptance. The first real course is early 2027.

**Where things stand:** all POC software is built and passes its tests on synthetic data (225 API tests, 56 browser tests). It runs only on your machine with a simulated LINE login. Nothing below needs new code unless a step says so.

Work through the sections in order. Tick the boxes as you go.

---

## 1. Try it yourself (about 1–2 hours, this week)

**Goal:** find what feels wrong before FamilyLink staff do.

1. Start the dev services: `docker compose -f compose.test.yml up -d --wait` and `docker compose -f compose.pdf.test.yml up -d --build`.
2. `npm run db:migrate:test`, then `npm run db:demo:sample`, then `npm run demo`.
3. Staff: open `http://127.0.0.1:4200/staff/login` and sign in with the test admin from your `.env`.
4. Members: open `http://127.0.0.1:4200/member/dev` and pick a simulated LINE account.
5. Walk this order (the same flow as `tests/e2e/poc-acceptance.spec.ts`):
   - [ ] Add a member from a paper form (staff), then print the signup PDF and mark the signature received.
   - [ ] Sign up as a member on a simulated LINE account, with the same name and birth date as an existing member. Staff sees it in รอตรวจสอบ and links it.
   - [ ] Create a course and a run with approval and a one-seat limit. Register two members: one gets the seat, one waits.
   - [ ] Approve, cancel (as staff), and watch the waiting member move up.
   - [ ] On the day of the class: walk-in registration, then attendance on a phone-sized window.
   - [ ] Add a paid membership, open ภาพรวม, download the Excel exports.
   - [ ] Read the simulated messages on ข้อความแจ้งเตือน.
6. Write down anything confusing in plain words. Send me the list; I will fix it.

**Check on a real phone:** open the dev site from your phone on the same Wi-Fi (use your computer's local address instead of `127.0.0.1`). I only tested phone layouts in a resized window.

---

## 2. Ask FamilyLink for these (send as one message)

You cannot go further without these. Send them early because answers take time.

- [ ] **LINE:** admin access to their LINE Official Account and the LINE Developers console, so you can create the Messaging API channel, LINE Login channel and LIFF app. Also the monthly push-message quota on their plan.
- [ ] **Email:** a sender address on a domain they control that you can verify (for example `noreply@their-domain`).
- [ ] **Real names and money:** service types, document types, membership tiers with fees and renewal periods.
- [ ] **The real paper form** (Part 1/2 layout and labels) so the printed form matches.
- [ ] **Which member details are required** for a record to count as "complete" (see section 5, question 1).
- [ ] **Privacy:** who is the privacy contact (DPO), how long to keep each kind of data, and a lawyer-reviewed privacy notice, sensitive-data consent text and DPA. The DPA term needs to extend past the first course.
- [ ] **Who will take part in the December dry run:** names and dates for the two admins and a few staff, ideally including the least technical one.
- [ ] **A domain name** they want to use (for example `app.their-domain`) and who controls its DNS.

---

## 3. Prepare the server (you, once you have a domain)

Follow `docs/operations/runbook.md` sections 1–2. In short:

- [ ] Server has Docker and the Compose plugin; admin access by Tailscale only (SSH is not opened to the internet).
- [ ] Copy `.env.production.example` to `.env.production` and fill it in. Make three different keys with `openssl rand -base64 32`.
- [ ] **Key custody first:** put the three keys in your password manager **and** print one sealed copy for a FamilyLink admin. A backup alone cannot be read without the keys.
- [ ] Point the domain at the server; forward ports 80 and 443 on the router.
- [ ] Second disk for backups (`BACKUP_DIR`); create the encrypted Google Drive remote with `rclone config` (`RCLONE_REMOTE`).
- [ ] `docker compose up -d --build`, then check `docker compose ps` shows `api`, `db`, `pdf` healthy.
- [ ] Create the first real admin (runbook step 7) and remove the bootstrap password afterwards. Remove the test admin password from your local `.env` too.

The app refuses to start in production without every LINE and email value, with HTTPS missing, or with the development login on. That is intended.

---

## 4. Connect LINE and email (once FamilyLink gives access)

Follow `docs/operations/runbook.md` section 3.

- [ ] Messaging API channel: access token, channel secret, webhook `https://<domain>/api/line/webhook`, webhook on.
- [ ] LINE Login channel and a LIFF app pointing at `https://<domain>/member/profile`.
- [ ] Two rich menus (guest and member) and their ids.
- [ ] Set the monthly quota value.
- [ ] Verify the email sender and set the API key.
- [ ] **Real end-to-end test with your own LINE account:** sign up, get linked, register for a course, receive a LINE message, then cancel and receive another. Also force a LINE failure and confirm the email fallback. This is the first time the real LINE and email paths run, so expect a few fixes. Tell me what breaks.

---

## 5. Decide these (I need your answer to finish)

1. **"ข้อมูลไม่ครบ" never changes.** Every member shows incomplete because the spec does not say what "complete" means. Tell me which fields make a record complete (for example citizen ID, address, disability type, one contact).
2. **Walk-ins are only possible on a session's own day.** Say if staff also need to admit people on days with no scheduled session.
3. **Splitting the 19-field member signup into 3 steps** (who, details, consent). I did not do it because it changes the member flow. Say yes or no.
4. **Course service tags** are stored but do nothing yet (they are meant for inviting interested members later). Fine to leave for after the POC?
5. **UI direction:** once you have looked at the new ticket-style look, tell me which screens still feel generic. Options I offered: a left-hand menu rail like the old prototype, or ticket shapes on the course and member lists.

The full list of decisions I already made, and why, is in `docs/decisions/2026-10-18-overnight-gaps-and-decisions.md`. Read it and tell me anything you want reversed.

---

## 6. Before the staff dry run (December)

- [ ] Real labels, tiers, fees and consent text entered in the admin screens (`ตั้งค่าระบบ`).
- [ ] Restore rehearsal done once and written down: restore a backup into an isolated copy and open it (runbook section 6). This must pass **before** real data goes in.
- [ ] Monitoring set up: UptimeRobot, healthchecks.io for backups. Sentry is **not** connected yet; ask me when you have a DSN.
- [ ] Add the real staff accounts under บัญชีเจ้าหน้าที่.
- [ ] Run the dry run with the checklist in `docs/operations/acceptance-2026-12.md`. Watch the least technical staff member use the phone attendance and walk-in screens without help.
- [ ] Record the result and send me what failed.

---

## 7. What I can do next if you ask

- Fix anything you find in section 1.
- Connect Sentry once you have a DSN.
- Split the signup into steps, add the completeness rule, or change walk-in rules (section 5).
- Rework any screen that still looks generic.
- Help debug the first real LINE and email test (section 4).

---

## Not ready for real members yet

Do **not** enter real members' ID numbers, documents or health information until sections 3, 4 and the restore rehearsal in section 6 are done and the privacy wording is lawyer-reviewed.
