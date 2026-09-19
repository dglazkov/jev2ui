---
version: alpha
name: Night Shift
description: The status board in a railway signal box at 3 am.
colors:
  primary: "#3DDC97"
  on-primary: "#04140D"
  secondary: "#F2B84B"
  surface: "#0D1117"
  surface-container: "#161B22"
  on-surface: "#E6EDF3"
  on-surface-variant: "#8B949E"
  outline: "#30363D"
  error: "#FF6B6B"
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.04em
rounded:
  sm: 4px
  md: 6px
  full: 9999px
spacing:
  xs: 4px
  sm: 6px
  md: 12px
  lg: 20px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 10px
  button-secondary:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 8px
---

## Overview

The status board in a railway signal box at 3 am: dark room, lit instruments, one operator who has been awake
for a while and needs to know what changed. Night Shift is for operational tools, dashboards and developer
consoles. It is dense, calm and literal. The voice is a logbook: terse, factual, numbers first, no adjectives.

## Colors

- **Primary (#3DDC97):** Phosphor green. The only accent: primary buttons, live values, focus.
- **Secondary (#F2B84B):** Amber, reserved for warnings.
- **Surface (#0D1117):** Near-black, the background of the whole screen.
- **Surface container (#161B22):** One step lighter, for panels.
- **On surface (#E6EDF3):** Off-white text.
- **On surface variant (#8B949E):** Grey for labels, units and timestamps.
- **Outline (#30363D):** Panel borders and dividers.

## Typography

**Space Grotesk** for headings, small and tight. **Inter** at 14px for body text, because operators read a
lot of it. **JetBrains Mono** for every label, unit and number, so columns line up.

## Layout

Compact. A 4px grid, 12px panel padding, and as much on one screen as can stay legible. Related readings are
grouped into panels.

## Elevation & Depth

No shadows; they are invisible in the dark anyway. Panels are one tonal step lighter than the background and
are outlined with a 1px border in the outline colour.

## Shapes

Nearly square: 4px on controls, 6px on panels. Status chips are pills.

## Components

- **Buttons:** Phosphor green with near-black mono label, 4px corners. Secondary buttons are panel-coloured
  with a border.
- **Panels:** Surface container, 1px outline, 6px corners.
- **Inputs:** Background-coloured wells with a 1px outline.

## Do's and Don'ts

- Don't use photographs or illustrations. This is an instrument, and every pixel is data.
- Do use small icons to mark what a panel is about.
- Don't use more than one green element per panel.
- Do put the number before the label.
