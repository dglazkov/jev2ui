# Chat: every request is a creation or an edit

Design note, 2026-09-19. It records what was settled in conversation, what is assumed and not yet tested, and
the order to build in. **Step 1 is built** (see "What is built" at the end); the rest is still a plan.

## The idea

A chat column on the left, the app on the right. The person types, and the response to every message is the
thing itself: the first message makes an app, the second changes it, the third changes it again. "Make it
more fancy", "make this lighter", and the tool works out what that means.

Today a mock can be made, made again (↻), repainted (remix, or a DESIGN.md typed by hand) and walked through
by tapping. It cannot be changed. Its layers have different makers, and an edit is a person overruling one of
them:

| Layer | Made by |
|---|---|
| Paint (the DESIGN.md) | Jev's Scores and Choices (`design-mix.ts`), or the person's own file |
| Structure: archetype, blocks, anatomy, per-instance answers | Jev (`mock/plan.ts`, `mock/refine.ts`) |
| Words (the data model) | Gemini, one writer per block |
| Pictures | Jev's pick from the library, or the image model |
| Custom components | Gemini's code, checked in a sandbox (`mock/bake.ts`) |
| The screen graph | code (`mock/link.ts`) |

## The problem, and the bet

Jev cannot write a reply and cannot rewrite anything. A turn has to become decisions.

The naive way is to add the message to the description and ask everything again. That is unstable: every
answer that sat near 0.5 may flip, and the screen being adjusted becomes another screen.

**The bet: ask Jev about the change, not about the state.** For everything Jev already decides, ask what the
message wants done to it.

- **Dials** (chroma, lightness, warmth, corner radius, spacing): a Score with seven levels, *much less ·
  clearly less · a touch less · as it is · a touch more · clearly more · much more*. The expected value is a signed step, so "a touch lighter" and "way lighter"
  differ in size. A dial the message does not mention comes back *as it is*, so nothing drifts. This is the
  Score as a dial again, now a relative one.
- **Choices** (typeface, elevation, hue, dark, list layout, leading, trailing, …): a Noul per question, "does
  the message ask to change this?". Only those that say yes are asked again, with the message in the context.
- **Blocks**: *add · remove · keep* for each block the archetype allows. The tree is rebuilt in code, so it
  stays valid by construction; a writer runs only for a block that was added.
- **Words**: a Noul per part, "does the message concern this text?". Gemini rewrites those parts from the old
  words and the instruction. It still never sees a component.

All of it is one Jev request. A paint-only turn calls no Gemini, and since paint is CSS variables it changes
every screen of the app at once.

**Tested for paint** ([change-probe.md](change-probe.md)): a message that is not about the look moves no dial
(mean 0.01 of a step) and opens no gate; a named dial moves the right way; "a touch", plainly and "much" come
out in order once the rubric has seven levels; "make it lighter" shows all three of its readings in one answer.
Two things learned there change this note: the dials and gates are asked on **every** turn, whatever kind it
is (Jev calls "no cards" structure, and the cards gate opens all the same), and *torn* needs no question of its
own, since it is several things moving for a message that names none. Not tested yet: blocks, words, moods
carried through a re-asked Choice, and messages that lean on earlier turns ("a bit more").

## What kind of turn is this?

Asked first, as a Choice:

- a new app ("now do a recipe app" as the third message is a creation, not an edit)
- a new screen in this app ("add a settings page")
- a change to the paint, which is the whole app's
- a change to this screen, its structure or its words
- something the grammar cannot do

"This" is the screen that is showing. Later, a block the person has clicked can narrow it further; the
selection joins the context of the same questions.

## Ask or act

A chat that asks questions all the time is tiresome, and undo is cheap, so the bias is to act.

- **Cheap and reversible** (paint, a change of layout): act on the likeliest reading. If another reading was
  close, the receipt offers it as a chip ("Took that as brighter. Meant airier?").
- **Expensive and torn** (would run writers, bake, or make a screen again): ask first.
- **Nothing mapped** (every dial *as it is*, no gate open): ask.
- **The first message**: always make something. A vague brief is where Jev's mix is at its best.

Two numbers: a threshold on confidence, and a rough cost for each kind of edit.

### Asking is Gemini's

When a question is needed, Jev has decided that, and Gemini words it. Two cases:

- **Torn.** Gemini is given the message and the readings Jev was torn between, and asks about exactly those.
- **Nothing.** Gemini is given the message and what the tool can change, in plain words, and steers ("I can't
  move it, but I can pin it to the bottom as the screen's action. Want that?").

Gemini returns a question and two or three options, each a label and **a whole instruction** ("Make the
colours brighter"). Choosing one sends that instruction as an ordinary turn, so nothing has to work out what
"the second one" meant. A typed answer is routed with the original message and the question as context.

Each option's instruction is put through Jev's routing before it is shown, in parallel, and those Jev cannot
route are dropped. So every chip does something, and Gemini cannot offer what the tool cannot do.

"Make this screen again with that in mind" is always one of the options. It is the blunt path that always
works, and it costs a run, so it is chosen knowingly and is not a silent default.

Questions from the person ("why is this a list?") go the same way: Gemini answers from the trace.

The list of what the tool can change must be assembled from the criteria strings already in the code
(`ARCHETYPES`, `DIALS`, the blocks), not written by hand, or it will drift from what is true.

## The reply is a receipt

Nothing writes the tool's side of the conversation when something was made or changed. The reply is built in
code from the decisions that moved: "Lightness 0.62 → 0.81 · Type: Grotesk → Didone · Added: hero", with the
trace folded under it and, for paint, the lines of the DESIGN.md that changed.

## The transcript is the app

A turn is something that made or changed the app. Moving around an app that is already made is not a turn:
back, a visit to a screen that exists, a tap that leads to one. That stays view state.

So a turn comes from three places, and the transcript does not care which:

- **typed** into the chat
- **tapped**, when the tap starts a generation (including a stale screen being made again on a visit, and the
  Home that back-from-the-first-screen makes)
- **pressed**: ↻, remix, the DESIGN.md edited by hand (debounced)

```ts
interface Turn {
  id: number;
  source: "typed" | "tap" | "button";
  /** Typed turns only. Joins the app's description. */
  said?: string;
  /** The screen it was about, or made. Absent when it was the whole app's paint. */
  screen?: number;
  outcome:
    | { kind: "made"; screen: number; request: Screen["request"] }
    | { kind: "changed"; pins?: Record<string, string>; dials?: Record<string, number>; rewrote?: string[]; messages: Message[] }
    | { kind: "asked"; question: string; options: Array<{ label: string; instruction: string }> }
    | { kind: "answered"; text: string };
  /** The receipt is drawn from these. */
  decisions: Decision[];
}
```

What follows:

- **A turn names its screen**, because moving about is not recorded and the turn before "make this lighter"
  no longer says what "this" was. The chat shows "on Settings" where a turn's screen differs from the one
  before, and clicking a turn goes to its screen.
- **The app is the fold over its turns.** The design is Jev's mix plus the sum of the `dials`; a remix draws
  again and adds the same offsets.
- **The app's description is everything the person typed, in order.** "It's a bakery called Fern" reaches the
  writers of every later screen, and no model wrote any of it. Taps add nothing to it; their journey already
  carries what the next screen needs.
- **Undo drops the last turn**, and only the last. Undoing a tap removes the screen it made; whatever was
  done to that screen came later and is already undone. If that screen is showing, the view goes back to
  where the tap was. Taking out a turn from the middle is another, harder feature.
- **`pins` and `kept` survive ↻.** A decision the person overruled is pinned on the screen's request, and a
  part whose words they own has its writer skipped, so making a screen again does not undo their edits.
- **Saved apps become version 2** and carry the turns. They stay immutable and named by a hash of what they
  are, which should now be a hash of the turns and not of where the person was standing: today `stack` is in
  the hash, so walking around and saving makes a new id for the same app. Opening someone's link and carrying
  on their chat is a fork.
- **Talk costs no run.** `asked` and `answered` turns are one small Gemini call. A paint-only turn is one Jev
  call and probably should not count as a whole run against the day's allowance either.

## Trouble

- **Screen keys hold labels** (`3:item:Il Corvo Pasta`). Renaming an item orphans the screen behind it, and
  that screen was written from the old data. Keys need to be by position or id before words can be edited.
- **Facts about the whole app make earlier screens stale.** Paint reaches them for nothing; words do not.
  Mark them stale and make them again on a visit, since each costs a run.
- **Outside the grammar.** "Add a map" can go to the custom slot and be baked. "Move the button to the top
  left" cannot be done, because order belongs to the archetype, and gets a steer from Gemini. Free
  rearrangement is refused on purpose: it is where this stops being a tool in which Jev decides.
- **The person's own DESIGN.md.** Paint deltas have to patch token values in their file. The file is parsed,
  so it can be done, but it is a path apart from the mix.

## Order of building

0. **Probe**: can Jev read a change? Done for paint: `src/probe/change.ts`, [change-probe.md](change-probe.md).
   The same probe wants repeating for blocks and words before steps 2 and 3.
1. **The chat column, the transcript as the session, and paint.** Routing with three outcomes (new app, paint,
   ask); paint deltas through relative Scores; receipts; undo. The smallest thing that shows the bet: a
   message becomes decisions about change, the result holds still, and it lands in a few hundred milliseconds
   on every screen.
2. **Words.** The per-part gate, rewriting writers, `kept`, the description that grows, stale screens. Needs
   the keys fixed first.
3. **Structure.** Blocks added and removed, anatomy re-asked behind gates, `pins`.
4. **Later**: click a block to say what "this" is; remix one block from Jev's distribution; another picture;
   bake again with a note.

## What is built (step 1, 2026-09-19)

The chat column, the turns, and paint: `src/shared/turn.ts`, `src/server/change.ts`, `src/server/talk.ts`,
`POST /api/turn`, and `src/web/app.ts` rebuilt around the conversation. Where it differs from the note above:

- **Structure and words act, bluntly.** The note had them wait for steps 2 and 3. Instead a message of either
  kind makes the screen showing again with the message as a note on its description (`notes` on the request,
  which survive ↻). It costs a run and rewrites more than was asked, but "add a search bar" does something today.
  So the blunt path is what these kinds do, and is not offered as an option.
- **A new screen can be asked for in words** (`via.kind = "asked"`), which the note did not mention.
- **Torn is not detected.** Everything that moved is acted on: "make it lighter" lightens the accent and adds
  whitespace, the receipt shows both, and undo takes both back. Offering the runner-up as a chip is not built.
- **A message that may be a question is taken as one** (p ≥ 0.3), because answering is cheap and making is not.
- **Undo keeps what stood before each turn** in the browser, and does not fold over the turns. It is simpler
  and undoes anything, but only for the turns of this sitting: a saved app carries its turns as a record.
- **`pins` exist for the design only** (the choices of the mix). Pins on a screen's plan, and `kept` words, wait
  for steps 2 and 3.
- **The app's description does not yet grow** with what the person says; a note reaches one screen.
- **Your own DESIGN.md cannot be changed by talking**; the tool says so.
- Saved apps are version 2 (turns, and the design's `change`); version 1 opens as before. `stack` is no longer
  part of the id.
