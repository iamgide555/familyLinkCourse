---
name: FamilyLink
description: A Thai clinic queue-ticket world for older staff and caregivers: thermal sheets on a mint waiting-hall ground, perforated and numbered.
colors:
  waiting-hall-ground: "#dce8e5"
  thermal-sheet: "#fbfcfb"
  green-ink: "#14201d"
  ink-soft: "#3f504a"
  perforation: "#b6c8c3"
  perforation-line: "#cfdbd7"
  perforation-strong: "#8fa39d"
  paper-edge: "#9fb3ad"
  control-border: "#7a8f88"
  action-teal: "#0a6b5a"
  action-teal-pressed: "#07564a"
  action-teal-tint: "#e0f0ec"
  attention-amber: "#9c500c"
  attention-amber-tint: "#fbeedd"
  error-red: "#b3261e"
  error-red-pressed: "#8f1d17"
  error-red-tint: "#fbe9e7"
typography:
  headline:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 500
    lineHeight: 1.45
  title:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 500
    lineHeight: 1.5
  numeral:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  stub-numeral:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "Sarabun, Thonburi, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Sarabun, Thonburi, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  meta:
    fontFamily: "Sarabun, Thonburi, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "11px 20px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.action-teal-pressed}"
  button-secondary:
    backgroundColor: "{colors.thermal-sheet}"
    textColor: "{colors.action-teal}"
    rounded: "{rounded.sm}"
    padding: "11px 20px"
    height: "52px"
  button-danger:
    backgroundColor: "{colors.error-red}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    height: "52px"
  button-danger-outline:
    backgroundColor: "{colors.thermal-sheet}"
    textColor: "{colors.error-red}"
    rounded: "{rounded.sm}"
    height: "52px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.action-teal}"
    padding: "4px 6px"
    height: "48px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "56px"
  ticket:
    backgroundColor: "#ffffff"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
  stub:
    backgroundColor: "{colors.action-teal-tint}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.lg}"
    width: "104px"
  pill:
    backgroundColor: "#ffffff"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.pill}"
    padding: "1px 14px 1px 10px"
  pill-waitlist:
    backgroundColor: "{colors.attention-amber-tint}"
    textColor: "{colors.attention-amber}"
    rounded: "{rounded.pill}"
  nav-item:
    backgroundColor: "{colors.thermal-sheet}"
    textColor: "{colors.action-teal}"
    rounded: "{rounded.sm}"
    height: "56px"
  nav-current:
    backgroundColor: "{colors.green-ink}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    height: "56px"
---

# Design System: FamilyLink

## Overview

**Creative North Star: "The Clinic Queue Ticket"**

Every record is a numbered ticket. The page is one cool thermal-paper sheet laid on a pale mint-grey waiting-hall ground; the page title is the ticket header, torn off from the body by a dashed perforation whose ends are punched into the sheet's edges. Near-black green ink does the talking, queue numerals are large and tabular, and rows are divided by tear lines rather than boxes inside boxes. It reads like a Thai clinic or government queue slip, and deliberately unlike a card-grid SaaS dashboard or a Google Form.

The users are older staff and caregivers on phones and office screens, Thai only. Density is calm and touch-first: 18px body, 48px minimum targets (52-56px for primary controls), generous line height for Thai script. Colour is rationed: ink carries structure and state, teal means "you can press this", amber means "look here", red means error or destruction.

**Key Characteristics:**
- Thermal sheet on mint ground, separated from its header by a dashed perforation with edge notches.
- Numbered stubbed tickets for registrations; counts and queue numbers in Kanit, tabular, the largest thing in their region.
- Status is a drawn glyph plus a word plus a border form, never hue alone.
- One loud action per region; the rest are secondary, outline, danger or quiet.
- The current place is filled ink, never teal.
- One soft ticket shadow; no hard offsets.

## Colors

A cool mint-grey and green-ink palette with one teal action voice, one amber attention voice and one red error voice.

### Primary
- **Action Teal** (`action-teal`): primary and secondary buttons, quiet buttons, links, caret, focus ring, selected-control accents, text selection. Pressed is `action-teal-pressed`; hover and open-disclosure tint is `action-teal-tint`.

### Secondary
- **Attention Amber** (`attention-amber`) on **Amber Tint** (`attention-amber-tint`): waitlisted status and the profile strip's warning cell. Never decorative. (The profile warning cell also uses a one-off brown pair, #8a5a00 border and #6b4500 value text, in a legacy rule that the later strip rule overrides in background only.)

### Tertiary
- **Error Red** (`error-red`) on **Red Tint** (`error-red-tint`): invalid fields, error notices, absent status, destructive buttons, the nav count badge. Pressed is `error-red-pressed`.

### Neutral
- **Waiting-Hall Ground** (`waiting-hall-ground`): page background; it also fills every punched notch so the notch reads as a hole.
- **Thermal Sheet** (`thermal-sheet`): the workspace sheet and quiet control fills. Inputs, tickets, answer boxes and pills sit on pure white (#ffffff) against it.
- **Green Ink** (`green-ink`): text, current-place fill, status pill borders, large numerals. **Ink Soft** (`ink-soft`): helper, meta and secondary text.
- **Perforation** (`perforation`): dashed tear lines and row dividers. **Perforation Line** (`perforation-line`): hairline solid borders. **Perforation Strong** (`perforation-strong`): header tear, stub tear, disclosure panel borders, scrollbars. **Paper Edge** (`paper-edge`): the outline of the sheet and tickets.
- **Control Border** (`control-border`): borders of inputs and nav buttons, darkened so the control edge reaches 3:1 for low-vision users.

### Named Rules
**The Pressable-Only Teal Rule.** Teal marks things that respond to a press. Status, headings, the current place and decoration use ink or amber. Success notices and a few "ok" values in the build still use teal text; treat that as drift, not precedent.

**The Never-Hue-Alone Rule.** Every status carries a drawn glyph, a word and a border form: solid (confirmed, present, available), dashed (submitted), 5px double amber (waitlisted), dotted and struck (cancelled, rejected, refused), solid red on red tint (absent), dotted muted with a dashed-circle glyph (unmarked).

## Typography

**Display Font:** Kanit 500/600 (with Sarabun, Thonburi, sans-serif)
**Body Font:** Sarabun 400/600 (with Thonburi, sans-serif)

**Character:** Kanit gives headings and queue numbers a ticket-printer weight; Sarabun is the familiar, legible Thai text face. Both are self-hosted in Thai and Latin subsets. Numerals are tabular wherever they are counted.

### Hierarchy
- **Headline** (Kanit 500, 1.8rem, 1.45; 1.5rem under 760px): the page title, which is the ticket header.
- **Title** (Kanit 500, 1.3rem, 1.5; 1.1rem for h3, 1.35rem inside a stubbed ticket body): section and ticket headings. Disclosure summaries use Sarabun 600 at 1.15rem instead.
- **Numeral** (Kanit 600, 2.25rem, 1, tabular): dashboard to-do counts and roster counts.
- **Stub numeral** (Kanit 600, 3rem, 1; 2.25rem under 560px): the number on a registration stub.
- **Body** (Sarabun 400, 18px root, 1.65): running text; intros capped at 65-70ch.
- **Label** (Sarabun 600, 1rem): field labels, buttons, nav items, pills (at 0.95rem).
- **Meta** (Sarabun 400, 0.95rem, ink-soft): hints, counts, record state. 0.95rem is the minimum text size.

### Named Rules
**The Numerals-Are-Kanit Rule.** A count or a queue number is Kanit, tabular and the largest thing in its region.

**The 0.95 Floor Rule.** No text below 0.95rem; product users are older and read on phones.

## Layout

A single centered column. Staff screens use a 1160px shell with 24px gutters (12px under 760px) holding one sheet padded 32px (24px under 760px, 20px for member pages); the member (LINE) shell is 640px wide with 16px gutters. Staff navigation is a bar of four daily tasks in a 4-column grid (2 columns under 560px, max 820px) with everything else behind one disclosure whose panel is a 3-column list (2 under 760px, 1 under 400px). Member pages use a three-tab row. Forms are two columns collapsing to one at 760px; record fields use the same grid. Result rows are three-column grids (person, contact, open link) collapsing to one. Rhythm is 8 / 12 / 16 / 20 / 24 / 32px with 1.25-1.75rem between sections; gutters stay fixed in px so enlarged text does not squeeze them. Reduced-motion removes all transitions.

## Elevation & Depth

Tonal layering plus one soft ticket shadow, with depth read mainly from paper edges and notches. The sheet and each ticket lift off the ground with a hairline plus a long, low blur and a visible paper-edge border.

### Shadow Vocabulary
- **Ticket** (`box-shadow: 0 1px 0 rgba(20, 32, 29, 0.12), 0 16px 30px -12px rgba(20, 32, 29, 0.45)`): the sheet and every ticket.
- **Notch** (`box-shadow: inset 0 3px 4px rgba(20, 32, 29, 0.3)`): the punched half-circles at perforation ends, drawn inside the sheet so they never widen the page.

### Named Rules
**The Paper-Not-Plastic Rule.** Depth is the one ticket shadow. No hard offset shadows, no glow; the only other emphasis is the 3px teal focus outline.

## Shapes

Soft but not bubbly: 16px sheet and tickets, 12px disclosure panels and strips, 8px buttons, fields, nav items and notices, full pill for status and the count badge. Signature form: a 2px dashed tear line with half-round notches punched at both ends (22px tall, 12px deep), and on stubbed tickets a vertical dashed tear with notches top and bottom. Row dividers are dashed rather than solid. Empty states are a blank ticket with a 2px dashed outline.

## Components

### Buttons
- **Shape:** 8px radius, 52px minimum height, Sarabun 600, 1px border in the fill colour.
- **Primary:** Action Teal fill, white text; darkens to pressed teal on hover. One per region.
- **Secondary:** sheet fill, teal text and border; tint on hover.
- **Danger:** red fill, white text, for the destructive confirm only. **Danger outline:** sheet fill, red text and border, for the offer to delete.
- **Quiet:** no fill, teal underlined text, 48px high; tint with 8px radius on hover. Use for the third and later actions.
- **Focus:** 3px teal outline at 4px offset (2px on inputs). Disabled is 60% opacity.

### Inputs / Fields
- **Style:** white fill, 1px control-border, 8px radius, 56px high, 12px 14px padding.
- **Error:** red border via aria-invalid, plus a 1rem red message below. Hints sit above in meta text.
- Checkboxes and radios are 32px with teal accent, inside whole-row 48px choices.

### Navigation
- Staff bar items and member tabs are 56-60px bordered buttons on sheet fill with teal text; hover tints. The current place is filled Green Ink with white text. The more-toggle shows a chevron that rotates when open and tints with an ink border. The members tab row shows an error-red count badge.

### Ticket (stubbed registration)
- White, 16px radius, paper-edge border and ticket shadow. A 104px stub (72px under 560px) at the left holds a label and the number in Kanit, on teal tint, divided from the body by a vertical dashed tear with notches. The body holds the heading, details and a tear line before actions.

### Status Pill (signature)
- Pill with a 16px drawn glyph, a word, and a border form per status (see the Never-Hue-Alone Rule). Default is solid ink on white; waitlisted is amber on amber tint with a 5px double border.

### Row Menu
- Each row shows one loud action; the others sit in a "manage" disclosure styled as a bordered 52px button with a rotating chevron, opening a wrapped list of secondary, outline or danger actions.

### Profile Status Strip
- Three cells in one ruled white strip (12px radius, paper-edge border) separated by dashed vertical tear lines, stacking with dashed horizontal lines under 560px. A warning cell takes amber tint.

### Empty State
- A blank ticket: sheet fill, 2px dashed perforation outline, 16px radius, 28px 24px padding, one sentence and one next action.

## Do's and Don'ts

### Do:
- **Do** put content on the Thermal Sheet over the Waiting-Hall Ground, with the title torn off by a dashed perforation and edge notches.
- **Do** divide rows and sections with dashed tear lines (`perforation`), not solid boxes.
- **Do** pair every status with a glyph, a word and a border form.
- **Do** set counts and queue numbers in Kanit 600, tabular.
- **Do** keep targets at 48px or more, primary controls at 52-56px, and control borders at `control-border` (3:1).
- **Do** show one primary action per region and demote the rest to secondary, outline, danger or quiet.
- **Do** mark the current place with Green Ink fill and white text.

### Don't:
- **Don't** use teal for status, headings, current place or decoration.
- **Don't** use amber except for waitlisted and attention.
- **Don't** convey state by colour alone.
- **Don't** build grids of identical boxes or stacked Google-Forms blocks.
- **Don't** add hard offset shadows or glow, or replace the ticket shadow with plain borders.
- **Don't** set text below 0.95rem.
