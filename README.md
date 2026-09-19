# jev2ui

An experiment: render [A2UI](https://github.com/a2ui-project/a2ui) from a text prompt using
[TypeSafe's Jev](https://docs.typesafe.ai/) for the design decisions and a small Gemini model for the words.

Jev is a decision model. It cannot generate text or JSON; it answers yes/no (Noul), pick-one (Choice)
and rating (Score) questions with calibrated probabilities, many at once, in roughly 100–300 ms. A2UI
already separates structure (`updateComponents`, mostly closed-set choices) from content
(`updateDataModel`). So the work is split the same way:

> **Jev decides, Gemini writes, code assembles.**

## Pipeline

1. **Jev, from the prompt alone** (one request, ~15 parallel questions): the screen's purpose, which
   sections it has (prose, media, facts, steps, collection, form, actions), header icon, card or page,
   facts as tiles or rows, list direction, pictures and buttons on list items.
2. **Skeleton.** Code emits `createSurface` and `updateComponents` right away. Every component binds to a
   data path (lists use A2UI templates), so the layout can ship before any content exists.
3. **Gemini writes content only**, as JSON constrained to a schema built from the chosen sections. It never
   sees A2UI. The stream is partially parsed and forwarded as `updateDataModel` messages as it arrives.
4. **Jev, from the content** (one request): the input control for each form field, required and email
   checks, and which action button is primary.
5. **Completion.** Code emits the form and action components.

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
npm run dev        # http://localhost:5173 — both pipelines side by side, with Jev's decision trace
npm run eval       # comparison table over the built-in prompts
npm run eval -- "Book a haircut" -v   # one prompt, printing decisions and messages
```

`GEMINI_MODEL` (default `gemini-3.5-flash-lite`) and `JEV_MODEL` (default `jev-latest`) can be overridden
in `.env`.

## First results

One run of `npm run eval` (8 prompts, `gemini-3.5-flash-lite`, `jev-1.13.0`). Validity means every message
passes the `@a2ui/web_core` v0.9 schemas, every component passes its catalog schema, and all child
references resolve.

|                          | Hybrid        | Baseline       |
| ------------------------ | ------------- | -------------- |
| First components sent    | 130–333 ms    | 3.3–7.0 s      |
| Complete                 | 1.2–2.5 s     | 3.3–7.0 s      |
| Gemini output tokens     | 116–332       | 1,197–2,491    |
| Jev input tokens         | 2,200–4,900   | —              |
| Valid A2UI               | 8 / 8         | 6 / 8          |

The baseline's failures differ from run to run (an invented `Text` variant, `ChoicePicker` options bound to
a path); two of eight failed in each of the two runs so far. This is a small sample and the baseline prompt
is hand-written, so treat the numbers as a first look rather than a benchmark.

## Known limits

- The hybrid can only produce what its section grammar can express. The baseline is freer, and when it
  is valid it is often richer.
- Pictures are seeded placeholders from picsum.photos in both pipelines; they are unrelated to the subject.
- Jev reads questions literally and answers them independently. Expect to tune question wording and
  thresholds; `src/server/plan.ts` and `src/server/design.ts` hold all of it.
- Button and form events are only logged in the trace; nothing handles them.

## Layout

```
src/server/plan.ts      Jev questions from the prompt, section grammar, Gemini content schema
src/server/design.ts    Jev questions from the content (form controls, primary action)
src/server/emit.ts      deterministic A2UI component builders
src/server/hybrid.ts    the hybrid pipeline
src/server/baseline.ts  Gemini writing A2UI directly
src/server/validate.ts  schema and reference validation
src/server/run.ts       event stream, stats, end-of-run validation
src/web/                Lit app using @a2ui/lit's v0.9 renderer
src/eval.ts             CLI comparison
```
