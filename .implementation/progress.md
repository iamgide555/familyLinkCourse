# Implementation Ledger

**Plan:** `docs/archives/plans/2026-10-17-01-staff-intake.md`.

## Setup

- **Execution:** native; user authorized implementation with TDD and UX priority for less tech-confident staff/members.
- **Isolation ruling:** workspace had no Git repository or production app. Initialized dedicated `feat/staff-intake` branch in place; no main/master branch exists to modify. Existing prototype remains reference material.
- **UX:** preserve Thai-first prototype identity; prioritize plain labels, large controls, predictable task flow, focus/error recovery and mobile legibility. Language confirmation pending; backend work continues independently.
- **Pre-flight M1-T1 → T2/T3/T4:** actor, scoped Prisma transaction, crypto and audit interfaces shared. Establish exact contracts in T1 before consumers.
- **Pre-flight T2 → T3/T4:** both consume authorized member reads. Member DTO excludes notes/documents on participant paths.
- **TDD:** tests precede behavior; every checkbox requires observed verification, not source inspection.
- **Baseline:** no production source, dependency manifest or executable tests existed; no passing baseline claimed.

## UX Implementation Direction

- **User steering:** focus on UX for older, less tech-confident staff and members; TDD remains required.
- **Confirmed context:** captured current spec and audience in `PRODUCT.md`; no obsolete prototype registration/attendance exclusions carried over.
- **Working assumption:** Thai-only labels follow Thai-first prototype/spec while optional language question awaits a reply.
- **Visual boundary:** inherit existing mint/teal, Sarabun/Kanit world; first change is a focused staff login module, not a visual rebrand.

---

## M1-T1 — Staff Shell

- [x] **TDD:** observed failing auth, crypto, configuration, bootstrap, startup, audit and browser behavior before corresponding fixes.
- [x] **Verified:** `npm test` passes **34/34**; browser login suite passes **10/10**; lint, typecheck, formatting and production build pass.
- [x] **UX:** Thai labels, `18px` body, large controls, visible validation/focus, recovery, `320px` mobile and doubled-root-font checks; scoped Impeccable login verdict **ship**.
- [x] **Commit:** `cb5a699` — `feat: add protected staff application shell`.
- **Limits:** first task only; no member intake, courses, deployment or real-data acceptance yet. Staff account management currently available through authenticated admin API; staff home shows current identity and logout.
- **Dependencies:** runtime audit has zero advisories; unresolved moderate `sprintf-js` advisory remains in Jest-related development dependencies.
- **Next:** M1-T2 paper intake, member search, profiles and configuration. Original Part 1/2 form and real service labels remain launch/acceptance inputs; use synthetic fixtures until supplied.

### Feature Review

- **Review:** fresh code reviewer found password-reset/session-issuance race and shortened authentication tags; both fixed through observed **RED → GREEN** regressions.
- **UX recovery:** reviewer also found stale identity after expired logout; regraded as material for this audience, fixed through real-browser **RED → GREEN**.
- **Verification:** final API suite **34/34**, browser suite **10/10**, lint/typecheck/production build pass. No code re-review substituted for regression proof.
- **Review boundary:** current staff-shell slice only; full M1 review and acceptance remain pending.

---

## Full POC Execution — 18 October 2026

- **User instruction:** finish all implementation first; user tests whole flow once afterward. Do not stop after modules, ask for incremental testing, or ask whether to continue.
- **Execution:** use skill-directed subagents with explicit file/schema ownership; root coordinates integration, reviews and final whole-flow checks. Existing plan/spec remain authoritative.
- **Current proof:** core T2 slice passed 53 API and 19 browser checks, lint/typecheck/build; fresh reviews found edit-load failure, stale overwrite and numeric error recovery defects. Full T2 not complete until addressed and remaining settings/privacy/reference work done.
- **Review ruling:** implement all material findings before acceptance; duplicate existing-record action must say `เปิดข้อมูลเดิม`, not imply merging.
- **Agent recovery:** first T2 completion worker hit provider usage limit before edits; replaced once using supported model. No task marked complete based on failed dispatch.
- **Schema owner:** `/root/finish_staff_intake` until it explicitly releases; subsequent workers coordinate sequential schema changes.
- **External inputs:** original paper form and service labels requested asynchronously; proceed on test fixtures meanwhile. Real LINE/email credentials, actual deployment and staff acceptance require external inputs and are not fabricated.


---

## Full POC Build — Claude session, 18 October 2026 (Codex hit its usage limit)

- **Takeover:** read Codex logs and ledger; two Codex workers (`signup_printing`, `member_services`) died mid-edit. Re-verified everything instead of trusting their claims.
- **Fixed on arrival:** PDPA deletion request did not soft-delete the member; a PDF test flagged zero-width markers (see decision D1).
- **M2:** documents (consent before bytes, magic bytes, HEIC conversion, EXIF/GPS strip, Thai watermark, encrypted store, admin-only contents), caregiver link QR (single use, race-tested), unlink and self-removal, profile corrections with stale-edit detection, review queues, all member/staff screens. Found and fixed a real signup bug with `caregiverMemberId`.
- **M3:** courses/runs/sessions/questions with post-booking locks; seats under a PostgreSQL run lock (20 concurrent requests tested); approval, waitlist, cutoff, manual promotion; self-cancel deadline and reschedule window to the instant; org cancellations with notices; immutable snapshots and rejoin; walk-in in one transaction with a rollback test; member and staff screens.
- **M4:** attendance (unmarked ≠ absent), dashboard, run form printing, memberships with exact money, role-safe streaming Excel (formula text safe, per-booking snapshots), organization settings, staff accounts page.
- **M5 (software):** outbox worker (row-lock claims, lease recovery, retry key = record id, 1m/5m/15m/1h/6h), LINE and email adapters, fallback rules, quota, staff follow-up, grouped reminders, retention jobs, scheduler, LINE ID-token verification, signed webhook, rich-menu sync, telemetry scrubber, production fail-closed config, Compose stack, backup/restore scripts, runbook, acceptance checklist. API and web images build; the API image boots only with full config.
- **Evidence:** 225 API tests, 56 browser tests (including a whole-POC run), lint, typecheck, production build; browser suite re-run twice for repeatability.
- **Not verified (needs accounts or a server):** real LINE LIFF/Messaging/Login, real email provider, `docker compose up` of the full stack with real secrets and DNS, backup to Google Drive, restore rehearsal with real keys, staff dry run.
- **Decisions and gaps:** `docs/decisions/2026-10-18-overnight-gaps-and-decisions.md`.
