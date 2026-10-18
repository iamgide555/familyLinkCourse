---
target: review UI/UX of staff and member web app
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/iamgide/Desktop/project/familylink/apps/web/src/app"
timestamp: 2026-10-18T03-32-37Z
slug: apps-web-src-app
---
# Critique: FamilyLink web (staff + member), 2026-10-18

Method: dual-agent. Score 29/40 (Good). Heuristics: status 3, real-world 4, control 3, consistency 3, prevention 3, recognition 3, flexibility 2, minimalist 2, recovery 3, help 3.

Verdict: copy is authored for the product; visual layer is generic admin; staff and member share one shell. Detector: 3 broken-image findings, all false positives (Angular [src] QR bindings).

Priority issues
- [P1] Nav overload: 12 links, 7 rows at phone width, 3 rows desktop. Fix: compact header (search, today's attendance, review queue, more). Command: distill. File: apps/web/src/app/staff/staff-layout.component.ts
- [P1] Same-weight actions; no danger button style; 5 identical buttons per session row. Command: clarify. Files: staff/runs/run-sessions.component.ts:29-33, styles.css
- [P2] Long scroll pages without summary (profile ~8200px phone, run ~6600px). Command: layout.
- [P2] Targets and contrast: 28px checkboxes/radios (17), --line 1.38:1 and --line-strong 2.59:1 borders, ~15px secondary text. Command: adapt.
- [P2] "ได้รับเอกสารลงนามแล้ว" looks like a normal primary. Command: harden. File: staff/forms/signup-form-actions.component.ts:15-17
- [P3] Signup form 19 fields, ~3300px, no steps. Command: onboard.

Not seen: caregiver with linked members, roster present/absent buttons, reviews/reports/invites/accounts pages, real mobile Chrome.
