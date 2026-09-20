# Cross-domain IA sample sweep

Recorded on September 20, 2026. Suite: `2026-09-20T18-16-13-252Z`.

The source corpus is **all 30 sentences in `src/probe/custom.ts`**, imported directly through its
exported `PROMPTS`. Its existing custom-component truth labels are never sent to the IA planner or
auditor. Importing the corpus does not execute the original custom-component probe.

[Open the comparison](http://127.0.0.1:5174/samples#2026-09-20T18-16-13-252Z).
The table defaults to the baseline and final responsibility vocabulary; intermediate experiments
can be shown. Every cell links to the full map, scope choices, raw questions, distributions and
journey critiques. Completed recordings and source snapshots were retained, not overwritten.
The observer link requires the local server and this suite's recordings in `.cache`; those runtime
artifacts are not checked into Git. The results below are the permanent repository record.

## Method and limits

These are **prompt-only IA tests**, not rendered app journeys. A small JEV plan selects the
first screen's archetype and custom interaction. Code creates a declared first-screen planning
anchor with a local activity and a return to Home. Each refinement reuses that identical seed
plan. A refinement may improve the planned anchor's activities; it does not claim to modify or
inspect a saved rendered mock. The saved podcast mock is tested separately for immutable reuse.
There are no Gemini, image-generation, Firestore writes or navigation-model calls.

We ran the content-oriented baseline and four responsibility-vocabulary iterations on every
prompt. Their in-loop critique wording evolved, so their raw pass rates are **not a controlled
quality comparison**. Instead, the baseline and final maps also received the same independent
four-question audit, without implementation names, prior critic answers or custom-component
truth labels in its state. It judges requested-task support, surrounding-app scope, domain fit
and first-screen identity. This is another JEV judgment, not human ground truth. One run per
prompt/variant does not establish repeatability or calibration.

## Results

| Check | Content-oriented baseline | Final responsibilities (`neutral-v4`) |
| --- | ---: | ---: |
| All 30 inputs executed | 30/30 | 30/30 |
| Structurally closed maps | 30/30 | 30/30 |
| Fixed-audit requested task supported | 5/30 | 12/30 |
| Fixed-audit surrounding app adequate | 15/30 | 22/30 |
| Fixed-audit responsibilities fit the domain | 18/30 | 26/30 |
| Fixed-audit first-screen identity retained | 30/30 | 30/30 |
| All four fixed-audit checks passed | 3/30 | 11/30 |

Final-map construction and in-loop critique took **261–496 ms per prompt (median 356 ms)**,
using two decision calls per prompt, after reusing its initial seed plan. These times exclude
seed classification and the separate fixed-rubric audit. The baseline's median of 473 ms includes
its initial classification request, so it is not an apples-to-apples speed comparison. Three
independent prompts ran concurrently. All 150 map experiments and 60 fixed audits used JEV only.

## What changed

`WHOLE_CANDIDATES` now lives in `src/server/ia/roles.ts`, re-exported from `whole.ts`. It describes
responsibilities: explore, inspect details, choose, operate, monitor, history, edit, review,
outcome, conversation, preferences and help. The old media-oriented catalog remains explicitly
named `LEGACY_CONTENT_CANDIDATES` for reproducible earlier probes; it is not the new default.

- A role is not automatically a new screen. Compatible roles can reuse the same first-screen
  identity. A timer can observe and operate without producing another timer page.
- Responsibilities outside the first screen can be included for the surrounding app. An app's
  Settings page does not make its entire product a settings editor.
- Local activities are independent choices: a screen can collect input and submit it, or show
  state and offer controls. A single primary verb no longer excludes compatible actions.
- Workflow templates distinguish inspection, selection, operation, monitoring, communication,
  configuration and transactions. Historical records are not assumed to be playable media.
- Review/result stages belong to transactional workflows rather than every editable tool.
  Drafts retain an edit activity; review has an explicit commit to a result. Outcome screens
  require a preceding task rather than appearing as arbitrary standalone receipts.
- The original requested task is always critiqued and cannot be pruned to manufacture a pass.
  Role compatibility checks do not turn an invalid first-screen alias into an invented screen.
- Observed saved mocks remain immutable; richer activities are added only to explicitly planned
  prompt anchors. The saved Settings gear and Home-return regressions still pass 3/3.

The default `probe:ia:whole` now uses the responsibility planner. The previous content-template
planner is retained for the baseline and its existing recordings.

## What remains unresolved semantically

Closure is not task correctness: **19/30 final maps still failed at least one fixed-audit check**.
In particular, a generic “Choose an option” does not fully describe how a seat, map marker, period
calendar date or record selection advances the user's task. A form can have the right review/result
links while still underspecifying the actual interaction. The model can also overexpand a focused
tool or underrepresent the main work behind a product's settings page.

The vocabulary is now more domain-neutral, but it is still a finite experimental grammar. It has
one canonical slot per separate role, not a full `responsibility × subject × task stage` model.
For example, distinct person-details and booking-details destinations could need separate instances
of the same role. The role-alias compatibility rules are heuristics, and the domain audit's remaining
failures are preserved rather than presented as passing cases. No per-sentence production branches
were added to make this corpus pass.

The next experiment should bind each responsibility to a subject and task stage, with an explicit
consequence for each action. That would let two distinct detail screens coexist while still reusing
the same destination when two paths mean the same thing. Keep the same audit to assess that change;
this is a proposed direction, not an implemented result.

## Validation

- `npm run typecheck` passed.
- `node --import tsx --test src/server/ia/*.test.ts src/probe/journey-observer.test.ts src/probe/saved-journey.test.ts`
  passed all 26 tests.
- Browser checks covered all 30 comparison rows, intermediate variants, fixed-audit counts, map links,
  raw audit details, planned-anchor labels, saved-mock labels and mobile overflow.
- Saved podcast regression `2026-09-20T18-30-46-691Z-09d55c89` passed all three reuse checks:
  Settings gear stays on mock 1, Home uses held-out mock 4, and Home → Settings returns to mock 1.
  Its global coverage critique still reports a conflict; reuse passing does not imply semantic adequacy.

## Every source sentence

The last column lists the final **same-rubric audit** findings, separate from structural closure.

| # | Prompt | Baseline destinations | Final destinations | Final audit findings |
| ---: | --- | ---: | ---: | --- |
| 1 | Pomodoro timer | 2 | 4 | All four checks passed |
| 2 | Pick your seats for a concert at the Royal Albert Hall | 7 | 7 | task: missing; surrounding: missing |
| 3 | Find coffee shops near me on a map | 2 | 4 | task: missing; surrounding: missing; domain: unrelated |
| 4 | Piano practice app: play notes on a keyboard | 5 | 6 | task: missing |
| 5 | Chess puzzle of the day | 7 | 3 | task: missing |
| 6 | Floor plan of my apartment showing which smart lights are on | 2 | 6 | All four checks passed |
| 7 | Guitar tuner | 2 | 5 | task: missing |
| 8 | Live delivery tracking: where is my courier right now | 2 | 5 | task: missing |
| 9 | Colour picker for a paint app | 2 | 3 | task: missing; surrounding: missing |
| 10 | Stock price chart for AAPL over the last year | 5 | 3 | task: missing; surrounding: missing |
| 11 | Sleep stages from last night | 2 | 3 | All four checks passed |
| 12 | Thermostat control for the living room | 2 | 5 | All four checks passed |
| 13 | Choose a table at the restaurant | 2 | 3 | task: missing |
| 14 | Month calendar of my cycle for a period tracker | 3 | 9 | task: missing; surrounding: missing; domain: unrelated |
| 15 | Compass | 2 | 5 | All four checks passed |
| 16 | Find a dog walker: nearby walkers with ratings | 8 | 9 | All four checks passed |
| 17 | Home energy dashboard showing today's usage | 2 | 4 | All four checks passed |
| 18 | Settings screen for a podcast app | 11 | 7 | task: missing; surrounding: missing; domain: unrelated |
| 19 | Checkout for a sneaker store, with order summary | 2 | 7 | task: missing; surrounding: missing; domain: unrelated |
| 20 | Sign-up form for a weekend pottery workshop | 2 | 5 | task: missing |
| 21 | Recipe page for sourdough bread | 8 | 4 | All four checks passed |
| 22 | Confirm deleting my account | 3 | 4 | surrounding: missing |
| 23 | Kubernetes cluster health for on-call engineers | 2 | 5 | All four checks passed |
| 24 | Bedtime story picker for a kids' reading app | 8 | 5 | task: missing |
| 25 | Send $50 to Alex | 2 | 5 | task: missing |
| 26 | Inbox for a team chat app | 9 | 9 | task: missing |
| 27 | Tell me about the Golden Gate Bridge | 2 | 2 | All four checks passed |
| 28 | Pick a movie for family night | 7 | 6 | task: missing |
| 29 | Order history for a grocery delivery app | 9 | 4 | task: missing |
| 30 | Profile page for a freelance illustrator | 2 | 3 | All four checks passed |

## Reproduce

```sh
npm run observe:journeys
npm run probe:ia:samples -- --variant=baseline
# Use the printed suite ID. Existing variants are never overwritten.
npm run probe:ia:samples -- --variant=neutral --suite=<suite-id>
npm run probe:ia:samples:audit -- --suite=<suite-id> --variant=baseline
npm run probe:ia:samples:audit -- --suite=<suite-id> --variant=neutral
```

The sweep report is `.cache/ia-suites/<suite-id>/report.json`. Source hashes and snapshots accompany
each variant. Map recordings live in `.cache/journeys`; the fixed audit appends its exact request and
answer and keeps its timing separate from construction timing. Retrying an already audited variant
skips completed audit rows. New map variants require a new name or a new suite; completed maps are
not silently replaced. Retrospective source snapshots were not added for files that did not exist
when the baseline was run; the baseline's own manifest lists exactly what was captured.
