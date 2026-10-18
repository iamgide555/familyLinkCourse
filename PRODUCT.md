# FamilyLink Product

<!-- impeccable:product-schema 1 -->

## Platform

**Platform:** web.

---

## Stack

- **Approved stack:** Angular, NestJS, Prisma and PostgreSQL 16 on a home server with Docker Compose, Caddy and Gotenberg.
- **Build order:** usable website/backend first with development identities, then real LINE integration and end-to-end acceptance.

---

## Users

- **Staff:** two admins and six to ten staff managing intake, member records and courses. User explicitly says most staff are old school and not comfortable with technology.
- **Members:** caregivers and people with psychosocial disabilities; one LINE account may manage several family members. Many members also have limited confidence using technology.
- **Usage:** staff dashboard on desktop; attendance and walk-in tasks must work on phones. Members use mobile LINE pages; personal browser invites allow signup only.

---

## Product Purpose

- **Purpose:** run FamilyLink membership and one real course end to end without fragmented Google Forms and spreadsheets.
- **Success:** every POC feature complete, tested with staff and ready for real use by **31 December 2026**. December staff dry-run is acceptance; early-2027 course is follow-up.

---

## Operating Context

- **Intake:** online signup first; staff print a physical form for member or guardian to sign when attending.
- **Course model:** course → run → sessions, with whole-run or independent session registration.
- **Offline practices:** paper signatures and offline membership payments remain normal workflows; system records their receipt rather than replacing them.
- **Language evidence:** spec labels and existing prototype are Thai-first. **Working assumption pending optional confirmation:** use Thai-only action labels rather than adding English beside them.

---

## Capabilities and Constraints

- **Authority:** `FamilyLink — System Design (POC).md` governs behavior; `docs/plans/2026-10-17-poc-roadmap.md` governs execution order.
- **POC:** members, matching/review, caregiver links, profile changes, documents, notes, courses/questions, approvals/seats/waitlists, cancellation/rescheduling, walk-ins, attendance, membership records, PDFs, Excel, notifications, audit and recovery.
- **Safety:** matching never grants access automatically; staff cannot approve own/family records; stored document contents are admin-only; hidden intake fields never appear in member responses.
- **Uploads:** any online document requires explicit sensitive-data consent before file transmission; no attachments means no sensitive-upload prompt.
- **Outside POC:** certificates, QR attendance, spreadsheet import, standalone member login, interest invitations, billing and multiple NGOs.

---

## Evidence on Hand

- **Behavior:** current system spec and milestone plans.
- **Visual reference:** archived `docs/archives/prototype/` screens, local Sarabun/Kanit fonts, `docs/archives/DESIGN.md` and current `.impeccable/design.json`; historical prototype requirements do not override current product scope.
- **Data:** use synthetic fixtures only during development. Do not fabricate real members, course counts, organization claims or availability.

---

## Product Principles

- **Task clarity:** one obvious next action; name buttons for their real outcome using familiar Thai.
- **Recognition:** visible labels and short instructions; never require users to remember icons, hidden gestures or technical terms.
- **Recovery:** preserve safe form input after errors, explain how to fix problems, show saved outcomes clearly and avoid silent failure.
- **Trust:** reveal only authorized information, separate pending review from successful booking, and never imply a seat or signature exists before it does.
- **Familiarity:** preserve useful paper and LINE workflows; do not add dashboards, visualizations or animation merely for appearance.

---

## Accessibility and Inclusion

- **Confirmed need:** older and less tech-confident users require clear task flow, readable Thai, large touch targets, explicit state and understandable errors.
- **Implementation targets:** 18px body text, at least 48px main controls, visible keyboard focus, persistent field labels, text with status colors, reduced-motion support and usable layout at 200% zoom.
