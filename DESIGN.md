---
name: FamilyLink
description: A Thai-language care-association app that talks like a calm LINE chat, green and soft-grey, with large targets and status never carried by colour alone.
colors:
  line-green: "#06c755"
  line-green-press: "#05b04b"
  on-green: "#04210f"
  action: "#067d34"
  action-hover: "#05672b"
  action-tint: "#e5f8ec"
  ground: "#dde5ef"
  surface: "#ffffff"
  soft: "#f1f4f8"
  soft-hover: "#e3e8f0"
  ink: "#111317"
  ink-soft: "#4a5262"
  line: "#e4e8ef"
  line-strong: "#b9c1cf"
  control-border: "#7f8aa0"
  error: "#b3261e"
  error-hover: "#8f1d17"
  error-tint: "#fdecea"
  danger-bg: "#b3261e"
  amber: "#8a4b00"
  amber-tint: "#fff2d9"
  ok-bg: "#dcf7e6"
  ok-fg: "#05692b"
  info-bg: "#e8eefc"
  info-fg: "#1f3f9e"
  mute-bg: "#eceff4"
  mute-fg: "#5a6372"
  dark-ground: "#0e1116"
  dark-surface: "#1a1e26"
  dark-ink: "#f0f2f6"
  dark-ink-soft: "#a9b1bf"
  dark-line: "#2a303b"
  dark-line-strong: "#47505f"
  dark-control-border: "#7d889c"
  dark-action: "#42e08a"
  dark-action-hover: "#6aeba4"
  dark-action-tint: "#12301f"
  dark-error: "#ff8f86"
  dark-error-tint: "#3a1f1d"
  dark-amber: "#ffc46b"
  dark-amber-tint: "#3a2b10"
  dark-soft: "#242a34"
  dark-soft-hover: "#2e3541"
  dark-ok-bg: "#12301f"
  dark-ok-fg: "#7be8ae"
  dark-info-bg: "#1b2a52"
  dark-info-fg: "#a9c1ff"
  dark-mute-bg: "#2a303b"
  dark-mute-fg: "#aab2c0"
  dark-danger-bg: "#c8372d"
typography:
  headline:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.4
  count:
    fontFamily: "Kanit, Sarabun, Thonburi, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
  body:
    fontFamily: "Sarabun, Thonburi, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Sarabun, Thonburi, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  card: "20px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.line-green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.lg}"
    height: "52px"
    padding: "0.7rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.line-green-press}"
  button-secondary:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "52px"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "52px"
  button-danger-outline:
    backgroundColor: "{colors.error-tint}"
    textColor: "{colors.error}"
    rounded: "{rounded.lg}"
    height: "52px"
  button-quiet:
    textColor: "{colors.action}"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "12px 14px"
  pill:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "2px 14px 2px 10px"
  notice:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "14px 18px 14px 56px"
  review-item:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "18px 20px"
  tab-current:
    backgroundColor: "{colors.action-tint}"
    textColor: "{colors.action}"
    rounded: "{rounded.lg}"
    height: "68px"
---

# Design System: FamilyLink

## Overview

**Creative North Star: "The Association's LINE Chat"**

FamilyLink looks and behaves like a conversation with the association inside LINE, the app its older staff and caregivers already trust. A pale blue-grey wallpaper (the chat ground) carries a white content pane; system messages are speech bubbles with a small flattened corner; people are friend-list rows with a round initial; the main sections are a rich-menu tab bar. Everything is large, soft and Thai-first: 18px body, 48px or taller targets, rounded 14px controls.

Green is the one brand voice, but it is used in two ways on purpose. Bright LINE green (#06c755) is a fill only and always carries dark ink; a deeper green (#067d34) carries text, links, focus rings and selected states, because white on LINE green fails contrast. Status is always a drawn glyph plus a Thai word on a tinted chip; colour only reinforces it. Light and dark are both first-class: the app follows the device unless a person chooses สว่าง or มืด.

**Key Characteristics:**
- Chat-bubble messages, friend-list rows, bottom tab bar: borrowed from LINE, not decoration.
- Two greens: bright fill with dark ink, deep green for text and focus.
- Soft grey (not outlines) separates secondary controls and groups.
- Flat surfaces; one faint ambient shadow.
- Motion is small, transform-only, and absent under reduced motion.

## Colors

A pale blue-grey ground, white panes, one green family, and warm amber for "needs a person". Each theme swaps the same custom property names; a documented dark counterpart exists for every role.

### Primary
- **LINE Green** (line-green, #06c755): fill for the primary button, the app-mark tile and text selection. Press state is line-green-press (#05b04b). Always paired with **Green Ink** (on-green, #04210f). Never text, never under white text.
- **Action Green** (action, #067d34; dark theme #42e08a): links, focus ring, selected tab text, quiet buttons, chevrons and checkbox accents. Hover #05672b (dark #6aeba4). Tint #e5f8ec (dark #12301f) backs selected tabs, success bubbles, row hover and confirmation panels.

### Secondary
- **Alert Red** (error, #b3261e; dark #ff8f86): errors, absent state, destructive text. Solid destructive buttons use danger-bg (#b3261e; dark #c8372d) with white text. Tint #fdecea (dark #3a1f1d).
- **Attention Amber** (amber, #8a4b00; dark #ffc46b) on amber-tint (#fff2d9; dark #3a2b10): waitlist, counts that need a person, warning cells in the profile strip.
- **Info Blue** (info-fg #1f3f9e on info-bg #e8eefc; dark #a9c1ff on #1b2a52): "submitted" status only.

### Neutral
- **Chat Wallpaper** (ground, #dde5ef; dark #0e1116): page background.
- **Pane White** (surface, #ffffff; dark #1a1e26): app bar, content pane, cards, inputs, tab bars.
- **Soft Grey** (soft, #f1f4f8; dark #242a34; hover #e3e8f0 / #2e3541): bubbles, secondary buttons, chips, tiles, answer boxes.
- **Ink** (ink, #111317; dark #f0f2f6) and **Quiet Ink** (ink-soft, #4a5262; dark #a9b1bf): text.
- **Hairline** (line, #e4e8ef; dark #2a303b), **Strong Hairline** (line-strong, #b9c1cf; dark #47505f), **Control Border** (control-border, #7f8aa0; dark #7d889c) for input edges, which must stay visible.
- Status pairs: ok (#dcf7e6 / #05692b; dark #12301f / #7be8ae) and mute (#eceff4 / #5a6372; dark #2a303b / #aab2c0).

### Named Rules
**The Dark Ink On Green Rule.** Bright LINE green is a fill and takes only Green Ink text. Text, links and focus use Action Green. White-on-#06c755 is forbidden.
**The Glyph And Word Rule.** No status is communicated by colour alone: every state is a drawn glyph plus a Thai word.
**The Both Themes Rule.** Any new colour role gets a light and a dark value under the same custom property name; never hard-code a colour in a component.

## Typography

**Display Font:** Kanit (500/600, with Sarabun, Thonburi, sans-serif)
**Body Font:** Sarabun (400/600, with Thonburi, sans-serif)

**Character:** Kanit gives headings and big numerals a rounded, friendly signature; Sarabun is a plain readable Thai text face. Both are self-hosted woff2 with Thai and Latin subsets.

### Hierarchy
- **Headline** (Kanit 600, 1.75rem / 1.55rem on phones, 1.4): page title in the content pane.
- **Title** (Kanit 500, 1.25rem to 1.3rem, 1.4 to 1.5): section and card headings; the app wordmark is Kanit 500 at 1.3rem.
- **Count** (Kanit 600, 1.9rem in todo tiles, 2.25rem in roster tiles, line-height 1, tabular numerals): attendance and to-do numbers.
- **Body** (Sarabun 400, 18px root, 1.65): all running text; intro bubbles capped near 62 to 70ch.
- **Label** (Sarabun 600, 0.95rem, 1.25): tab captions, chips, hints, field metadata. Collapsible section headings use Sarabun 600 at 1.15rem.

### Named Rules
**The Eighteen Floor Rule.** Nothing renders below 0.95rem (about 17px); body stays 18px.

## Layout

A single-column content pane on a wallpaper ground. Member (LINE) pages are capped at 640px with a fixed bottom tab bar of the same width. Staff pages on desktop (900px and up) have a fixed 108px left tab rail under a 65px sticky app bar and content up to 1040px; below 900px the rail becomes a bottom tab bar (68px tabs) with safe-area padding, and the same four tabs (สมาชิก, วันนี้, คอร์ส, รายงานและตั้งค่า) are always visible, with nothing hidden behind a menu. Each tab shows a row of sibling-page chips above the content when it has more than one page. The app bar carries the account name, an always-visible "ออกจากระบบ" button and the colour-mode toggle. Forms use a two-column grid that collapses to one column at 760px. Spacing is a loose 4/8 rhythm: 8, 12, 16, 24 and 32px, with 1.5 to 2rem between sections. Gutters are fixed pixels so enlarged text has room.

## Elevation & Depth

Mostly flat and tonal: depth comes from white panes on the darker wallpaper and soft-grey tiles inside white panes, not from shadow.

### Shadow Vocabulary
- **Ambient Edge** (`box-shadow: 0 1px 2px rgba(17,19,23,0.08)`; dark `rgba(0,0,0,0.4)`): the content pane and review cards.

### Named Rules
**The Tonal First Rule.** Separate with soft grey or a hairline before reaching for a shadow; a shadow means the thing floats.

## Shapes

Generously rounded. Controls are 14px; inputs 12px; cards and bubbles 18px; the content pane 20px (16px on phones); chips, theme toggle and badges are full pills; avatars and icon discs are circles. Speech bubbles use `18px 18px 18px 6px`, a small flat bottom-left corner. Cards use a 1px hairline or none. Icons are drawn glyphs (SVG masks) at 16px in chips and 22 to 28px in tabs and bubbles.

## Components

### Buttons
- **Shape:** 14px radius, 52px minimum height, 600 weight, 1.5px border.
- **Primary:** LINE green fill, Green Ink text; press #05b04b.
- **Secondary:** Soft Grey fill, Ink text, no border.
- **Danger:** solid red with white text for confirmations; **Danger Outline** is a red-tint fill with red text for the triggering action.
- **Quiet:** Action Green underlined text, 48px tall, tint on hover.
- **Press:** `scale(0.97)` only when reduced motion is not requested. Focus: 3px Action Green outline, 3 to 4px offset.

### Chips
- **Status pill:** full pill, Label type, a 16px drawn glyph then a word. Tints: ok green (confirmed, present, available) with a tick; info blue (submitted) with a clock; amber (waitlisted) with an hourglass; mute grey with a cross (cancelled, rejected, refused, closed, not open; cancelled also struck through); red tint with a cross (absent); soft with a dashed circle (unmarked).
- **Switcher and jump links:** pill buttons; the selected switcher uses action-tint with an Action Green border and text.

### Cards / Containers
- **Review card:** white, 18px radius, Ambient Edge shadow, 18px by 20px padding; answers sit inside as a soft-grey box.
- **Content pane:** white, 20px radius, 28px padding.
- **Count tiles:** to-do rows have a 64px amber numeral tile (soft grey when zero); roster counts are four white tiles on a soft panel (two across under 480px); the profile status strip is auto-fit soft tiles with amber (needs attention) or green (fine) tints.

### Inputs / Fields
- **Style:** 56px tall, white, 1px Control Border, 12px radius, 12px by 14px padding, label above in 600 weight.
- **Focus:** 3px Action Green outline, 2px offset. **Error:** red border plus a worded message below; hints sit in Quiet Ink.
- Checkboxes and radios are 32px with the Action Green accent.

### Navigation
- **App bar:** sticky white, hairline bottom, green mark tile (rounded square with two interlocked rings) and wordmark on the left, theme toggle on the right.
- **Tabs:** icon over a Label caption; resting Quiet Ink, current action-tint with Action Green text and 16px radius. Red count badge on the corner.
- **Sub-menu chips:** 48px pills above the content showing the sibling pages of the current tab (ink-filled when current, count badge where something waits for a person); they wrap, never scroll, and a tab with a single page shows none.
- **Theme toggle:** pill with a drawn sun, moon or half-disc plus its word, cycling ตามเครื่อง, สว่าง, มืด; the choice is stored under `fl-theme` and applied before paint by `theme-init.js`.

### Friend-list rows
52px circular initial (Kanit 600) from one of six tone pairs, then name, contact, and status chip; 14px radius with soft hover. On phones the row stacks beside the avatar.

### Message bubbles
Page intros and notices are soft-grey bubbles; notices carry a 28px disc at left (green tick, red exclamation, or grey exclamation) with a white glyph, and success and error also tint the bubble.

### Motion
Arrivals are transform-only (`arrive` 12px rise 0.4s, `pop` from 0.85 scale, `sheet-up` 16px rise), staggered 50 to 250ms, with easing `cubic-bezier(0.16, 1, 0.3, 1)`. All run only inside `prefers-reduced-motion: no-preference`; opacity is never animated so contrast never dips.

## Do's and Don'ts

### Do:
- **Do** use bright LINE green only as a fill with Green Ink (#04210f) text; use Action Green for text, links and focus.
- **Do** pair every status with a glyph and a Thai word on a chip.
- **Do** keep targets at 48px or taller (tabs 68px, buttons 52px, inputs 56px) and body at 18px.
- **Do** define colours as custom properties with both a light and dark value.
- **Do** keep destructive actions red and worded, never the green of a save.
- **Do** keep motion transform-only and inside `prefers-reduced-motion: no-preference`.

### Don't:
- **Don't** put white text on #06c755.
- **Don't** signal state with colour alone, or animate opacity.
- **Don't** use shadows for ordinary separation; the Sheet shadow belongs to floating panels.
- **Don't** add new text below 0.95rem or Latin-only labels; copy is Thai.
- **Don't** hard-code new pastels or hex values in components.
