---
version: 1
slug: "apps-web-src-app-staff-login-login-component-ts"
primary_target: "apps/web/src/app/staff/login/login.component.ts"
related_targets: ["apps/web/src/styles.css"]
---

# Staff Login Surface

**Mode:** Operate. **Scope:** focused login module and staff shell, inheriting existing prototype type/palette; no rebrand or open-ended page concept selection.

## Direction contract

- **THESIS:** staff recognize where to sign in and can recover without technical help; no promotional content or fake dashboard metrics.
- **OWN-WORLD:** incumbent pale mint ground, cool white work surface, dark green ink, teal actions, Sarabun text and Kanit headings. Familiar persistent labels and normal browser inputs.
- **STORY:** identify staff-only entry, enter email/password, optionally reveal password, submit once, see pending state, then name/role and authorized tasks. Errors preserve email and point to recovery.
- **FIRST VIEWPORT:** compact wordmark/header above a two-column desktop work area: short staff guidance left, one clearly bounded login form right. On phones, heading and form lead; guidance follows. One 52px primary submit, visible 18px labels, no sidebar or card grid. Signature interaction: password visibility uses an explicit text button; validation moves focus to the first problem and never silently erases email. Reduced motion disables the short focus/submit transition.
- **FORM:** precisely scoped extension of the established prototype; concept-seed exemption for a narrow, specified module. Seed key: not applicable; inherited world. Build directly in code.
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## UX Acceptance

- **Readability:** 18px Thai body, at least 48px primary controls, visible focus, no horizontal overflow at 320px or 200% text zoom.
- **Errors:** identify missing fields inline; generic server credential error avoids account enumeration; connection failures offer retry; email remains after failure.
- **Security:** never store tokens or passwords in localStorage; browser session cookie is HttpOnly; member signup and staff login are clearly distinct.
