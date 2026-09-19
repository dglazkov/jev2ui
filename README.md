# jev2ui

A design tool for developers: describe the screen you want, get a mock of it, painted by your
[DESIGN.md](https://github.com/google-labs-code/design.md).

Under it is an experiment: render [A2UI](https://github.com/a2ui-project/a2ui) from a text prompt using
[TypeSafe's Jev](https://docs.typesafe.ai/) for the decisions and a small Gemini model for the words.
Jev is a decision model. It cannot generate text or JSON; it answers yes/no (Noul), pick-one (Choice)
and rating (Score) questions with calibrated probabilities, many at once, in roughly 100–300 ms.

> **Jev decides, Gemini writes, code assembles, a DESIGN.md paints.**

```sh
npm install
npm run dev        # http://localhost:5173
```

Type a description ("Checkout for a sneaker store, with order summary"), pick a design, and the mock appears
in a phone, tablet or desktop frame in about a second and a half. Every decision behind it is listed in the
trace, with its probability. Copy the A2UI messages, the theme as CSS variables, or the DESIGN.md.

## Rendering strategy: the mock is painted by a DESIGN.md

A DESIGN.md is a design system in one file: design tokens in YAML front matter, then prose that says what the
tokens are for. Its [philosophy](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md) is that
the prose matters more than the values. The mock pipeline takes both halves seriously, and gives each to the
part of the system that can use it.

1. **Tokens are parsed by the format's own linter** (`@google/design.md`), which resolves references and
   reports problems (broken references, contrast failures). Findings show up next to the editor.
2. **Jev reads the prose for what tokens cannot say** (`src/server/design-md.ts`). Which colour is the page and
   which is the text? In one file `primary` is the accent; in the bundled Broadsheet it is "press ink, used for
   all headlines and body text", and only the prose says so. Each role is a Choice whose options are the file's
   own token names. Depth (shadows, outlines or tonal layers) has no token at all, so that is a Choice too.
   Code keeps the last word: a component token (`button-primary.backgroundColor`) or a conventional name
   (`on-surface`) settles a role without asking, and a pick that fails a contrast check is thrown out in favour
   of the next in Jev's ranking. One request, about 200 ms, once per file.
3. **Code maps tokens to paint** (`src/server/theme.ts`). The A2UI renderer keeps components in shadow roots
   and exposes `--a2ui-*` custom properties, so a theme is about 45 of those plus the fonts to load. The theme
   is applied in the browser, so switching or editing the design re-skins the mock without regenerating it.
4. **The design changes structure, not only paint.** A specific reference brings its constraints for free: a
   newspaper has no pictograms and no cards, an instrument panel has no photographs. Jev answers three
   yes/no questions about the file, and the answers overrule the screen plan: the header icon goes, list
   items become rows parted by rules, the hero picture is dropped. The trace says when this happens.
5. **The Overview gives the writers a voice.** Gemini never sees tokens or A2UI, but it is shown the brand
   paragraph. The same dog-walker screen is "Dog Walkers — Happy pups nearby ready for a stroll!" in Gumdrop
   and "Canine Conductors — A classified register of trusted walking companions" in Broadsheet.

Three designs are bundled in `designs/` (Broadsheet, Gumdrop, Night Shift). Paste your project's own into the
editor; it is kept in local storage.

### No DESIGN.md? Jev mixes one, with Scores

Jev cannot write `#6C3BF5`. But a colour in OKLCH is three numbers, and Jev can rate. A Score is an expected
value over an ordered rubric, so it lands *between* the levels: "how vivid should the accent be?" answered
2.55 of 4 is a chroma of 0.183. In `src/server/design-mix.ts`, one request of 11 questions about the brief
becomes a complete design:

| Question | Primitive | Becomes |
| --- | --- | --- |
| accent hue | Choice of 12 named hues | hue angle: the circular mean of the winner and its neighbours, weighted by probability (a rubric has two ends and a hue circle has none, so this one is not a Score) |
| accent vividness, accent lightness | Score | OKLCH chroma and lightness, reduced into the sRGB gamut |
| warmth of neutrals | Score | how far backgrounds and greys lean to cream or steel |
| roundness, whitespace | Score | the radius scale; the spacing scale and body size |
| dark interface? photographs? cards? | Noul | palette polarity; structure |
| typefaces, depth | Choice | one of nine Google Fonts pairings; shadow, outline or tonal |

"Plant care reminders for a gardening app" comes out green (p = 1.00), cream, humanist and softly rounded;
"Kubernetes cluster health for on-call engineers" comes out dark, steel, square, packed and monospaced;
"Bedtime story picker for a kids' reading app" comes out dark, pastel violet and round. The result is written
out as an ordinary DESIGN.md, with prose, and takes the same path as a hand-written one. It shows up in the
editor; edit it, or copy it into your project as a starting point.

Hue is the weak dial. When the brief gives no cue Jev's top hue sits at p ≈ 0.3–0.5 and the pick is
arguable (a luxury watch boutique got violet). Naming a colour in the prompt settles it.

### The mock pipeline

It is the sections pipeline below (`src/server/hybrid.ts`, `runMock`) with a design alongside:

- **t = 0, in parallel:** Jev plans the screen; Jev reads the DESIGN.md (or mixes one); Gemini starts the
  header, already in the brand's voice, because parsing the Overview needs no model.
- **~200 ms:** the design overrules the plan where they disagree; the skeleton and the theme are sent.
- Then content streams in as before. Two things differ for a mock. Fields carry no validation, so an untouched
  form is not covered in errors. And buttons wait for the form's submit label (it arrives early in the form's
  stream) so that the actions writer's habit of repeating it can be dropped in code.

`npm run eval -- --only mock` over 13 prompts: 13 of 13 valid A2UI with a mixed design and with Broadsheet,
first components at 123–278 ms, complete in 1.0–2.0 s. `npm run probe:design` prints how Jev reads each
bundled design (and any path you pass, such as the examples in the DESIGN.md repository);
`npm run probe:design -- --mix "a brief"` prints a mix.

## The pipelines underneath

The earlier experiment is still here, at [/compare.html](http://localhost:5173/compare.html).
Three pipelines run side by side in the app:

- **Jobs** asks Jev only about the person (where they are in getting what they want, what done looks like,
  stakes, worries, what they will choose on) and lets rules in code pick the screen pattern.
- **Sections** asks Jev about the screen (which sections, which layouts).
- **Baseline** has Gemini write A2UI directly.

## Jobs pipeline

The premise, tested in [docs/jtbd-probe.md](docs/jtbd-probe.md): Jev is good at reading a person's situation
from a request and weak at design judgement, so ask it about the job and keep the design knowledge in code.

1. **t = 0, in parallel.** Jev answers about 21 questions about the person in one request
   (`src/server/job-profile.ts`). Gemini starts both possible openings, a header and a verdict; the loser is
   cancelled.
2. **Code picks a pattern** from the profile (`src/server/job-patterns.ts`), and says why in the trace:

   | Job                                                  | Pattern                                                  |
   | ---------------------------------------------------- | -------------------------------------------------------- |
   | decided, everything stated ("Send $50 to Alex")      | confirm: what will happen, consequence, two ways out     |
   | decided, details missing; or wants settings changed  | form, asking only for what is missing                    |
   | checking on something, or about to say yes or no     | answer: verdict first, then evidence or records          |
   | weighing a few, or wants one pick from a handful     | compare: cards side by side, attributes aligned          |
   | looking around a large set                           | browse: a list to scan                                   |
   | wants to understand one subject                      | article                                                  |
   | mid-task                                             | guide: steps; terser and larger when urgent              |

   Stage is the strongest signal but is overruled when other answers contradict it: "How do I make sourdough
   starter?" reads as committing, but the person will be reading and done means a finished task, so it gets
   a guide.
3. **The rest of the profile shapes the pattern.** Irreversible stakes make the safe way out the emphasised
   button; while deciding, neither is. A worry (cost, commitment, loss, doing it wrong, safety) adds one line
   of reassurance written for that worry. Selection criteria choose which fields Gemini writes for each
   option, and the strongest becomes the card's headline attribute ("Tonight 7:15 pm" for restaurants
   *tonight*). Attention picks tiles or rows. When Jev is split between two jobs, the screen serves the
   likelier and offers the other as a button.
4. **Gemini writes each part**, briefed with the person's situation in words. Parts are written in parallel,
   except that evidence waits for the verdict and is shown it, so the two cannot disagree.

## Sections pipeline

In both Jev pipelines structure never waits for text.

1. **t = 0, in parallel.** Jev plans the surface from the prompt alone (one request, ~15 parallel
   questions): the screen's purpose, which sections it has (prose, media, facts, steps, collection, form,
   actions), header icon, card or page, facts as tiles or rows, list direction, pictures and buttons on
   list items. At the same moment Gemini is asked for the header text, which every screen needs.
2. **Skeleton.** When the plan lands, code emits `createSurface` and the whole component tree. Every
   component binds to a data path (lists use A2UI templates); the form and the actions row start as empty
   shells.
3. **Gemini writes content only, one request per section, all in parallel.** It never sees A2UI. Each
   stream is partially parsed and forwarded as `updateDataModel` for its own corner of the data model.
4. **The form grows field by field.** The moment a field is complete in the stream, Jev is asked for its
   input control, required and email checks (one small request per field), and the field is attached as
   soon as the fields before it are.
5. **Buttons attach as they stream.** Once all are known, Jev picks the primary one and that single button
   is re-issued.

With `SPECULATE=1`, step 1 also starts a writer for every possible section and cancels the ones the plan
leaves out. Jev answers well inside Gemini's time to first token, so the cancelled requests have produced
nothing. This removes the plan's latency from all text, at the price of eight Gemini requests per run,
which a free-tier key (15 requests/minute) cannot sustain.

Code owns every structural rule. Section answers are independent, so they are combined with the purpose:
sections the purpose expects are kept at p ≥ 0.5, extras need p ≥ 0.8. Widget choice is a
constraint-aware argmax: code walks Jev's ranking until it reaches a control the content can back (a
choice picker needs options, a slider needs min and max).

The baseline for comparison asks the same Gemini model to write the A2UI messages directly, one shot, with
a catalog summary in the system prompt and no repair loop.

## Run it

Requires Node 20+ and a `.env` with `GEMINI_API_KEY` and `JEV_API_KEY`.

```sh
npm install
npm run dev        # http://localhost:5173 is the design tool; /compare.html has the pipelines side by side
npm run eval       # comparison table over the built-in prompts, all four pipelines
npm run eval -- "Book a haircut" -v   # one prompt, printing decisions and messages
```

`GEMINI_MODEL` (default `gemini-3.5-flash-lite`) and `JEV_MODEL` (default `jev-latest`) can be overridden
in `.env`. A hybrid run makes one Gemini request per section, so on a free-tier key (15 requests/minute)
run the eval with `GEMINI_RPM=15` to have it pace itself.

## Results so far

One run of `npm run eval` (11 prompts, `gemini-3.5-flash-lite`, `jev-1.13.0`, a paid-tier Gemini key).
"First text" is the moment the client has both a component tree and some text to show in it. Validity means
every message passes the `@a2ui/web_core` v0.9 schemas, every component passes its catalog schema, and all
child references resolve.

|                          | Jobs          | Sections      | Baseline       |
| ------------------------ | ------------- | ------------- | -------------- |
| First components sent    | 115–298 ms    | 92–138 ms     | 2.8–6.7 s      |
| First text               | 568–774 ms    | 547–726 ms    | 2.8–6.7 s      |
| Complete                 | 1.1–1.7 s     | 0.8–1.7 s     | 2.8–6.7 s      |
| Gemini output tokens     | 116–294       | 101–341       | 1,031–2,733    |
| Jev input tokens         | 2,500–6,500   | 2,200–5,500   | —              |
| Valid A2UI               | 11 / 11       | 11 / 11       | 10 / 11        |

The jobs profile is a slightly larger Jev request than the sections plan, which shows in first components.
Whether job-driven screens are *better* screens is a judgement the table cannot make; open the app and
compare.

The floor for both Jev pipelines is Gemini's time to first token (about 0.5 s on this key, about 1 s on a free-tier key):
the header is requested at t = 0, so first text lands one Gemini round trip after the prompt. Forms finish
last, because fields arrive serially in one stream and each needs a Jev request (6 Jev requests for a
five-field form).

`SPECULATE=1` was measured on the same prompts: completion improved by about 10% (mean 1.31 s against
1.47 s), first text did not change (the header is already requested at t = 0), and the skeleton was
sometimes later (up to 628 ms) because eight simultaneous request start-ups compete with the Jev call. It
stays off by default.

The baseline fails validation on one or two of the eight prompts in every run so far, differently each time
(an invented `Text` variant, an unknown icon name, `ChoicePicker` options or input values bound the wrong
way). This is a small sample and the baseline prompt is hand-written, so treat the numbers as a first look
rather than a benchmark.

## Known limits

- The Jev pipelines can only produce what their patterns or sections can express. The baseline is freer, and when it
  is valid it is often richer.
- Pictures are seeded placeholders from picsum.photos in both pipelines; they are unrelated to the subject.
- Sections are written by separate requests that do not see each other, so they can disagree on invented
  details. Each is told which parts the screen has and to stay within its own.
- Jev reads questions literally and answers them independently. Expect to tune question wording and
  thresholds; `src/server/plan.ts` and `src/server/design.ts` hold all of it.
- Button and form events are only logged in the trace; nothing handles them.
- A theme can only say what the renderer's variables can carry: no letter-spacing or uppercase labels, one
  heading face, one gap for every column. Hover and pressed variants are mostly ignored.
- The mock's structure does not know the device. Fact tiles are two to a row everywhere so that they fit a phone.

## Layout

```
designs/                    bundled DESIGN.md files
src/server/design-md.ts     parse a DESIGN.md; Jev reads its prose for colour roles, depth and constraints
src/server/design-mix.ts    no DESIGN.md: Jev's Scores become OKLCH colours, radii and spacing, written out as one
src/server/design-source.ts a supplied or mixed design, worked out once and reused
src/server/theme.ts         tokens and the reading, as --a2ui-* variables
src/server/job-profile.ts   questions about the person, and the profile read from the answers
src/server/job-patterns.ts  rules from job to pattern; each pattern's parts and component tree
src/server/jobs.ts          the jobs pipeline
src/server/content.ts   per-part Gemini streams into the data model (shared)
src/server/form.ts      a form that grows field by field (shared)
src/server/plan.ts      Jev questions from the prompt, section grammar, Gemini content schema
src/server/design.ts    Jev questions from the content (per-field controls, primary action)
src/server/emit.ts      deterministic A2UI component builders
src/server/hybrid.ts    the sections pipeline, and the mock pipeline built on it
src/server/baseline.ts  Gemini writing A2UI directly
src/server/validate.ts  schema and reference validation
src/server/run.ts       event stream, stats, end-of-run validation
src/web/app.ts          the design tool; compare.ts is the side-by-side page (both use @a2ui/lit's v0.9 renderer)
src/eval.ts             CLI comparison
src/probe/jtbd.ts       can Jev see jobs? (docs/jtbd-probe.md)
src/probe/design.ts     how does Jev read a DESIGN.md, and what does it mix?
```
