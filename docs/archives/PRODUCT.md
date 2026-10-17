# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS (user choice). Prototype files open directly in a browser or on a phone; no build step.

## Users

- Participants: family caregivers in Thailand registering for training courses on a mobile browser, usually arriving from a LINE Official Account message or a link/QR from staff. Thai-speaking, varied digital comfort, often on a phone, possibly stressed or busy.
- FamilyLink staff: non-technical NGO coordinators who today run registration with Google Forms, Google Sheets/Excel, LINE and paper. They use a desktop web admin dashboard to open courses, share links, view registrations, and export Excel.
- Decision-maker: the head of FamilyLink signs off on answers.

## Product Purpose

Replace scattered Google Form + spreadsheet workflow for Thai FamilyLink Association with one central registration and course management system (courses, course runs, sessions, participants, registrations, PDPA consent). Phase 1 success: staff can open a course, share a link, collect registrations, see the list, and export Excel without making a new form and spreadsheet each time.

This deliverable is a clickable prototype for a Friday meeting with FamilyLink, meant to provoke feedback that confirms fields, workflow and rules. It is not the production system.

## Positioning

One system per organization that keeps participants, registrations and PDPA consent in a structured database, with LINE as a delivery channel but not a requirement, built SaaS-ready (multi-tenant) for future partner NGOs.

## Operating Context

- Thai primary UI language, English support later; Thai first.
- Courses are one-day or multi-day (course template, course run/batch, sessions).
- Excel export is the bridge from the current workflow.
- Walk-in registration by staff on phone/tablet.
- Registration links shared via LINE OA, staff message, QR, Facebook, email.

## Capabilities and Constraints

- Phase 1 scope: staff login, course/course run/session management, mobile registration form with base fields plus custom fields, shareable link, registration dashboard, Excel export, PDPA consent capture.
- Out of scope: native app, donor CRM, billing, public NGO signup, attendance/certificate/QR check-in (later).
- Undecided, awaiting FamilyLink: required participant fields, sensitive health data, approval/waitlist/capacity rules, certificate rules, Excel columns, PDPA wording and retention.
- Avoid sensitive health data and citizen ID in the prototype.

## Brand Commitments

None confirmed. User chose to design freely. Name used: "FamilyLink" (Thai FamilyLink Association). Any logo is a placeholder.

## Evidence on Hand

Planning docs only: familylink-phase1-full-overview.md, questions (EN/TH), short memo (TH). No real participant data, no real course data, no logo, no existing spreadsheet columns. All prototype data must be labeled synthetic.

## Product Principles

1. Staff already know Google Forms and Excel; the new tool must feel simpler than those, not cleverer.
2. Registration must work without LINE and without an account.
3. Collect only necessary data; PDPA consent is explicit and visible.
4. Show the system's structure (course, batch, sessions) in plain Thai language staff already use.
5. Prototype exists to surface decisions; make open questions visible rather than hiding them.

## Accessibility & Inclusion

Thai-language text must render with proper Thai fonts and line height. Participants may be older caregivers on mid-range phones: large touch targets, high contrast, readable body size.
