# Staff Login UX

## Scope and disposition

- **Surface:** `/staff/login`, implemented in `apps/web/src/app/staff/login/login.component.ts`, `apps/web/src/app/staff/login/login.component.html`, `apps/web/src/app/staff/login/login.component.css` and `apps/web/src/styles.css`.
- **Direction:** a narrow extension of the existing prototype world, following `apps/web/.impeccable/surfaces/apps-web-src-app-staff-login-login-component-ts.md` and the accessibility needs in `PRODUCT.md`.
- **Finish disposition:** the finish reviewer returned **ship** after directing and approving an enlarged-text fix for usable form width, a recognizable heading and a single-line submit label. Refreshed desktop, mobile and credential-error captures retain their original behavior and identity. This disposition covers the login surface; the uncaptured staff shell is outside this review.

---

## Evidence

- **Desktop:** `.impeccable/review/desktop.png`, captured at `1440 × 1000`; short staff guidance sits left of one bounded form.
- **Mobile:** `.impeccable/review/mobile.png`, captured at `320 × 780` with full-page output; the form leads and staff/member guidance follows.
- **Error:** `.impeccable/review/login-error.png`; the credential alert explains retry while retaining the synthetic email and keeping the submit action available.
- **Enlarged text:** `.impeccable/review/zoom-mobile.png`, captured at `320 × 900` with full-page output and the root font doubled from `18px` to `36px`; the form remains usable and the submit label fits on one line.
- **Measured:** `.implementation/ux/evidence.json` records `18px` Sarabun body text and no horizontal overflow at the captured desktop or mobile width. `.implementation/ux/capture.log` records one passing capture test.
- **Regression:** `.implementation/zoom-word-red.log` records **RED** when the Thai action word `ระบบ` split across two lines. After the horizontal-gutter fix, `.implementation/browser-green.log` records **GREEN** with all nine browser tests passing, including the word staying on one line and no horizontal scrolling at `320px` and `1280px` with a `36px` root font.
- **Mechanical review:** `.implementation/ux/detector.json` contains an empty findings list (`[]`); the visual review also confirmed readable Thai, control sizing, error recovery and inherited identity.
- **Limits:** the enlarged-text test doubles the root font size; it does not emulate actual browser zoom. Focus, validation, reveal and pending behavior below are also evidenced by the implementation and the browser tests.

---

## Surface choices

- **Readable Thai:** self-hosted Sarabun body text starts at `18px` with `1.65` line height; Kanit headings retain the prototype's familiar type pairing. Labels remain visible above each field.
- **Large controls:** email, password and submit have a `56px` minimum height. The explicit password-reveal text button has a `48px` minimum height and sits beside its label without narrowing the password input.
- **Keyboard focus:** the global `:focus-visible` rule uses a `3px` teal outline. Invalid submission focuses the first field needing correction; inline errors connect through `aria-describedby` and `aria-invalid`.
- **Clear errors:** missing or malformed email and missing password receive Thai field messages. The credential failure uses a text alert and red boundary/tint; it does not disclose which credential failed. Email remains available for correction.
- **Reveal and pending state:** the reveal button switches between explicit show/hide labels and exposes `aria-pressed`. Submission marks the form busy, disables the fieldset and changes the submit label until the request finishes.
- **Recovery:** a persistent section directs staff who forgot a password or lack an account to the association administrator. Separate guidance directs members and course applicants to the association's LINE menu.
- **Mobile and motion:** at `760px` and below, the layout becomes one column with the form first; at `360px` and below, padding tightens. Fixed mobile horizontal gutters and primary-button horizontal padding capped at `24px` preserve usable content width while text sizes grow. The password-label row can wrap. Reduced-motion preferences remove animation and transition effects.

---

## Incumbent comparison and preserved drift

- **Inherited world:** `prototype/styles.css`, `docs/archives/DESIGN.md` and `.impeccable/design.json` establish pale mint ground (`#dce8e5`), cool sheet (`#fbfcfb`), green ink (`#14201d`), teal actions (`#0a6b5a`), Sarabun/Kanit and soft depth. The login retains these values and a dashed recovery divider.
- **Local adaptations:** body text increases from the prototype's `17px` to `18px`; login controls increase to `56px`; fields use `8px` corners and the form uses `16px` corners. The login uses a quiet bounded sheet without the prototype's ticket notches or queue numerals. These are surface decisions, not replacement system tokens.
- **Preexisting drift:** root `DESIGN.md` is missing while the archived system and existing sidecar remain. This pass preserves them and does not repair or reframe the project-wide design system.
- **Write boundary:** this document records the finished login only; app code, `PRODUCT.md`, the surface contract, archived files, `.impeccable/design.json`, plans and implementation ledgers are unchanged by this documentation pass.
