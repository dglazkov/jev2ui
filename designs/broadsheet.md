---
version: alpha
name: Broadsheet
description: The front page of a weekend newspaper, printed on warm stock.
colors:
  primary: "#1B1B1A"
  secondary: "#6A6E75"
  tertiary: "#A93A26"
  neutral: "#F6F2EA"
  sheet: "#FFFDF8"
  rule: "#D8D0C0"
typography:
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Playfair Display
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: Source Serif 4
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  label-md:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.08em
rounded:
  none: 0px
  sm: 2px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 32px
  xl: 56px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.sheet}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: 14px
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
  input-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 10px
---

## Overview

The front page of a weekend broadsheet, printed on warm, slightly toothy stock. Everything on the page has
earned its column inches. The voice is an editor's: measured, exact, a little dry, never breathless. Hierarchy
comes from type size and from thin rules between stories, the way a compositor would do it, and never from
boxes, glows or colour fills.

## Colors

Ink on paper, with one spot colour held back for the thing that matters.

- **Primary (#1B1B1A):** Press ink. Used for all headlines and body text.
- **Secondary (#6A6E75):** Pencil grey, for bylines, captions, datelines and other metadata.
- **Tertiary (#A93A26):** Masthead red. The only interactive colour: primary buttons and links, nothing else.
- **Neutral (#F6F2EA):** Newsprint. The background of every page.
- **Sheet (#FFFDF8):** A brighter stock for inputs and the rare inset panel that must sit above the page.
- **Rule (#D8D0C0):** The colour of hairlines, column rules and field borders.

## Typography

**Playfair Display** sets the headlines: high contrast, confident, unmistakably a newspaper. **Source Serif 4**
carries body text at a generous 17px for long reading. **IBM Plex Mono**, small and letter-spaced, is for
labels, datelines and figures, like a wire-service slug.

## Layout

A single column on phones, with wide margins and a lot of air between stories. Related items are separated by
a hairline rule and whitespace. Content sits directly on the page; it is not wrapped in cards or panels.

## Elevation & Depth

There is no elevation. Paper is flat: no shadows anywhere. Where an edge is needed, it is a 1px rule in the
rule colour.

## Shapes

Square corners throughout. A 2px radius is tolerated on small chips; buttons, inputs and images are cut square,
like a printed block.

## Components

- **Buttons:** Masthead red, square, with a monospaced label. One per screen. Secondary actions are plain
  paper-coloured buttons with an ink label and a hairline border.
- **Inputs:** Bright stock with a hairline border. Labels sit above in the mono face.
- **Lists:** Rows separated by hairline rules, never cards.

## Do's and Don'ts

- Do let one strong photograph lead a story when the subject is visual; print it large, like a lead image.
- Don't use pictograms or icons. A newspaper labels things with words.
- Don't use shadows, gradients or rounded cards.
- Do keep the red for the single most important action.
