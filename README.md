# jev2ui

A design tool for developers: describe the screen you want, get a mock of it, tap through it into screens that
are designed as you go, all painted by your
[DESIGN.md](https://github.com/google-labs-code/design.md).

Under it is an experiment: build a screen from a text prompt using [TypeSafe's Jev](https://docs.typesafe.ai/)
for the decisions and a small Gemini model for the words. It began by emitting
[A2UI](https://github.com/a2ui-project/a2ui); the mocks now use a humble fork of it with a richer catalog.
Jev is a decision model. It cannot generate text or JSON; it answers yes/no (Noul), pick-one (Choice)
and rating (Score) questions with calibrated probabilities, many at once, in roughly 100–300 ms.

> **Jev decides, Gemini writes, code assembles, a DESIGN.md paints.**

```sh
npm install
npm run dev        # http://localhost:5173
```

Type a description ("Checkout for a sneaker store, with order summary") and the mock appears
in a phone, tablet or desktop frame in about a second and a half. Every decision behind it is listed in the
trace, with its probability. Copy the messages, the theme as CSS variables, or the DESIGN.md.

## How a mock is built: Jev fills a tree

Jev cannot draw a tree, but it can choose, and a tree is a nest of choices (`src/server/mock/plan.ts`):

```
archetype         which canonical layout this is: feed, dashboard, detail, guide, settings, form, checkout, confirm.
                  Fixes which blocks are allowed and the order they come in.
  blocks          which of the allowed blocks are present: banner, hero, filters, stats, list, groups, facts,
                  prose, steps, form, actions; plus an app bar, and a navigation bar on the app's main screens
    anatomy       each block's slots. A list item: what leads it (avatar, thumbnail, symbol, number), which
                  metadata it carries (price, rating, status, time, progress), what trails it (chevron, button,
                  switch, checkbox), and whether the list is rows, cards, a grid or a reel
      instances   per row, badge and number, once the words exist: does this setting get a switch, a value or a
                  way in? Which symbol? Is "Degraded" bad news? Is +0.3 kW?
```

The first three levels depend only on the prompt, so they are one Jev request of 30 questions, and the
whole tree is on screen at around 200 ms, shimmering where words will go. Order is never asked: it belongs to the
archetype, which is where best practice lives. The fourth level is asked as each group, list or field completes
in Gemini's stream (`refine.ts`). Those answers are written into the *data model* beside the words they are
about (`/groups/1/rows/2/control = "switch"`) and the tree binds to them, so a template stays a template however
much its instances differ.

**Where the design knowledge comes from.** The options Jev chooses among carry criteria, and the criteria are
the "when to use" guidance of the systems the components come from, rephrased as facts about the content,
because Jev reads a situation far better than it judges a design
([docs/jtbd-probe.md](docs/jtbd-probe.md)). Material says a switch is for one setting that is on or off and
takes effect at once, and the HIG says a disclosure indicator marks a row that opens another page; so the
question is "what kind of row is this?", and on a podcast settings screen Jev answers `Skip forward` → value,
`Auto-download` → switch, `Log out` → danger, each at p ≈ 1.00. Other rules live in code, where they cannot be
got wrong: a feed always has its list and a settings page its groups, whatever Jev says; a navigation bar only on top-level screens and a back arrow on the rest (Material); one primary
action per screen, red if it destroys something; no second set of buttons competing with a form's submit;
picture layouts only for things with a look; rows in a group all lead with a symbol or none do; a bill's totals
are written after its line items and shown them, so that it adds up.

### Pictures: Jev chooses, and when nothing suits, one is made

Jev cannot describe a photograph, and Gemini's text model cannot produce one, but between them and an image
model every picture on a mock is of the thing beside it (`src/server/mock/pictures.ts`, `src/server/photos/`).

1. **The frame is painted before it is filled.** Until a photograph has loaded, its frame is a wash of the
   accent with the symbol Jev chose for the screen, so a slow or missing picture still looks designed
   (`src/web/kit/picture.ts`). Each source fades in over the last, so a better one can arrive later.
2. **Jev says what the photographs are of**, as part of the plan: one Choice for the lead photograph and one
   for the items, among some forty subjects (`subjects.ts`): dish, venue, stay, dog, portrait, gadget. A subject
   is a shelf of the library, and it is also art direction: food is shot from above on a table, a product alone
   on a plain backdrop, a person head and shoulders.
3. **Jev picks the photograph.** As each item's words arrive, code shortlists five library photographs by
   plain word matching against their captions, and Jev chooses among the captions. One option is always
   "none of these", because a wrong photograph is worse than a painted frame. No photograph is used twice on
   a screen: Jev's ranking is walked to the first one still free.
4. **When Jev says none, the image model makes one** (`gemini-3.1-flash-lite-image`, about three seconds).
   Nobody writes the prompt: it is Gemini's words for the thing (an item's title, or the header for a lead
   photograph), the subject's art direction, and the developer's description for the setting only, since a
   model shown a description of a screen draws a phone. What is made is kept in `.cache/photos` with those words as its caption and
   joins the library, so the next pizzeria finds a margherita on the shelf and asks for nothing.
5. **The plan leans toward pictures.** A page about one thing expects a lead photograph; an item gets a
   thumbnail whenever the app would have a photograph of it (a class, an event, an article, not only a
   product); and people are pictured too: an avatar is a portrait, in the list and again on the profile the
   tap opens, with initials until it arrives. Portraits come only from the portrait shelf: a dog walker's
   photograph is not a photograph of a dog, whatever words they share.
6. **A subject chosen before there were words is only a guess.** "Order #4821" does not say the order is
   headphones. When Jev's answer in the plan is unsure (p < 0.75), it is asked again about each item, with the
   item's words, before anything is looked up or shot.
7. **Drawn or photographed is the design's decision too.** A bedtime-story app should not show photographs,
   and asked whether it should, Jev rightly said no, which used to leave it with no pictures at all. Now
   `illustrated` is one of the looks a design can have ("drawn and not photographed: the product is for
   children, or what it shows is imagined"), and Jev gives it to bedtime stories, phonics lessons and a fantasy
   RPG at p = 1.00, and to no restaurant. An illustrated design passes over every photograph in the library and
   has its pictures drawn, in one hand that a rule picks from the app's description (picture book, concept art
   or editorial), so every screen of the app matches. Illustrations are shelved apart from photographs. Unlike
   the treatments this is not paint: a remix never changes it, and a mock made in the other medium is stale.
8. **How photographs look is the design's decision, and it is paint.** Natural, muted, black-and-white or
   duotone in the brand's colour: Jev chooses it when it mixes a design, reads it from a supplied DESIGN.md,
   and a remix can draw another. Pictures are always made in natural colour and treated in CSS, so changing
   the design fetches nothing.

The library's stock comes from the [Unsplash Lite dataset](https://unsplash.com/data) (`npm run photos:build`),
and only for the shelves that dataset is good at: landscapes, cities, animals, flowers, some 600 photographs.
It has next to no food, shops or gadgets, so those shelves start empty and fill with use. `MAKE_PHOTOS=0`
keeps to the library.

### Tapping through: the prototype designs itself as you go

Every tappable thing in a mock is a link to a screen that does not exist yet. Tap it and the screen is made,
in the same app, in the same second and a half.

1. **The renderer reports the tap** with what it was and the data behind it: the list item's object, the
   settings row's, or, for a button that acts on the whole screen, everything the screen showed.
2. **Code turns the tap into the next screen's description** (`src/server/mock/link.ts`); no model is needed,
   because what was tapped already says what comes next. An item becomes "Arthur Pendelton: the page for this
   one item"; a row showing a value becomes "Choose Skip forward: the available options for this one setting,
   with '30 seconds' currently chosen"; a destructive row becomes "Confirm: Sign out"; a submit button becomes
   "The outcome of 'Place order'". That description goes through the same planning as one a developer typed,
   with the app and the way the person got there alongside it, which Jev reads well.
3. **Code keeps it one app.** How the person arrived settles what Jev would otherwise guess: the navigation
   bar leads to main screens and everything else drills in, with a way back. The design is pinned, a mixed one
   included. The navigation bar is established once and reused, symbols and all. Writers are shown what the
   previous screen said about the thing that was tapped and must agree with it, so the walker who was
   "Chelsea, $25.00, 4.8 (98)" in the list still is on his page, and the receipt totals what the checkout did.
   The photograph of a tapped item goes with the person, and leads the page it opens.
4. **The browser keeps the session** (`src/web/app.ts`): a graph of screens keyed by the link that made them,
   and a back stack. A tap followed before shows the screen it made then, so the prototype holds still while
   it is explored. A `confirm` screen is a dialog laid over the screen it came from, and its Cancel goes back.
   Switches and checkboxes flip in place. The strip above the device lists every screen made so far, and ↻
   makes the current page again from the same request, forgetting whatever was reached from the old one.

A session can start anywhere, including on a sub-page such as settings, whose back arrow has nothing to go back
to. That tap makes the app's home: a main screen, which has no back arrow of its own, so the chain ends by
construction, and whose kind is limited to a feed or a dashboard however strongly Jev is still thinking about
settings (its ranking is walked to the first kind allowed). Without both rules, going back made settings pages
forever.

Two archetypes exist mostly for this: `result` (the outcome of something just done) and the picker that a
settings screen turns into when it was reached from a value row, whose options are check rows with the
current value ticked.

### The kit: a humble fork of A2UI

`src/shared/kit.ts` keeps what makes A2UI good for this: a flat list of components addressed by id, structure
(`updateComponents`) separate from content (`updateDataModel`), any value bindable to a data path, and
templates stamped per array element (here they nest: rows inside groups). The envelope is unchanged. What
changes is the vocabulary. A2UI's basic catalog stops at atoms (Text, Row, Card) and 59 icons, and no amount
of choosing makes a rich screen out of those. The kit has molecules, with anatomy other people already worked out:

| Kit | From |
| --- | --- |
| Stack, Cluster, Grid, Reel | Every Layout's primitives; the grid is intrinsic, so tiles reflow from phone to desktop |
| ListItem: leading / overline, headline, supporting / meta, trailing, below | Material 3 lists |
| AppBar, NavBar, StickyBar | Material 3 top app bar, navigation bar, bottom bar |
| Group, SettingRow | iOS inset grouped lists |
| Stat: label, value, delta | the KPI card (Tremor, shadcn/ui blocks) |
| Banner, Badge: tone | Polaris |
| Text roles: display, headline, title, body, label, caption | the DESIGN.md typography scale itself |
| Icon | any of 175 Material Symbols |

The schemas are shared: the server validates every message against them, and a small light-DOM renderer
(`src/web/kit/`) draws them. Owning the renderer is also what lets a DESIGN.md carry over whole (below).

`npm run eval -- --only mock` over 13 prompts: 13 of 13 valid trees with a mixed design and with Broadsheet,
first components at 159–289 ms, complete in 0.9–2.2 s.

### Baking: what no kit will ever have

A map, a pomodoro ring, the seating plan of one concert hall. Every app has something like it, the list never
ends, and adding each one to the kit would make every request a change to this repo. So none of them is in
the repo. The repo holds only the mechanism, and the kit is a catalog that grows while it is being used.

- **Jev notices, and sets the contract.** One more block question: *is the heart of this screen something that
  has to be drawn specially for it?* On 28 labelled prompts (`npm run probe:custom`) every screen the kit can
  draw came back at 0.14 or less and every other at 0.57 or more. Jev cannot say what the thing is, and does not
  have to, since the description already does. It settles what the thing is held to: what the person does with it
  (watch, pick, adjust, read), the box it gets (strip, wide, square, tall), and whether it draws the very items
  the screen also lists.
- **The tree ships with a slot.** `Custom` is a box of known ratio bound to `/custom`, so the screen is still up
  at ~200 ms and the slot shimmers, the way an Image holds its place before its pixels arrive.
- **Gemini bakes.** A stronger model (`BAKER_MODEL`, default `gemini-3.8-flash`) writes a
  `render(root, state, kit)` function, the JSON Schema of the data it draws, that data for this screen, and a
  *card*: one sentence saying when a screen needs it. Code checks the source (it parses; colour comes only from
  the `--k-*` variables; nothing reaches for the network) and asks again once, with the reasons, if it does
  not pass. If that fails too the slot closes up and the rest of the screen stands.
- **`defineComponent`** is the fork's one new message: `{id, name, card, source}`. The renderer runs the source
  in a sandboxed frame (`src/web/kit/sandbox.ts`: scripts, but no origin and no network) and hands it the kit's
  stylesheet and the design's variables. So a baked timer uses the kit's buttons and badges, is painted by the
  same DESIGN.md, and **Remix repaints it while it is running**.
- **It is part of the prototype.** `kit.select(value)` writes what the person chose next to the component's
  data, so the screen's own buttons carry it along: pick Stalls, row 2, seat 8, press the button, and the next
  screen is about that seat. `kit.open(label, data)` and `kit.openItem(item)` are taps like any other.
- **The shelf.** A baked component joins its app's shelf. On the next screen that needs something custom, the
  cards on the shelf are the options of a Choice, so Jev can say "the same map", and only the data is written,
  by the small model, against the component's schema (under a second, against 10–25 s for a bake). The grammar
  extends itself: Gemini writes the option, Jev reads it. Regenerate bakes afresh.
- **Whose shelf.** The browser's, like the rest of the session. `defineComponent` carries a component whole
  (source, card, data schema, contract), so the messages of a screen say everything about it, and the shelf is
  simply the components an app's screens define. The browser sends them with each tap and the server keeps
  nothing: a shelf outlasts a restart, and no two people share one. A component's id is a hash of its source
  and schema, so it names the same thing in any session, and cannot be claimed for other code. What comes back
  from a browser is checked as a fresh bake is (the hash, the lint), and whatever fails is dropped: the
  screen bakes its own. This is the shape a saved app wants. Its screens' messages, its design and the way
  between them are one JSON document with nothing left behind on a server; opened by somebody else, it
  brings its components along, they are checked on the way in like any other, and they run in the same frame.

Measured: a pomodoro timer's tree at 325 ms and its ring 11 s later; the Royal Albert Hall in 22 s; a coffee
map whose pins are the list's items in 27 s; all valid, none needing the second attempt. Ordinary screens are
untouched (no bake, ~2 s).

## Rendering strategy: the mock is painted by a DESIGN.md

A DESIGN.md is a design system in one file: design tokens in YAML front matter, then prose that says what the
tokens are for. Its [philosophy](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md) is that
the prose matters more than the values. The mock pipeline takes both halves seriously, and gives each to the
part of the system that can use it.

1. **Tokens are parsed by the format's own linter** (`@google/design.md`), which resolves references and
   reports problems (broken references, contrast failures). Findings show up next to the editor.
2. **Jev reads the prose for what tokens cannot say** (`src/server/design-md.ts`). Which colour is the page and
   which is the text? In one file `primary` is the accent; in the Broadsheet fixture it is "press ink, used for
   all headlines and body text", and only the prose says so. Each role is a Choice whose options are the file's
   own token names. Depth (shadows, outlines or tonal layers) has no token at all, so that is a Choice too.
   Code keeps the last word: a component token (`button-primary.backgroundColor`) or a conventional name
   (`on-surface`) settles a role without asking, and a pick that fails a contrast check is thrown out in favour
   of the next in Jev's ranking. One request, about 200 ms, once per file.
3. **Code maps tokens to paint** (`src/server/theme.ts`): about 57 `--k-*` variables plus the fonts to load.
   The kit's text roles are the DESIGN.md typography scale, so a typography token carries over whole: family,
   size, weight, line height and letter spacing (wide tracking on a small label becomes small caps, as the
   prose of such designs invariably asks). The theme is applied in the browser, so switching or editing the
   design re-skins the mock without regenerating it.
4. **The design changes structure, not only paint.** A specific reference brings its constraints for free: a
   newspaper has no pictograms and no cards, an instrument panel has no photographs. Jev answers three
   yes/no questions about the file, and the answers overrule the screen plan: symbols go, cards become rows
   parted by rules and stat tiles become ruled columns, the lead photograph is dropped and pictured lists fall
   back to rows. The trace says when this happens.
5. **The Overview gives the writers a voice.** Gemini never sees tokens or A2UI, but it is shown the brand
   paragraph. The same dog-walker screen is "Dog Walkers — Happy pups nearby ready for a stroll!" in Gumdrop
   and "Canine Conductors — A classified register of trusted walking companions" in Broadsheet.

The design is either Jev's mix (next section) or your project's own DESIGN.md, pasted into the editor and kept
in local storage. Three hand-written files in `src/probe/designs/` (Broadsheet, Gumdrop, Night Shift) are the
fixtures the reader is tested against with `npm run probe:design`; the examples in this section come from them.

### No DESIGN.md? Jev mixes one, with Scores

Jev cannot write `#6C3BF5`. But a colour in OKLCH is three numbers, and Jev can rate. A Score is an expected
value over an ordered rubric, so it lands *between* the levels: "how vivid should the accent be?" answered
2.55 of 4 is a chroma of 0.183. In `src/server/design-mix.ts`, one request of 12 questions about the brief
becomes a complete design:

| Question | Primitive | Becomes |
| --- | --- | --- |
| accent hue | Choice of 12 named hues | hue angle: the circular mean of the winner and its neighbours, weighted by probability (a rubric has two ends and a hue circle has none, so this one is not a Score) |
| accent vividness, accent lightness | Score | OKLCH chroma and lightness, reduced into the sRGB gamut |
| warmth of neutrals | Score | how far backgrounds and greys lean to cream or steel |
| roundness, whitespace | Score | the radius scale; the spacing scale and body size |
| dark interface? photographs? cards? | Noul | palette polarity; structure |
| how pictures look | Choice | natural, muted, black-and-white or duotone: a CSS filter, and for a duotone two inks mixed from the accent. Or illustrated: the pictures are drawn |
| typefaces, depth | Choice | one of nine Google Fonts pairings; shadow, outline or tonal |

"Plant care reminders for a gardening app" comes out green (p = 1.00), cream, humanist and softly rounded;
"Kubernetes cluster health for on-call engineers" comes out dark, steel, square, packed and monospaced;
"Bedtime story picker for a kids' reading app" comes out dark, pastel violet and round. The result is written
out as an ordinary DESIGN.md, with prose, and takes the same path as a hand-written one. It shows up in the
editor; edit it, or copy it into your project as a starting point.

**Remix.** Jev returns a distribution with every answer, so a mix does not have to be the expected score and
the likeliest choice. The Remix button draws instead: a rubric level from each Score's distribution, nudged off
the grid; a hue, a typeface pairing and a way of showing depth from their Choice probabilities, flattened a
little so that a confident Jev still leaves room to explore; light or dark as a coin weighted by Jev's answer.
Every remix is a design Jev finds plausible for the brief (a gardening app stays mostly green, and now and then
comes out dusty pink with a slab serif), none costs another request because the answers are already in hand,
and the screens stay as they are: only what they look like is drawn again, never what they contain. A remix
belongs to the app and is worn by every screen made after it.

Hue is the weak dial. When the brief gives no cue Jev's top hue sits at p ≈ 0.3–0.5 and the pick is
arguable (a luxury watch boutique got violet). Naming a colour in the prompt settles it.

### The mock pipeline

`src/server/mock/pipeline.ts`:

- **t = 0, in parallel:** Jev plans the tree; Jev reads the DESIGN.md (or mixes one); Gemini starts the header,
  already in the brand's voice, because parsing the Overview needs no model.
- **~200 ms:** the design overrules the plan where they disagree; the whole tree and the theme are sent.
- **Words** stream into the data model, one Gemini writer per block, each asked for exactly the slots the
  tree has.
- **Baking**, if the plan has a custom block: Jev looks on the app's shelf, or Gemini bakes a component; the
  slot fills when it is done.
- **Refinement** follows each part as it completes: one small Jev request per group, list, set of numbers,
  navigation bar or form field.

`npm run probe:design` prints how Jev reads each fixture design (and any path you pass, such as the examples
in the DESIGN.md repository); `npm run probe:design -- --mix "a brief"` prints a mix.

## The pipelines underneath

The earlier experiment is still here, at [/compare.html](http://localhost:5173/compare.html): three pipelines
that emit real A2UI for `@a2ui/lit`'s renderer, side by side. The sections pipeline is the mock pipeline's
ancestor, and the comparison shows what the basic catalog can and cannot express.
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

### As a server

`npm run dev` serves the pipelines from the Vite dev server. Deployed, they have a server of their own,
which serves the built front end beside them:

```sh
npm run build && npm start          # http://localhost:8080, or wherever PORT says
PROJECT=my-project ./deploy.sh      # the same, in a container (Dockerfile), on Cloud Run
```

The session is the browser's, the shelf of baked components included, so the process holds nothing that
matters: designs already read, which are only a saving. It is kept to one instance to bound what a busy day
can spend, not because a second would be wrong. Made photographs are kept in `.cache/photos`, or wherever `PHOTOS_DIR` says;
on Cloud Run that is a mounted bucket, so they outlast the instance.

### Signing in: a name, a list, and a count

Left alone, whoever has the URL spends the keys. With `FIREBASE_PROJECT` and `FIREBASE_API_KEY` set (the
project's Firebase web app; Google enabled as a sign-in provider, the served domain authorized; a Firestore
database the server's account can use), making things needs a name, and the name has to be on a list.
The rule is that reading is open and spending is not: only the routes that reach a model ask who is asking.

The browser asks `/api/config` whether to sign anyone in, fetches Firebase only if so, and sends the ID token
with every request (`src/web/session.ts`). The server checks its signature against Google's keys, takes the
address only if Google vouches for it, and looks it up (`src/server/auth.ts`) in the Firestore collection
`access`: one document per grant, named by the pattern of addresses it is for.

| document | fields | |
|---|---|---|
| `*@example.com` | `role: "maker"`, `runs: 50` | everyone there makes fifty screens a day |
| `ann@example.com` | `role: "maker"`, `runs: null` | Ann, as many as she likes |
| `bob@example.com` | `role: "none"` | Bob, though, not at all |
| `me@my.org` | `role: "admin"` | may also edit the list (no page for that yet: the Firebase console is the editor) |

`*` stands for anything (`*@example.com` does not cover `x@corp.example.com`; `*@*.example.com` does), and
of the patterns an address fits, the one that says the most wins: a person's own line over their company's.
A maker whose grant names no `runs` gets `DAILY_RUNS` (50 unless said); an admin, or `runs: null`, has no
limit. The list is read again within a minute of an edit. Someone signed in and on no line of it is told so,
and makes nothing (403).

Limited or not is one role with a dial on it, and the dial is the count: each screen made adds one to today's
figure in `people/<uid>`, in the same write that notes who they are and when they were last seen, and when
the day's runs are gone the answer is 429. Firestore does the adding, so two requests at once cannot both
read the old figure. What is left rides back in a header and shows beside the person's name. Browsers cannot
reach the database (no rules are published for it); `src/server/store.ts` is the three REST calls used.
Photographs are served to anyone: an `<img>` cannot say who is asking, and their names are hashes.

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
- A photograph is chosen from captions, never from pixels: Jev does not see the pictures, and a caption can be
  wrong. The A2UI comparison pipelines (`jobs`, `hybrid`) still use seeded placeholders from picsum.photos.
- Made photographs are served by the dev server from `.cache/photos`, so a mock's pictures do not outlive it.
- Sections are written by separate requests that do not see each other, so they can disagree on invented
  details. Each is told which parts the screen has and to stay within its own.
- Jev reads questions literally and answers them independently. Expect to tune question wording and
  thresholds; `src/server/plan.ts` and `src/server/design.ts` hold all of it.
- Button and form events are only logged in the trace; nothing handles them.
- The mock's grammar is nine archetypes and twelve blocks, one of which is the custom slot. What the kit lacks
  (a chart, a map, a calendar) is baked per app, so two apps get two different maps; there is no shelf shared
  between apps yet, and none that belongs to a DESIGN.md. No archetype is *about* its custom part: a timer
  comes out as a dashboard with a ring on top, and a tall component shares the screen with a list.
- A baked component is checked, not valid by construction. The lint cannot tell whether it draws the right
  thing, or draws at all. An error in the browser is reported in the trace, not sent back to the baker.
- The shelf lives in the browser's memory and goes when the page does: nothing saves an app yet.
- A custom slot sits in the archetype's fixed place and there is at most one per screen.
- Symbol questions are expensive: 175 options each, asked per row, which is why a settings screen costs
  around 19k Jev input tokens against 7k for most screens.
- Fields and chips draw their state but do not change it, and a form's values do not travel to the next screen.
- A session lives in the page: reload and the prototype is gone. There is no export of the whole flow yet.
- Nothing is prefetched; a Jev plan is cheap enough (about 250 ms) to start on hover.
- Hover and pressed variants in a DESIGN.md are mostly ignored.

## Layout

```
src/server/design-md.ts     parse a DESIGN.md; Jev reads its prose for colour roles, depth and constraints
src/server/design-mix.ts    no DESIGN.md: Jev's Scores become OKLCH colours, radii and spacing, written out as one
src/server/design-source.ts a supplied or mixed design, worked out once and reused
src/server/theme.ts         tokens and the reading, as the kit's --k-* variables
src/shared/kit.ts           the kit: component schemas of the A2UI fork, shared by server and renderer
src/server/mock/plan.ts     the grammar (archetypes, blocks, anatomy) and the questions that fill it
src/server/mock/screen.ts   plan to component tree; and the content schema Gemini is asked to fill
src/server/mock/refine.ts   per-instance decisions from the content, written into the data model
src/server/mock/bake.ts     what the kit cannot draw: the baker's contract, the lint, the app's shelf
src/web/kit/sandbox.ts      the frame a baked component runs in
src/server/mock/link.ts     from a tap to the description of the screen it leads to
src/shared/journey.ts       what the browser tells the server about how the person got here
src/server/mock/icons.ts    the symbols Jev chooses among
src/server/mock/pipeline.ts the mock pipeline
src/web/kit/                the kit's renderer and stylesheet
src/server/job-profile.ts   questions about the person, and the profile read from the answers
src/server/job-patterns.ts  rules from job to pattern; each pattern's parts and component tree
src/server/jobs.ts          the jobs pipeline
src/server/content.ts   per-part Gemini streams into the data model (shared)
src/server/form.ts      a form that grows field by field (shared)
src/server/plan.ts      Jev questions from the prompt, section grammar, Gemini content schema
src/server/design.ts    Jev questions from the content (per-field controls, primary action)
src/server/emit.ts      deterministic A2UI component builders
src/server/hybrid.ts    the sections pipeline
src/server/baseline.ts  Gemini writing A2UI directly
src/server/validate.ts  schema and reference validation
src/server/run.ts       event stream, stats, end-of-run validation
src/server/http.ts      the routes: /api/design, /api/generate (Server-Sent Events), /api/photo, /api/config
src/server/auth.ts      who is asking (a Firebase ID token), what the access list grants them, what is left of their runs today
src/server/store.ts     Firestore over REST: the access list and the day's counts
src/web/session.ts      signing in with Google; the gate and the badge both pages show; fetch that says who is asking
src/server/main.ts      the deployed server: the routes and the built front end (vite.config.ts mounts them in dev)
src/web/app.ts          the design tool; compare.ts is the side-by-side page (both use @a2ui/lit's v0.9 renderer)
src/eval.ts             CLI comparison
src/probe/jtbd.ts       can Jev see jobs? (docs/jtbd-probe.md)
src/probe/custom.ts     can Jev tell when a screen needs something the kit cannot draw?
src/probe/design.ts     how does Jev read a DESIGN.md, and what does it mix? (fixtures in src/probe/designs/)
```
