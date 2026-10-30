# FamilyLink Operations Runbook

For the person running the home server. Read once before the first install, then use as a checklist.
Everything that needs a FamilyLink decision or paperwork is listed in **Launch inputs still needed** at the end;
do not put real member data into the system until those are done.

## 1. What runs where

| Service | Purpose | Reachable from |
| --- | --- | --- |
| `proxy` (Caddy) | HTTPS, certificates, security headers | the internet (ports 80/443) — the **only** public service |
| `web` | the Angular screens | proxy only |
| `api` | all business logic, database, files, PDF, LINE and email | proxy; talks out to LINE/email |
| `db` | PostgreSQL 16 | api, migrate, backup only; no route to the internet |
| `pdf` | Gotenberg, makes the sign-up form PDFs | api only |
| `backup` | daily dump + file copy + encrypted off-site copy | none |
| `migrate` | one-shot: applies database changes at deploy, then exits | none |

The API connects to the database as `familylink_app`, which can read and write data but cannot change the schema.
Schema changes use the owner role and only through the `migrate` step.

## 2. First install

1. Server needs Docker and the Compose plugin. Admin access is by Tailscale SSH only; do not open SSH to the internet.
2. Copy `.env.production.example` to `.env.production` and fill it in. Generate the three keys with
   `openssl rand -base64 32` (three different values).
3. **Key custody (do this before anything else).** Put all three keys in the password manager *and* print one sealed
   copy for a FamilyLink admin. The keys are never stored in the database, Git, images or backups. Without them the
   encrypted data and uploaded files cannot be read — a backup alone is not enough.
4. Point `DOMAIN` at the server (A/AAAA record; router forwards 80 and 443 to the server).
5. Second disk: set `BACKUP_DIR` to a folder on it. Create the encrypted off-site remote with `rclone config`
   (type `crypt` over Google Drive), put `rclone.conf` in `RCLONE_CONFIG_DIR`, set `RCLONE_REMOTE`.
6. `docker compose up -d --build`. Wait until `docker compose ps` shows `api`, `db`, `pdf` healthy.
7. Create the first admin: `docker compose run --rm migrate sh -c "npm run db:seed"` with `BOOTSTRAP_ADMIN_EMAIL`,
   `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` set for that one command, then remove the password from the
   environment. Sign in at `https://<DOMAIN>/staff/login` and add other staff under *บัญชีเจ้าหน้าที่*.
8. In the admin screens set the real service types, document types, membership tiers and fees, consent wording and
   message wording (*ตั้งค่าระบบ*). The names shown in a fresh install are placeholders.

## 3. LINE and email

**Running without LINE (staff-only mode).** Set `STAFF_ONLY_MODE=true` in `.env.production` and leave every `LINE_*`
value empty. The API then starts without LINE (email is optional). Staff use the whole website; members have no
login, LINE is never contacted, and the LINE webhook is off. Every notice that would have gone to a member lands on
the call list in *ข้อความแจ้งเตือน* for staff to phone (or email, if an email sender is configured). The page says
"โหมดเจ้าหน้าที่อย่างเดียว". The app refuses to mix this flag with LINE settings. To move to full mode later, set the
flag to `false`, fill in the LINE and email values below, and restart; no data changes.

LINE (needs admin access to FamilyLink's LINE OA and the LINE Developers console):

1. Create (or reuse) one provider containing a **Messaging API** channel and a **LINE Login** channel.
2. Messaging API channel: issue a long-lived channel access token → `LINE_CHANNEL_ACCESS_TOKEN`; channel secret →
   `LINE_CHANNEL_SECRET`. Webhook URL: `https://<DOMAIN>/api/line/webhook`; turn *Use webhook* on.
3. LINE Login channel: note the Channel ID → `LINE_LOGIN_CHANNEL_ID`. Add a LIFF app with endpoint URL
   `https://<DOMAIN>/member/profile` (scope `openid profile`) → `LINE_LIFF_ID`.
4. Rich menus: create two in LINE OA Manager / API. The **guest** menu (button *สมัครสมาชิก* → LIFF `/member/signup`)
   is set as the default for all users. The **member** menu (*ลงทะเบียนคอร์ส* → `/member/courses`, *โปรไฟล์* →
   `/member/profile`, *เพิ่มสมาชิก* → `/member/signup?for=another`) gets its id in `LINE_RICH_MENU_MEMBER`. The API
   switches each person between them after signup, linking or removal; failures are retried automatically.
5. Read the monthly push quota from LINE OA Manager and set `LINE_MONTHLY_QUOTA`. Admins see usage on
   *ข้อความแจ้งเตือน*; when the quota is used up, notices go by email.

Email: create a Resend (or compatible) account, verify the sender domain, set `EMAIL_API_KEY` and `EMAIL_FROM`.

Unless `STAFF_ONLY_MODE=true`, the API refuses to start in production without every LINE and email value, with the development identity switch
on, or with a non-HTTPS origin. This is intended: it fails closed.

## 4. Everyday checks

- **Health:** `https://<DOMAIN>/api/health` (checks the database). UptimeRobot every 5 minutes, alerting LINE/email.
- **Scheduled jobs** (Asia/Bangkok, run inside the API; each daily job is recorded so a restart never repeats it):
  reminders for tomorrow's confirmed sessions at **09:00**; cleanup after **03:00**; message sending and LINE menu
  sync every 15 seconds. Backups run at **02:00** in the `backup` container.
- **Logs:** `docker compose logs -f api`. Logs never contain member data; if you ever see some, treat it as a bug.
- **Disk:** `smartd` for the disks, and an alert when free space is low. The uploads volume and `BACKUP_DIR` grow with use.
- **Staff screen *ข้อความแจ้งเตือน*:** anything under "ต้องติดตามเอง" needs a phone call; mark it done afterwards.
- **Errors:** wire Sentry (free tier) through `scrubEvent` in `apps/api/src/common/telemetry.ts` as the `beforeSend`
  hook so no member data is transmitted. Not wired until a DSN exists.

## 5. Deploying an update

1. On the build machine: `npm run release:check` (lint, types, all API tests, the whole-POC browser test, all
   browser tests, build, compose validation, secrets scan). Do not deploy a build that fails it.
2. On the server: pull the verified code, `docker compose up -d --build`. The `migrate` step runs first; the API
   starts only after it succeeds.
3. Confirm `/api/health`, sign in, open a member profile and the dashboard.

## 6. Backups and restore

Daily at 02:00 the `backup` container: pauses writes (maintenance flag; reads continue) → dumps the database →
copies the uploaded (already encrypted) files → resumes writes → verifies the dump → writes checksums → keeps the
newest 14 dumps on the second disk → syncs everything, encrypted with `rclone crypt`, to Google Drive → pings
healthchecks.io **only if every step succeeded**. Writes always resume, even if a step fails. A missed ping alerts you.

**Restore rehearsal (before launch, then monthly)** — never into the live database:

1. `BACKUP_DIR=<second-disk path> docker compose -f compose.restore.yml --profile restore run --rm restore /backups/db/<newest>.dump /staging/uploads`
   restores into an isolated staging database and folder, checks the file hashes and prints row counts.
2. Fetch the three keys **separately** from the password manager (or the sealed copy — this proves the sealed copy works).
3. Point `DATABASE_URL` at the staging database (port 55433), set the keys, `DOCUMENT_STORE_PATH=./.private/restore-staging/uploads`,
   and run `npm run verify:restore`. It must decrypt a sample member, case-note revision, booking snapshot and uploaded file,
   and confirm every stored file is present.
4. Record the date, dump name and result in the acceptance log. Delete `./.private/restore-staging` afterwards.

## 7. Incidents

- **API down / restarting loop:** `docker compose logs --tail 100 api`. A start failure message means a missing or
  invalid setting (see §3). `docker compose restart api` is safe.
- **Backup failed (alert or no ping):** run `docker compose exec backup /usr/local/bin/backup.sh` and read the stage
  named in the failure. Make sure the maintenance flag is gone (`docker compose exec api ls /data/state`); if `maintenance`
  exists, delete it: writes are blocked while it exists.
- **LINE or email not delivering:** *ข้อความแจ้งเตือน* shows the reason per message. `auth` = wrong token; `quota` = monthly
  LINE limit. Messages are retried 5 times (1 min, 5 min, 15 min, 1 h, 6 h), then email, then flagged for staff.
- **A staff member leaves or a device is lost:** admin → *บัญชีเจ้าหน้าที่* → ปิดการใช้งาน. Open sessions end immediately.
  Change the password of any shared account.
- **Lost encryption keys:** data cannot be recovered. Use the sealed copy (§2.3) and treat the loss as serious.
- **Suspected breach:** tell FamilyLink within **24 hours**. FamilyLink reports to the PDPC within **72 hours** (DPA §6).
  Contacts and dates come from the approved DPA — fill them in below.

| Role | Name | Phone / email |
| --- | --- | --- |
| FamilyLink admin (key custodian) | _to fill_ | _to fill_ |
| FamilyLink privacy contact / DPO | _to fill_ | _to fill_ |
| Server operator | _to fill_ | _to fill_ |

## 8. Data and retention

- Members are soft-deleted by admins. Nothing is purged until an admin sets a retention period in
  *ข้อความและการตั้งค่าองค์กร*; the default is to keep everything.
- Rejected and abandoned sign-up requests and their files are removed after 30 days. Unsubmitted upload drafts after 24 hours.
- Stored documents can only be read, verified or deleted by admins; every view, print and export is logged by field names only.

## 9. Launch inputs still needed (nothing here is invented)

- [ ] FamilyLink LINE OA and Developers console access; real quota; rich menus created
- [ ] Verified email sender address
- [ ] Real service names, document types, membership tiers/fees/renewal periods
- [ ] Lawyer-reviewed privacy notice, consent wording, DPA (with term extended past the first course) and legal basis (PDPA s.26)
- [ ] Retention periods; privacy contact/DPO
- [ ] Real printed form layout/labels (the PDF here follows the approved structure with sample wording)
- [ ] Domain DNS, router forwarding, Tailscale, UptimeRobot, healthchecks.io, Sentry DSN
- [ ] Prelaunch restore rehearsal passed and recorded; December staff dry-run (`docs/operations/acceptance-2026-12.md`)
