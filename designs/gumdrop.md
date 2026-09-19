---
version: alpha
name: Gumdrop
description: A box of fruit gummies turned into a consumer app.
colors:
  primary: "#6C3BF5"
  on-primary: "#FFFFFF"
  secondary: "#FF6FB5"
  tertiary: "#FFC93C"
  surface: "#FFF7EE"
  surface-container: "#FFFFFF"
  on-surface: "#2A1F47"
  on-surface-variant: "#6F668A"
  outline-variant: "#EADFF7"
  error: "#E5484D"
typography:
  headline-lg:
    fontFamily: Fredoka
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
  headline-md:
    fontFamily: Fredoka
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
  body-md:
    fontFamily: Nunito
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Nunito
    fontSize: 14px
    fontWeight: 800
    lineHeight: 1.2
rounded:
  sm: 10px
  md: 16px
  lg: 24px
  full: 9999px
spacing:
  xs: 6px
  sm: 10px
  md: 20px
  lg: 32px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 16px
  button-secondary:
    backgroundColor: "{colors.outline-variant}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
  card:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  input-field:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 14px
  chip:
    rounded: "{rounded.full}"
---

## Overview

A box of fruit gummies, tipped out on a kitchen table. Gumdrop is for everyday consumer apps that want to feel
like a treat: chunky, squishy, bright, and impossible to be intimidated by. The voice is a cheerful friend who
keeps it short, uses plain words and is allowed one exclamation mark per screen.

## Colors

- **Primary (#6C3BF5):** Grape. Buttons, links, selected states, anything you can poke.
- **Secondary (#FF6FB5):** Bubblegum, for badges and little moments of delight.
- **Tertiary (#FFC93C):** Lemon, for highlights and ratings.
- **Surface (#FFF7EE):** Vanilla cream, the background of every screen.
- **Surface container (#FFFFFF):** White, for the cards that sit on the cream.
- **On surface (#2A1F47):** Deep plum for text; softer than black.
- **On surface variant (#6F668A):** Dusty plum for captions and helper text.

## Typography

**Fredoka** for headlines: round, heavy and friendly, like lettering on a sweet wrapper. **Nunito** for
everything else, with extra-bold labels on buttons so they read as solid objects.

## Layout

Everything lives in a card. Related content is grouped into big white rounded cards with 20px of padding,
stacked with generous gaps on the cream background, so each card reads as one gummy.

## Elevation & Depth

Cards float. Each one casts a soft, wide, slightly purple drop shadow, as if it were a squishy object resting
just above the table. No borders; the shadow does the work.

## Shapes

Round everything. Cards at 24px, inputs at 16px, and buttons and chips are full pills.

## Components

- **Buttons:** Grape pills with a bold white label. Secondary buttons are pale lilac pills with a grape label.
- **Cards:** White, 24px corners, soft shadow.
- **Inputs:** White, 16px corners.

## Do's and Don'ts

- Do use photos generously: big, colourful, full-bleed inside their cards.
- Do use friendly rounded icons next to titles.
- Don't use sharp corners or hairline borders.
- Don't write more than two sentences in a row.
