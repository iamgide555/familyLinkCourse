# Implementation Ledger

**Plan:** `docs/plans/2026-10-17-01-staff-intake.md`.

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
