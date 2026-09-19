# Can Jev read a change?

Probe run 2026-09-19 with `jev-latest`. Reproduce with `npm run probe:change` (add `-- -v` for every message's
answers). It is step 0 of [chat-and-turns.md](chat-and-turns.md): the chat leans on Jev turning "make it
lighter" into decisions about what changes, with everything else left where it is.

## Setup

One Jev request per message: a Choice for the kind of turn (new app, new screen, look, structure, words,
arrange, question), a relative Score for each of the five paint dials (*much less … as it is … much more*),
and a Noul gate for each paint choice (hue, dark, typefaces, elevation, pictures, cards): "does the message ask
to change this?". The state is the app, how it looks now in a sentence, the screen showing, and the message.

47 messages, each asked of two apps that look nothing alike (a warm, round, light bakery app; a dark, square,
monospaced server dashboard): 94 requests. 43 messages carry hand labels written before the first run; four
("make it lighter", "make it more fancy", "make it pop", "it looks boring") are open, and only reported. No
Gemini, no UI.

Cost: about 2,500 input tokens and a median of about 150 ms per message.

## Findings

**The kind of turn is read well: 82/86.** Words 8/8, structure 8/8, new screen 4/4, new app 4/4, arrange 4/4,
look 52/54. Confidence is 0.99 when right and 0.86 when wrong. The misses:

- "No cards, let the content flow like a page" is *structure* to Jev (0.99). It is, to anyone who has not read
  `design-mix.ts`, where cards happen to be paint. The cards gate opened all the same (both apps), so nothing is
  lost **as long as the gates are asked whatever the kind of turn is**, and not only when it is *look*.
- "Why is this a list?" is *structure* (0.61 and 0.85), with *question* second. Jev hears a complaint. "What
  font is that?" was read as a question both times. A question that implies a change will be routed as the
  change; that seems the right side to err on.

**A message that is not about the look moves nothing.** Over the 32 requests about words, structure, screens,
apps, position and questions, the mean movement of a dial is 0.010 on a scale where "a touch" is 0.67, and
gates stayed shut 491 times out of 494 over the whole run. This is the property the design needs: "rename the
app to Fern" cannot repaint it.

**Named dials move the right way, and by sensible amounts.** 36/40 by at least 0.3; all 40 in the right
direction. The four that fell short are all mood messages ("more playful": vivid +0.14 to +0.29, round
+0.15), where the typeface gate opened instead (see below).

**"A touch", plainly, "much" come out in order** in all six ladders, on both apps: lighter 0.68 < 1.1 < 2.0,
rounder 0.68 < 1.1 < 1.97. So the expected score gives three usable step sizes, and they are nearly the same
for the two apps: the step does not depend on where the dial stands.

**Dials not named mostly stay: 371/390 within 0.3,** mean 0.051, median 0. Most of what moved is Jev being
right and the labels thin:

- "much lighter, almost pastel" also lowers saturation (−1.6); a pastel is less saturated.
- "deeper and richer" also raises saturation (+1.1); that is what richer means.
- "make it calmer" also adds whitespace (+0.8); "more serious and corporate" also cools the greys (−0.8).

What is left that looks like error is small: "make the colours really pop" deepens the accent (−0.8, bakery
only), and dark mode or a white background cools the bakery's cream by half a step.

**Two gates opened that should not have,** both understandable: "warmer backgrounds, more like paper" opened
*dark* on the dark app (0.86: paper is light), and "no cards" opened *elevation* (0.65).

**The open messages behave the way ask-or-act needs.**

- "Make it lighter" moves lightness (+1.0) *and* whitespace (+0.3 to +0.7), and on the dark app also opens the
  dark gate (0.95). Three readings, all visible in one answer. This is the *torn* case.
- "Make it more fancy" moves no dial and opens the typeface gate (0.7). "It looks boring" moves nothing and
  opens nothing: the *nothing mapped* case, which goes to Gemini to ask.
- "Make it pop" is vividness (+1.1), plainly.

## Wording, again

The first run used five-level rubrics and looser questions. Three things were reworded once, labels untouched:

- **Seven levels, not five.** With two steps a side, "a little lighter" and "lighter" both landed on exactly
  1.00. With *a touch · clearly · much* they separate.
- **The vividness dial said "the colours".** Jev took that to cover photographs ("make the photos black and
  white": −2.0) and lightness ("lighter": −1.0). Asked about "how saturated the accent colour is … not about
  photographs, and not about how light or dark anything is", both went away. Mean drift on look messages fell
  from 0.136 to 0.080.
- **The typeface gate did not open for moods** (0.16 to 0.24 for "more playful", "more serious"). Saying in the
  criteria that a change of mood is carried by lettering opened it (22/22 gates), and "more fancy" now has
  somewhere to go. The price: once the gate takes the mood, the dials move less for mood words.

## What this means for the build

- The bet holds well enough to build slice 1 on. Relative Scores are stable where they need to be and sized
  where they need to be.
- Ask the gates and dials on every turn, not only when the turn is *look*; the kind of turn decides what else
  runs (writers, a new screen), not whether paint is listened to.
- A threshold of about 0.3 on a dial separates "moved" from "stayed". Below it, ignore.
- *Torn* can be read straight off the answer: more than one dial or gate moved for a message that names none
  of them. No separate question is needed to detect it.
- Moods are the weak spot. "Playful" and "corporate" are carried mostly by the typeface and barely by the
  dials. When a mood gate opens, the choice behind it has to be asked again with the message in its context,
  and that second step is not probed here.
- Not probed: structure gates (add, remove, keep per block), the per-part gate for words, messages that refer
  to earlier turns ("a bit more", "undo that"), and how the answers hold up when `design` is a real DESIGN.md
  and not a sentence.
