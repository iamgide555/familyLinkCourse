---
name: FamilyLink Phase 1 Prototype
description: A Thai clinic queue-ticket world for caregiver registration and NGO course administration.
colors:
  waiting-hall-ground: "#dce8e5"
  waiting-hall-ground-deep: "#c8d9d5"
  thermal-sheet: "#fbfcfb"
  green-ink: "#14201d"
  ink-soft: "#3f504a"
  ink-muted: "#4b5c56"
  perforation-line: "#cfdbd7"
  perforation-line-strong: "#8fa39d"
  action-teal: "#0a6b5a"
  action-teal-pressed: "#07564a"
  action-teal-tint: "#e0f0ec"
  attention-amber: "#9c500c"
  attention-amber-tint: "#fbeedd"
  error-red: "#b3261e"
  error-red-tint: "#fbe9e7"
typography:
  display:
    fontFamily: "Kanit, Sarabun, Thonburi, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0"
  headline:
    fontFamily: "Kanit, Sarabun, Thonburi, system-ui, sans-serif"
    fontSize: "clamp(1.625rem, 1.2rem + 1.8vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0"
  title:
    fontFamily: "Kanit, Sarabun, Thonburi, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Sarabun, Thonburi, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Sarabun, Thonburi, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  sm: "8px"
  field: "10px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.field}"
    padding: "8px 20px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.action-teal-pressed}"
  button-secondary:
    backgroundColor: "{colors.thermal-sheet}"
    textColor: "{colors.action-teal}"
    rounded: "{rounded.field}"
    padding: "8px 20px"
    height: "46px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.action-teal}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
    height: "40px"
  ticket:
    backgroundColor: "{colors.thermal-sheet}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.field}"
    padding: "10px 14px"
    height: "50px"
  choice-selected:
    backgroundColor: "{colors.action-teal-tint}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  pill-approved:
    backgroundColor: "#ffffff"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.pill}"
    padding: "1px 12px 1px 8px"
  pill-waitlist:
    backgroundColor: "{colors.attention-amber-tint}"
    textColor: "{colors.attention-amber}"
    rounded: "{rounded.pill}"
  nav-current:
    backgroundColor: "{colors.green-ink}"
    textColor: "#ffffff"
    rounded: "{rounded.field}"
    height: "46px"
---

# Design System: FamilyLink Phase 1 Prototype

## Overview

**Creative North Star: "The Clinic Queue Ticket"**

Every registration is a numbered ticket held on a pale mint-grey waiting-hall ground. Cool thermal-paper sheets with notched, perforated edges and dashed tear lines carry the content; near-black green ink does the talking; queue numerals are large and tabular. The result is calm, Thai-government-form legible and deliberately unlike a card-grid SaaS dashboard or a Google Form.

Density is moderate and touch-first: 17px body, 46-54px controls, generous line height for Thai script. Colour is rationed. Ink carries structure and state; teal means "you can press this"; amber means "look here".

**Key Characteristics:**
- Sheets (tickets) on a tinted ground, separated by tear lines rather than boxes in boxes.
- Kanit for numerals and headings, Sarabun for everything read.
- Teal is exclusively an action colour.
- Status is carried by glyph, word and border form, never hue alone.
- Soft, low shadows; no hard offsets.

## Colors

A cool mint-grey and green-ink palette with a single teal action voice and a single warm amber attention voice.

### Primary
- **Action Teal** (#0a6b5a): Pressable things only: primary and secondary buttons, quiet buttons, links, caret, selected-control marks, focus ring, switch on-state. Pressed state is Action Teal Pressed; hover tint is Action Teal Tint.

### Secondary
- **Attention Amber** (#9c500c) on **Amber Tint** (#fbeedd): Waitlist, open-item tags, the "bring this" note. Never decorative.

### Neutral
- **Waiting-Hall Ground** (#dce8e5) and **Ground Deep** (#c8d9d5): page background; the ground also fills the punched notches.
- **Thermal Sheet** (#fbfcfb): ticket and rail surfaces. Inputs and approved pills sit on pure white for contrast against the sheet.
- **Green Ink** (#14201d): text, current-nav fill, selected chips, approved status, toasts. **Ink Soft** (#3f504a) and **Ink Muted** (#4b5c56): secondary and helper text.
- **Perforation Line** (#cfdbd7) and **Strong** (#8fa39d): row dividers, tear lines, control borders.
- **Error Red** (#b3261e) on **Red Tint** (#fbe9e7): invalid fields, required marks, destructive quiet button.

### Named Rules
**The Pressable-Only Teal Rule.** Teal appears only on elements that respond to a press. Status, headings and decoration use ink or amber.

**The Never-Hue-Alone Rule.** Status is a drawn glyph plus a word plus a border form: solid (approved), dashed (submitted), double amber (waitlist), dotted and struck (cancelled).

## Typography

**Display Font:** Kanit (with Sarabun, Thonburi, system-ui)
**Body Font:** Sarabun (with Thonburi, Noto Sans Thai, system-ui)

**Character:** Kanit gives queue numbers and headings a ticket-printer weight; Sarabun is the familiar government-form Thai face. Both are self-hosted (Thai and Latin subsets, weights 500/600 Kanit; 400/500/600/700 Sarabun). Numerals are tabular everywhere.

### Hierarchy
- **Display** (Kanit 600, 3-3.25rem, 1): hub step numbers and seats-left count; 1.5rem for queue numbers in the list.
- **Headline** (Kanit 500, clamp 1.625-2.25rem, 1.35): page titles (h1).
- **Title** (Kanit 500, 1.4rem / 1.0625rem for h3, 1.35): section headings.
- **Body** (Sarabun 400, 17px, 1.7): running text; descriptions capped near 56-62ch.
- **Label** (Sarabun 600, 1rem, 1.45): field labels, buttons, pills (0.9375rem). Small text floors at 0.9375rem for help and metadata; 0.8125rem is used only for tiny tags.

### Named Rules
**The Numerals-Are-Kanit Rule.** Anything that is a count or a queue number is Kanit, tabular, and the largest thing in its region.

## Layout

Admin screens use a 248px sheet rail with a dashed right edge and a fluid main column (padding clamp(16px, 3vw, 40px)); under 900px the rail becomes a top strip with the nav inline and secondary items hidden. The hub is a 1.25fr / 1fr two-column grid (max 1120px) collapsing at 920px; step rows become a 44px number column under 560px. The participant form is mobile-first (390px primary). Rhythm: 6px label gaps, 10-12px between choices, 20px between fields, 22-28px ticket padding. A dark prototype strip tops each page and is hidden in print.

## Elevation & Depth

Tonal layering plus one soft ticket shadow. Sheets lift off the ground with a hairline plus a long, low blur.

### Shadow Vocabulary
- **Ticket** (`box-shadow: 0 1px 0 rgba(20,32,29,.06), 0 10px 26px -14px rgba(20,32,29,.32)`): every ticket sheet.
- **Notch** (`inset 0 2px 3px rgba(20,32,29,.12)`): the punched half-circles on tear lines.
- **Toast** (`0 12px 28px -10px rgba(0,0,0,.5)`): the only floating element.

### Named Rules
**The Paper-Not-Plastic Rule.** Depth is one soft ticket shadow; no hard offset shadows, no glow except the 3px focus halo on fields.

## Shapes

Soft but not bubbly: 16px tickets, 12px notes and toasts, 10px buttons, fields and choices, 6px checkboxes and tags, full pill for status and chips. Signature form: 20px circular notches punched at both ends of a 2px dashed tear line. Checkbox is square, radio is round; the switch is a 52x30 pill.

## Components

### Buttons
- **Shape:** 10px radius, 46px minimum height (54px large), 1.5px border, Sarabun 600.
- **Primary:** Action Teal fill, white text, 8px 20px padding; pressed shifts 1px down.
- **Hover / Focus:** fill darkens to Teal Pressed; focus is a 3px teal outline at 2px offset (white on dark surfaces).
- **Secondary:** sheet fill, teal text and border; tint on hover. **Quiet:** transparent, teal, 40px; danger-quiet is red. Disabled is Perforation Line fill with muted text.

### Chips
- **Style:** pill, sheet fill, strong-line border, 42px high; count in Kanit.
- **State:** pressed chips fill with Green Ink and white text (not teal).

### Cards / Containers
- **Ticket:** Thermal Sheet, 16px radius, Ticket shadow, 22-28px padding; sections separated by dashed tear lines with notches.

### Inputs / Fields
- **Style:** white, 1.5px strong-line border, 10px radius, 50px high, 17px text.
- **Focus:** teal border plus 3px teal halo. **Error:** red border, red halo, error message with glyph and bold text.
- Choices are whole-row tap targets that tint teal when selected.

### Navigation
- Rail items 46px, 10px radius, Green Ink fill with white text for current page; hover fills with ground. Disabled future items carry a dashed "soon" tag.

### Status Pill (signature)
- Pill with 16px glyph, word, and border form per state. Approved: solid ink on white. Submitted: dashed ink. Waitlist: 4px double amber on amber tint. Cancelled: dotted, muted, struck through.

### Seat Ticks (signature)
- 8x24px bars, one per seat: filled ink for approved, dashed outline for submitted, line colour for free.

## Do's and Don'ts

### Do:
- **Do** put content on Thermal Sheet tickets over the Waiting-Hall Ground, separated by dashed tear lines.
- **Do** reserve Action Teal (#0a6b5a) for pressable elements.
- **Do** pair every status with glyph, word and border form.
- **Do** set counts and queue numbers in Kanit, tabular.
- **Do** keep touch targets at 46px or more on forms, 40px minimum for quiet actions.

### Don't:
- **Don't** use teal for status, headings or decoration.
- **Don't** use amber for anything but waitlist, open items and attention notes.
- **Don't** convey state by colour alone.
- **Don't** build card grids of identical boxes or Google-Forms-style stacked blocks.
- **Don't** add hard offset shadows or drop the ticket's soft shadow for borders.
