# The graph, written down

A DESIGN.md made paint portable: anyone can bring their own. What decides the *structure* of an apparition
(which questions Jev is asked, how they nest, what code does with the answers) is tables and rules in
`src/server/mock/plan.ts`. Nobody can bring their own of that. This note is about whether they could: a
terse file that holds a decision graph, that anyone can read, and that a reader which knows nothing about
screens can run.

**Since step 5, the tool reads the file.** `grammar/screen.md` is edited by hand and is what the served app
makes screens from; the hand-written tables it was taken from are gone. The other files under `grammar/` are
still written out from code, for the reasons given under "What is still code".

```sh
npm run grammar:export                                  # writes kit.md, paint.md, icons.md, subjects.md from the code
npm run probe:grammar                                   # grammar/screen.md on its own examples, live, and against readPlan
npm run probe:grammar -- grammar/examples/email.md      # any graph
npm run probe:draw -- grammar/examples/email.md "Your one-time sign-in code"   # any graph, drawn; --paint lets pictures be made
node --import tsx --test src/server/grammar/*.test.ts
RECORD=1 node --import tsx --test src/server/grammar/regression.test.ts   # after a change to screen.md that is meant
```

There are two kinds of file. A **graph** (`screen.md`, `paint.md`, `examples/email.md`) is somebody's decisions:
what is asked, how the answers are read, what each part is made of. A **catalog** (`kit.md`) is what a renderer
can draw. A graph names the catalog's patterns; neither contains the other.

## The format

Markdown, because what Jev reads is prose, and the criteria of a question are most of a graph. Each of
Jev's three primitives is a kind of markdown list, and a blockquote is what is asked:

```markdown
### list
> Does the screen show several similar items?

+ Results, products, people, records, line items.          a Noul: `+` and `-` are both bullets in markdown
- The screen is about one thing, or only about settings.

#### custom_size
> If the screen has something drawn specially for it, how much room does that thing need?

- **strip** `3:1` — A thin band across the screen.         a Choice: bullets that open with a bold name;
- **tall** `3:4` — Most of the height of the screen.       the code after the name is what the option yields

## vivid → accent chroma
> How vivid should this product's accent color be?

1. `0.04` Almost grey: dusty, muted, restrained.           a Score: a numbered rubric. A value at every level
5. `0.3` Neon: as vivid as a screen can show.              makes it a dial: 2.7 of 4 falls between two values
```

**Headings nest the way decisions do.** A question under a heading is read only when the heading's answer
is yes; otherwise it has its default (no; or `none`; or else the first option). The heading is the id the
answer comes back under.

**A Choice whose options carry a shape is the kind of thing being made.** The shape is one line: the parts
this kind may have, in the order they come. CAPITALS are always there, a bare name is expected, a `?` is an
extra. That line is all of `order`, `requires`, `expects` and `atLeast`:

```markdown
- **checkout** — Review and commit: a cart, an order summary with totals, payment.
  `banner? custom? list facts form? actions?` at least 2, sticky actions
```

The headings under that Choice are the parts, and a part's question is answered under `has_<part>`. Words
after the shape that are not `at least N` are traits: told to whoever draws the thing, not read by the graph.

**There are no thresholds in the file.** "Expected" and "extra" are tiers; how sure an answer must be for
each is a fact about whoever answers, kept beside the reader (`JEV` in `read.ts`: 0.4, 0.75, and 0.5 for any
other yes; one question probed on its own, `has_custom` at 0.55). gev says 0.00 where Jev says 0.82, so a
number written into a graph would be wrong the moment somebody switched.

**What nesting and tiers cannot say is a rule**, in one flat form, applied in the order written, with its
reason, which is what the person reads in the trace when the rule overrules Jev:

```markdown
## Rules
- when form, no actions — a form's submit button is the screen's call to action
- when archetype is checkout and no form, actions — with no form to submit, it needs a button to commit with
- when item_leading is not thumbnail, list_layout is rows — picture layouts are for things with a look
```

A condition is a part (`list`, `no list`) or an answer (`x is y`, `x is not y`), joined by `and`. There is
no else, no or, no nesting.

**A set of options can live in another file**, and a markdown link is the import:
`among [icons](icons.md)`. A set is a file with options under its title and nothing asked. Names with no
criteria are written as a run of code spans, so 185 symbols are 23 lines.

**A graph carries its own probe.** Examples are things the graph was written to read, each with how it
should come out, in the words rules use. An example with no claim is still something to run.

```markdown
## Examples
- Your one-time sign-in code → kind is verify, code, no hero, no items
- Find a dog walker: nearby walkers with ratings
```

What is read is `{ <name of the graph>: <the example> }`, or `## Examples (key)` names the key.

**A part says what it is made of, once**, and that is two things at the same time: what a writer is asked
for, and where each piece goes in whatever draws the part.

```markdown
### list → collection                                     drawn by the catalog's `collection`

- `heading` as heading, when archetype is not feed — Heading above the list.
- `items` 3–8, as items — The items.                      a list of three to eight
  - `title` as headline — The item's name.                written, and bound to the pattern's `headline` slot
  - `price` as meta, when item_price is yes — Price…      there only when that answer is yes
  - `on` boolean, as on, when item_trailing is switch or checkbox — Whether it is on.
  - `tone` as tone, decided                               bound, but not written: Jev decides it once the words exist
  - `imageUrl` as picture, from library by item_subject else painted else placeholder

#### list_layout → layout                                 the answer turns the pattern's `layout` knob
#### custom_size → ratio                                  …as what it yields: `tall` turns `ratio` to `3:4`
```

A field line is a name in code, then what is said about it (a type, how many, `as` a slot, `optional`, where it
comes from if nobody writes it, `when` it is there), then a dash and what the writer is told. Under a field:
what each element is made of, or `- each — One or two words.` when each is a single value, or
`- when facts_total is yes — The last one is the total.`, which is one more thing to tell the writer, sometimes.
A part that is nothing but a list gives the list its own name (`facts` is 2–8 rows). A heading with fields and
no question is always there (`## header`). A yes or a no can yield a name, for turning a knob that takes one:
`+ \`thumbnail\` Products, articles with a lead image.`

**What nobody writes comes from a chain**, tried in order, that ends in something that cannot fail. This is
where a model other than Jev comes in, and where it is kept from holding anything up:

```markdown
### custom (never padding) → slot
filled from shelf else baked else closed                  a whole part, when what draws it is a slot

  - `imageUrl` as picture, from library by item_subject else painted else placeholder      one field

#### custom_use
- **watch** — It shows something that changes on its own: a timer, a gauge, a tuner.       for Jev
  → Make it run: it moves, counts or updates by itself once started.                      for whoever makes it
```

The names are the catalog's **sources**, and what each is like is said there in a few words the lint reads: a
`set` (the app's shelf, the photo library) is looked in, which means Jev is offered what is there and "none of
these"; a `maker` (`baked`, `painted`; `written` is the one every plain field has without saying so) is a model
that makes one; a `terminal` (`closed`, `placeholder`) needs no model. `by` says which answer names the shelf of
a set to look on. The contract a maker works to is not a new thing to write: it is what the graph already
decided under the part, and what each of those answers means to a maker is the line under the option that
opens with an arrow; a part can have such a line of its own. Criteria are for Jev, arrows are for Gemini. A
knob nothing asks about is set where the pattern is named: `### code → slot with ratio 3:1`.

The lint, from the two files: a source the catalog lacks, `by` on what is not a set, and **a chain that ends in
a set or a maker, which can come up empty**. So no graph that passes can leave a screen waiting on a model.

**What can only be decided once the words exist** (is "Degraded" bad news, is "Auto-download" a switch or a
page) is a question like any other, under its part. Its heading says what it is asked of, and a field says
which question decides it:

```markdown
#### row_control (of each row in rows, within each group in groups)
> `{row}` is a row in the supplied screen and section. Grouped rows can represent content, navigation…
>
> What kind of row is {row}?                              {row} is the element's name where Jev reads it: row_0, row_1

#### stat_news (of each stat in stats with delta)         only of the figures that moved
#### banner_tone (once written)                           once, of the part's words
#### main (among each action in actions)                  one question, whose options are the elements themselves
+ `primary` It is the one.
- `secondary` It is one of the others.

    - `control` as control, decided by row_control
    - `icon` as icon, decided by row_icon, all or none
    - `on` as on, decided by row_on, one where row_control is check
```

A blockquote in two parts, with a bare `>` between, is what Jev reads first and then what it is asked: such a
question is not read under the file's context, which is about the description. There is one request for each
part, or for each element of an outer list (the rows of one group). **A question is asked only if something
that is drawn reads the field it decides**, which is found out from the tree the file makes and not said
anywhere: no badge and no progress bar, no question about tones. Rules can be about the elements, where a bare
name is what was written for one (`when row_control is value and no value, row_control is nav`), and can set
what an answer yields (`when destructive is yes and main is primary, main is danger`). Two things a field can
say are about all of its elements at once: `all or none` (symbols down the edge of a group, because a ragged
edge reads as a mistake) and `one where …` (of the options of one setting, exactly one is chosen: the
likeliest, or the one already known to be). `none` yields nothing, unless the question says over again what
it yields here (`- **none** \`circle\``, under a set read from another file).

**The frame is a pattern too**, and the kinds' question names it: `## archetype → page`. What a kind says after
its parts sets the frame's knobs (`sticky actions`, `leading close`, `opening outcome`, `dialog`, `intro`; a word
alone is `yes`), the answers at the top of the graph turn the rest (`## top_level → navigation`,
`## person → opening` with `+ \`person\`` and `- \`title\``, `## app_bar_action → action`,
`## screen_icon → symbol`), the kinds' heading can fix a knob for every kind (`## kind → page with leading
none, intro yes`), and what is always written fills its slots (`## header` with `as title`, `as subtitle`,
`as portrait`; the navigation with `as destinations`). The knobs are named by what they mean and not by any
widget (`opening`, `leading`, `navigation`, `sticky`, `dialog`, `intro`, `action`, `symbol`), so that another
catalog can draw them its own way: a tab bar for `navigation`, a FAB for `action add`. The lint checks a kind's
traits against the frame's knobs, and a top-level answer that turns nothing the frame has is only a warning,
since it may go somewhere outside the catalog (a writer's word budget, a token).

**A catalog is a file of patterns**: what each is for (the sentence a Choice would offer), its slots, written as
fields are, and its knobs with what they can be set to; and, under `## Sources`, of where values can come
from. `grammar/kit.md` is written out from `patterns.ts` and `fill.ts`.
`checkBindings(graph, catalog)` needs only the two files: a part drawn by a pattern the catalog lacks, a field
sent to a slot that is not there, a required slot nothing fills, an answer that can yield what a knob cannot
take; and a warning for a part that names no pattern, which nothing will draw.

`checkGrammar` is the start of a lint. Errors: a part nothing describes, a rule or example naming what is
not asked, a Choice with one option. Warnings are this project's scars: a yes-or-no question that does not
say what yes and no look like (they come back near even odds), a question under a part that does not open
with "If…" (it is asked before anyone knows the part is there), a graph with no examples.

## What was tried, and what came of it

**Step 0: write the tool's own graphs out, and read them back.** `grammar/screen.md` (34 questions, 9 kinds
of screen, 12 parts, 8 rules, 30 examples) and `grammar/paint.md` (12 questions, 5 of them Scores) are
written by `export.ts` from what is actually asked (`planQuestions()`, `mixQuestions()`), not from the
tables behind them. The tests hold that:

- the files are what the code asks today, and a file read and written again is the same file;
- read from the file, the request to Jev is deep-equal to `planQuestions()`, and to `mixQuestions()`;
- `readGrammar`, which knows nothing about screens, followed by `planOf`, which only renames fields, makes
  the `ScreenPlan` that `readPlan` makes: 3000 random sets of answers, some near certain and some torn,
  with and without kinds ruled out, parts settled by the developer, and `topLevel` settled by how the
  person arrived;
- nothing in the file is decoration: take out any one rule, the `never padding` trait, or the probed
  threshold, and some screen comes out differently;
- a Score with values reads as `design-mix.ts` reads its dials.

Live (`npm run probe:grammar`, 2026-09-21, jev-latest): asked from the file, **30 of 30 plans are the plan
`readPlan` makes of the same answers** (in seven runs of eight; see 32 below); 26 of 28 labelled examples came
out as labelled.

One of the two misses is a find. "Thermostat control for the living room": Jev says custom at 0.56, which
clears the probed threshold, and `probe:custom` counts that a pass. But Jev also reads the screen
as `settings`, and a settings screen has no custom part, so nothing is baked. An example that claims a
*reading* catches what a probe of one raw answer cannot.

**Step 1: a graph nobody wrote code for.** `grammar/examples/email.md`: the emails a product sends. 7
kinds, 8 parts, 14 questions, a dial for length, 4 rules, 12 examples labelled before the first run. It was
run once and has not been tuned since:

- every kind right, 12 of 12; 10 of 12 examples whole; 43 of 45 claims; 94–225 ms a request;
- "You left a tent in your cart" has no `items` (Jev: 0.05). Jev reads wording to the letter: a tent is one
  thing. The label was wrong, not the graph;
- "Spring sale, 30% off everything" has no `cta` (0.26): none of the button's examples is about shopping.
  This is the loop the examples are for, and it has not been run;
- the dial lands where it should: 31 words for a sign-in code, 250 for a digest.

So the reader is general, and the format did not only fit the screens it was taken from. Parts (`hero`,
`prose`, `facts`, `items`) recur across the two graphs almost word for word; the kinds are the local dialect.

**Step 2: the catalog half.** Every part of `screen.md` now says what it is made of (61 fields, about which 92
things are said: a gate, a slot, a source), and names one of the twelve patterns in `kit.md`. Two generic
functions in `make.ts` know nothing about lists or screens: `schemaOf` makes the schema a writer fills, and
`treeOf` hands the fields, by slot, to the pattern, with the knobs the answers turn and the look of the design.
A pattern (`patterns.ts`) is a builder of `mock/screen.ts` said again against that interface: it never sees a
`ScreenPlan`. The tests hold that:

- for every part of 2000 random screens, the schema from the file is deep-equal to `partSchema(part, plan)`,
  the header and the navigation included, and a part nobody writes (`hero`, `custom`) has none;
- for every part of 2000 random screens, the tree from the file is the tree `BUILDERS[part](plan)` makes, every
  part drawn and the list in every layout. Trees are compared without their ids: what is drawn, not what the
  pieces are called;
- nothing a field says is decoration: take away any one of the 92 and some schema or some tree changes, or the
  pattern refuses to draw;
- what is drawn from a file is a tree the kit accepts (every component against its schema, every reference
  resolving), for 500 random readings of `screen.md` and of `email.md`.

Then the email graph was given the same treatment by hand (seven of its eight parts bound to patterns, and a
header) and
**drawn, live, with no code about emails** (`npm run probe:draw`): Jev reads the brief and mixes a design from
it, the tree is up in about 260 ms, one Gemini writer per part fills it in about a second, and the messages
validate. A receipt whose prices sit in the meta slot because `item_price` is yes and whose totals add up to its
lines; a digest whose thumbnails are there because a yes turned `leading` to `thumbnail`:

<img src="grammar-email-receipt.png" width="300" alt="An order confirmation email drawn from the graph file">

The total is not bold, and at this step the pictures were placeholders, for the reasons under "What resisted".

Writing it once found two places where the tool asked a writer for words the tree has no place for: a heading
for the list of a feed (and a component for it that nothing pointed at), and a search placeholder where there
is no search field. `partSchema` and `BUILDERS.list` no longer do either; three feeds and a dashboard were run
through the real pipeline to see it.

**Step 3: `else`.** The tool has two chains, and had them as control flow: `bakeCustom` (look on the app's
shelf, else bake, else close the slot) and `Pictures.find` (look in the library, else have one made, else leave
the frame). `screen.md` now says both, and says under `custom_use` and in `subjects.md` what each answer means to
whoever makes the thing (the baker's `USES`, a subject's `shot`). `fill()` in `fill.ts` tries a chain and knows
nothing else; what a source does stays the host's, and `bake.ts` and `pictures.ts` now have theirs by the names
the file uses. The slot's own plumbing (`use`, `data`, `selection`, `failed`) left the graph for the pattern:
a graph says what fills a part, not how a slot is wired. The tests hold that:

- the custom chain read from `screen.md`, tried by `fill()`, does what `bakeCustom` does, call for call and
  message for message, with the models stood in for, under eight scripts: nothing on the shelf; Jev takes what
  is there and only its data is written; Jev says none of these; what is there cannot be filled; the first bake
  refused and the second passing; both refused and the slot closing; made again at the developer's word; a
  shelf of the wrong kind. With its steps in another order, or without its terminal, it does not;
- an item's picture chain read from `screen.md` does what `Pictures.find` does, under five;
- every chain in `screen.md` and `email.md` names what the catalog has and ends in a terminal, and a chain that
  does not, a source nobody has, a `by` on a maker and a knob set to what it cannot be are each said.

Both were then run through the real pipeline, since `bake.ts` and `pictures.ts` changed shape: a pomodoro timer
baked and a list of dog walkers got its four portraits, valid.

And the email graph got what it lacked. Its `code` part, which nothing in the kit draws, became
`### code → slot with ratio 3:1`, `filled from shelf else baked else closed`, with two sentences after an arrow
for a contract; its pictures became `from library by pictures_of else painted else placeholder`. Drawn live:
the code baked in 7 s while the rest stood, to the letter of its arrow (large, in spaced groups, what it is for
above, how long it lasts below, a button to copy it); of six pictures for a hiking newsletter, three came from
the library and three were painted, the lead one among them.

<img src="grammar-email-code.png" width="300" alt="A sign-in code email whose code part was baked through the chain in the graph file"> <img src="grammar-email-hikes.jpg" width="300" alt="A hiking newsletter whose pictures came through the chain: three from the library, three painted">

Two of the three from the library are wrong (a sea cliff for an alpine lake, a beach for a group of rock towers). The chain did
what it says; the mountain shelf and an offer of five is where that went wrong, and no file is going to fix it.

**Step 4: `decided`.** Six of the seven functions of `refine.ts` have the same shape (the seventh, the kind of
a form's field, is 26 below), and `screen.md` now has all of what they ask: ten questions under six parts (the rows of a group, the items of a list, the figures that moved,
a banner, the navigation, the buttons), five rules about elements, `all or none` once and `one where` once.
`decide()` in `decide.ts` is refine.ts done for any graph. The tests hold that:

- for 400 made-up groups and 300 each of the other five, **what Jev reads and what Jev is asked are deep-equal
  to what refine.ts sends**, and the same answers, given to both, leave the same data: with and without
  symbols, with and without an option the person is already known to have chosen, with figures that did and
  did not move, with one button and with two;
- a question is needed exactly when the pipeline works out by hand that it is (`want.tones`, `want.icons`,
  the design's `icons`, `statDeltas`): over 1500 random screens, "the tree the file makes reads the field"
  says the same;
- nothing said about a decision is decoration: without any one of the four rules about rows, or `all or none`,
  or `one where`, some group comes out differently;
- none of it is asked before there are words: the first request is still deep-equal to `planQuestions()`.

Writing it down found that `refineGroup` turned a group's symbols off from the first option-to-pick-among
*onwards*, so a group whose second row was one kept the first row's symbol. It decides before reading any row
now; two settings screens were run through the real pipeline to see it.

The email graph got two such questions by hand (whether its warning is bad news, which button is the main
one), and `probe:draw` asks them as each part is written. A failed payment, drawn live: the warning read as
`danger` at 0.91, and the only button made the main one without asking anything.

<img src="grammar-email-alert.png" width="300" alt="A failed-payment email: the banner's tone and the main button were decided once the words existed">

**Step 5: the tool reads the file.** `runMock` (`mock/pipeline.ts`) now asks `questionsOf(screen.md)`, reads
the answers with `readGrammar`, draws each part with `treeOf` and the kit's patterns, asks each writer for
`schemaOf` its part, fills what nobody writes through the file's chains, and asks what is decided once the
words exist with `decide()`. `plan.ts` kept the shape of a plan, what is taken of one a browser sent back, and
`applyDesign`; `screen.ts` kept the frame; `refine.ts` kept the form field; `BUILDERS`, `partSchema`,
`readPlan`, `planQuestions`, the question tables and six of `refine.ts`'s seven functions were deleted. What
code still knows by name is in `mock/graph.ts`: the kinds and their traits (for the frame, `change.ts` and
`talk.ts`), the options a browser may send back, and `readingOf(plan)`, the way from a plan back to a reading,
because the design and the developer's word are applied to a plan and the drawing reads a reading.

The safety: before the deletion, the readers were still held equal to the hand-written code (all 29 differential
tests, re-run under a better seeded generator, since the old one never produced a feed), and what they make of
600 recorded sets of answers (200 plans, 16 screens' trees and schemas, 40 screens' later decisions) was
written down (`fixtures/screen.json`, 730 KB). `regression.test.ts` holds the file and the readers to that
recording; a change to `screen.md` that is meant is recorded again with `RECORD=1`. The bundle carries
`grammar/` beside `main.js` (`build:server`), and the production smoke test starts it.

Live, after the switch: nine screens of every kind, the edit path (a recipe made again with a button
added, its prose, facts and steps kept word for word), and the tap-through path (a walker tapped from a feed:
a detail page about one person, with their portrait carried). All valid; trees at 180–330 ms; a checkout's
totals bold on the last line, its items toned, a "Delete account" button red, a timer baked in 13 s.

One mistake on the way, which cost something: the list's later question was hooked without the `once` the old
code had, and since a refinement re-sends the part, which calls the hook again, the tool asked Jev about the
same list every 60 ms for the ten minutes a test run sat on a checkout screen, and again for a minute while
it was found: roughly nine thousand Jev requests. Fixed with the `once`, and a comment says why it is there.

**Step 6: the frame as a pattern, with a swappable catalog as the north star.** `screen()` in `mock/screen.ts`
was the last hand-built piece of the tree: the app bar, the navigation bar, a profile's opening, an outcome's,
the dialog, the sticky bar, and the reading of the kind's traits that chose between them. It is now the `page`
pattern of `kit.md`, with five slots and eight knobs (above), and `frameOf()` in `make.ts` builds it from the
file the way `treeOf()` builds a part: knobs from the top-level answers, then the kinds' heading, then the kind's
traits; slots from the header and the navigation. Along the way:

- the navigation bar binds each destination's symbol (`NavBar.icon`, a relative binding the renderer now
  honours), so "is the symbol needed" is read off the frame's tree like any other field's, and the pipeline's
  last hand-set `plan.icons` is gone;
- a profile's portrait is a field of the header (`imageUrl as portrait, from library else painted else
  placeholder`) and joins it as a decoration, where it was written to `/person` by hand;
- "a profile has no lead photograph" is a rule in the file (`when person is yes, no hero`) instead of the frame
  quietly not placing a hero it had fetched;
- "a main screen's bar leads with nothing, whatever the kind says" stayed in the pattern, since it is the
  pattern's system's rule (Material's top-level destinations have no up arrow), and a kind's `leading close`
  must not beat it;
- `Kind` in `graph.ts` lost its three booleans; the frame reads the traits, not code.

The recording was compared before and after: every plan, tree, schema and decoration is what it was, but for
the three things meant (profiles lose their hero; a result shows the symbol Jev chose, which the old
recording's shortcut had hidden; navigation bars bind their symbols). Live: six screens whose frames differ
(a profile, a dialog, an outcome, a form, a main screen, a detail page), the edit path and the tap-through
path, all valid, trees at 160–330 ms, and a tapped walker's picture travelling into the header of the profile
it opens. The email graph then got the same frame with one line, `## kind → page with leading none, intro yes`,
and is drawn with a large title, its preheader as the line under it and no bar of destinations: the first thing
a brought graph draws that is not a bare page.

## What resisted

What the export could not say, or could only say by growing the format:

1. **One rule form was needed after all**, and it is a guarded assignment. Eight of them carry everything
   `readPlan` does after thresholds. Precedence is not uniform in `readPlan` and the reader copies it as is:
   parts the developer settled beat rules, but rules beat a `topLevel` settled by how the person arrived.
2. **`never padding`.** A thin screen takes its likeliest remaining parts, but never a banner or a custom
   part. That is a trait of a part, and nothing in the first sketch had traits on parts.
3. **One threshold does not fit the tiers** (`has_custom`, probed at 0.55). It lives with the answerer,
   keyed by question.
4. **What an option yields is sometimes more than one value.** A ratio, an angle and a symbol fit in a code
   span. A typeface option yields four fields; an elevation yields a sentence for the DESIGN.md; a picture
   subject yields `shot`, the art direction the image model reads when a picture has to be made, which is a
   piece of a fallback. These are not in the files.
5. **A dial whose values depend on another answer** (`light` has one set of stops on a dark interface and
   another on a light one) has no values in `paint.md`, and `warmth` is read by a function, not a scale.
6. **`(circular)` is only a word.** `hue` says it, and the reader does not take the circular mean.
7. **"If…" is written by hand** into every question under a part. `plan.ts` composes it for item parts;
   the file has the composed sentence, and the lint warns when it is missing.
8. **Nesting is scope, and that made one thing explicit**: what the lead picture is of is read whether or
   not there is a lead picture (a tapped item's photograph travels to the page it opens), so it sits at the
   top of the file and not under `hero`.

From the catalog half:

9. **A gate needed `or`** (`item_trailing is switch or checkbox`), so an answer in a condition can be any of
   several. Across two questions there is still no `or`: `tone` colours a badge or a progress bar, and is simply
   always bound. What a pattern does with a slot it has no use for is the pattern's business, as it is when a
   grid is too tight for a second line.
10. **A yes had to turn a knob that takes a name** (`item_picture → leading`), so a yes and a no can yield.
11. **Ways a field gets a value that nobody writes.** Pictures and the custom part are chains (step 3) and
    `decided` is a question (step 4). `computed` (the last row of a bill is its total) is still only a word,
    which is why the drawn receipt has no bold total. `from /list/items` is another part's data, and is
    simply there.
12. **The frame is not in the catalog.** The app bar, the navigation, a profile's opening, a dialog, the sticky
    bar: `screen()` in `mock/screen.ts`. That is where a kind's traits, the header, `top_level`, `person` and
    `app_bar_action` land. `probe:draw` puts the parts on a bare page under the header.
13. **The look is a third input.** `contained`, `icons` and the placeholder symbol come from the design, not the
    graph, and a design can also overrule a reading (no photographs: no hero, thumbnails become icons). The
    first is a parameter of every pattern; the second is still `applyDesign`.
14. **Ids and paths.** Patterns call their pieces `<part>_…`; the builders say `item`, `stat`, `fact`. The
    renderer cares about one id (`form_submit`) but about several paths (`/list/items/3` is what a tap on an
    item reports), so a brought part called `items` draws but would not tap through.
15. **Which writer waits for which** (a bill for its lines) is guessed in `probe:draw` and said nowhere.
16. **A knob's values have no criteria.** The when-to-use of `cards` against `grid` is design-system knowledge,
    and belongs in the catalog for a graph's question to import, as options are imported from a set.
17. **Nothing in the kit draws a one-time code.** This was the hole an `else` is for, and step 3 filled it.

From the chains:

18. **What comes before a chain.** A subject read off the description may have been a guess (under 0.75), and
    then the words are read before the library is looked in. That is a policy for a torn answer, it is the
    host's, and the file cannot say it. `fresh`, too, is the runner's: made again, the sets are passed over.
19. **The baker speaks of screens.** Its brief says "it is a … screen" and what the kit draws around it, and a
    baked component's contract is typed as the screen graph's (`use`, `size`, `linked`). `probe:draw` hands it
    the email as a screen, with the contract said in words. A brought graph's contract should be its own.
20. **One slot, called custom.** The renderer reads `/custom/name` and writes `/custom/selection`. The email's
    `code` draws, but a choice made in it would be written under another part's name.
21. **What a picture is of** is the words nearest its field: the item's first two, else the header. That is
    `itemWords` as a convention of `probe:draw`, said nowhere.
22. **A source's insides are prose.** The baker's prompt, its five checks and its two tries, the library's offer
    of five: the catalog says them in a sentence and in traits, and only `set`, `maker` and `terminal` are read
    by anything. `slow` and `joins shelf` are true and unenforced.
23. **The third chain is not on a field or a part.** When Jev finds nothing to do with a message, Gemini asks
    the person (`talk.ts`). That is an `else` on a turn, and turns are not in any file yet.
24. **`written` is a source too**, the first of every plain field, and its tier, its system prompt and which
    writer waits for which are still the host's.

From the frame:

38. **A knob's value "none" is a value.** The first draft of the pattern read `none` as unset, so an email that
    fixed `leading none` got a back arrow. Open knobs (`action`, `sticky`, `symbol`) still use `none` for
    "nothing"; closed ones (`leading`) take it as one of their names.
39. **Whose rule is it.** "A main screen's bar leads with nothing" could be a rule in the graph (`when top_level
    is yes, leading is none`) or the pattern's. It is the pattern's, because it is Material's, and a catalog
    that is Apple's may want a large title and no bar at all. Where a rule lives decides which file a style
    changes.
40. **The frame's knobs are the contract for a second catalog**, and they were named from one system's needs.
    A FAB (Material), a large title (HIG), a page header with a primary action (Polaris) each fit `action` and
    `opening` only loosely; the first other catalog will say which names were right.
41. **The renderer reads `destination`, `label` and `icon` of a navigation item by name**, and orders them
    (`orderedNavigation`). Only `icon` is bound now; the rest is still a convention between the pattern and the
    renderer.

From the tool reading the file:

33. **A plan and a reading are two shapes of one thing.** The browser holds a `ScreenPlan` and sends it back;
    the design and the developer's word are applied to it (`applyDesign`, `keepPlan`); the drawing and the
    writers read a reading. So `readingOf(plan)` exists, and the two must agree on every field. A brought graph
    would have no plan type, and would want the design and the edit applied to the reading instead.
34. **The trace changed.** Decisions are labelled by the file's question text and ids (`item_leading`,
    `row_control_0`), where the hand-written code had short labels ("each item is…", a row's label). The trace
    panel and Gemini's answers to questions read them; whether either is worse for it is not measured.
35. **The navigation bar draws its own symbols** (fixed in step 6: it binds them, and the frame is a pattern).
36. **The four other files are still exported from code**: `paint.md` because `design-mix.ts` has not made the
    move (its dials are read by functions and one dial's stops depend on another answer, 5); `kit.md` because
    the catalog *is* code that draws; `icons.md` and `subjects.md` because they are lists of assets. And
    `screen.md` still links to `subjects.md` for what a picture can be of, which `photos/subjects.ts` owns.
37. **The regression fixture is blunt.** It says something changed and where, not whether the change is good; the
    file's own examples (`probe:grammar`) are the check that reads meaning, and they need Jev.

From what is decided once the words exist:

25. **Two things are about all the elements at once**, and needed words of their own: `all or none`, `one
    where`. Everything else in refine.ts was a question, a yield or a flat rule.
26. **The kind of a form's field is still `decided` by nothing the file says**, and the lint says so.
    `design.ts` is older than the kit: it asks about one field at a time, under other names (`user_request`,
    `form_field`), walks Jev's ranking to the first control the content can back (a choice needs options, a
    slider a lower bound under an upper one), and makes a choice of four or fewer into chips. That wants an
    option that is only on offer when something was written, and a count.
27. **Two conventions made the requests come out the same, and are said nowhere**: an element with one thing
    written for it is that thing where Jev reads it (a destination is its label, a group is its title), and
    `none` yields nothing.
28. **The names answers come back under differ.** refine.ts says `control_0`, `news_2`, `primary`; the file
    says `row_control_0`, `stat_news_2`, `main`, because a heading is an id and `icon` is asked in three parts.
    The requests were held equal in what is asked and in what order, not in these names. Whether Jev reads
    them is not known.
29. **What is already known is the host's**: the option the person saw on the row they tapped. `decide()` takes
    it as a function; the file cannot say where it comes from.
30. **The tool's own graph does not pass its own lint clean**: `row_on` and `destructive` do not say what yes
    and no look like. They were left as they are, since new wording is new behaviour and wants a probe first.
31. **When to ask** (as each group completes, once a list is complete) is the host's, with the streaming.
32. **Once in eight live runs of thirty, one plan differed from `readPlan`'s**, and it was not seen again, so what
    differed is not known; the probe now prints it. Both read the same answers, so it is a tie or a boundary and
    not chance. The one place they are built differently: `readPlan` reads most choices as Jev's `choice` but a
    symbol as the top of the ranking (`readIcon`), and the file's reader reads every choice one way. On a tie
    between two symbols those can differ. This is a suspicion, not a finding.

Not attempted, and each is a piece of the graph that is still only code:

- **Reading a change** (`change.ts`): every dial and gate has a relative twin ("what does this message want
  done to it"). That twin looks derivable from the graph rather than something to write down twice.
- **The design overruling the plan** (`applyDesign`) and **what stays when a screen is made again**
  (`keepPlan`). Both are layers over a reading: a DESIGN.md that says "no photographs" is a pin.
- **The app map** (`src/server/ia/`).
- **The reply when Jev found nothing to do** (`talk.ts`): the `else` of a turn.

## Next, in the order that seems right

1. **A second catalog.** The frame's knobs, the slots' roles and the sources are now the whole contract; the
   way to find out whether it is a contract is a catalog that is not the kit's. Material Web (`@material/web`,
   Lit, with a custom-elements manifest the catalog file could be generated from) is the cheap one; Apple HIG
   is the one that tests the frame (tab bar, large title, alerts).
2. **The design and the edit as layers over a reading** (33), so that a brought graph is not tied to
   `ScreenPlan`, and `paint.md` read by the tool (36).
3. **A contract of the graph's own** for the baker and the shelf (19), and more than one slot (20).
4. **Form fields** (26), and **calibration from examples** with the policy for a torn answer (18).
