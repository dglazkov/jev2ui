# Write a grammar

A grammar is a markdown file that says how to make one kind of thing: a screen, an email, a slide. It holds
the questions a decision model answers, how the answers are read, what each part of the thing is made of,
which pattern of a catalog draws it, where whatever nobody writes comes from, and what is decided once the
words exist. The tool reads `grammar/screen.md` to make screens. You can write your own grammar for
something else, and run it with the same code.

This guide shows you how. For why the format is the way it is, and what it can't say yet, see
[docs/grammar.md](grammar.md).

## Before you begin

You need:

- Node 20 or later, and `npm install` run once.
- A `.env` with `JEV_API_KEY`, and `GEMINI_API_KEY` if you want to draw what you make.
- A catalog to draw with. `grammar/kit.md` is the tool's, and this guide assumes it. Read it once: it lists
  the patterns you can name, the slots each has, and the knobs each can be turned by. `grammar/ios/catalog.md`
  is the same patterns drawn the way iOS draws them; a grammar written for one is read by the other.

Commands you'll use:

```sh
npm run probe:grammar -- path/to/your.md                   # ask Jev the file's examples, and lint it against the kit's catalog
npm run probe:draw -- path/to/your.md "what to make"       # make one thing, into out/grammar/<name>.html
npm run probe:draw -- path/to/your.md "what to make" --catalog ios   # the same, drawn and painted by another idiom
node --import tsx --test src/server/grammar/*.test.ts      # the format's own tests
```

## Key terms

- **Question**: something Jev is asked. Jev doesn't write text. It answers yes or no (a *noul*), picks one
  of a list (a *choice*), or rates on an ordered scale (a *score*).
- **Kind**: which of a few canonical things is being made. A screen is a feed, a dashboard, a form. A
  kind fixes which parts the thing may have, in what order.
- **Part**: a section of the thing: a list, a banner, a form. A part has a question ("is there one?"),
  fields, and a pattern that draws it.
- **Field**: one piece of what a part is made of. A writer writes it, or it comes from somewhere else.
- **Slot** and **knob**: what a pattern takes. A field fills a slot. An answer turns a knob.
- **Chain**: where a field's value comes from when nobody writes it, tried in order until one works.
- **Frame**: what goes around the parts: a bar, a navigation bar, a dialog. The frame is a pattern too.

## Step 1: Start the file

The first line names the grammar. A blockquote after it is what Jev reads before every question. The
name is also what Jev sees the description under, so make it a plain noun.

```markdown
# email

> `email` describes one email that a product sends to one of the people who use it. Work out what that
> email is made of.
```

Then say in a paragraph what the grammar is for. Paragraphs aren't read by Jev; they're for people.

## Step 2: Ask the questions

Every heading from `##` down is a node: a question, a part, or something that's always written. For a
question, the heading is the name the answer comes back under. Use a word or an identifier: letters,
digits and underscores. Put the question in a blockquote.

What comes under the question says what kind of answer it takes.

A yes-or-no question has a `+` line and a `-` line that say what yes and no look like:

```markdown
## person

> Is this screen about one person or account, such as a profile?

+ A user profile, a contact, a member page, an account overview.
- It is about things, data, tasks or settings, or about many people at once.
```

A choice has bold-named options with a criterion each:

```markdown
## tone

> How should this email sound?

- **plain** — A record or a fact, said once and without colour: receipts, codes, confirmations.
- **warm** — A person glad to be writing: welcomes, thanks, invitations.
```

A score has a numbered rubric. Give every level a value in a code span and the score becomes a dial: an
answer between two levels yields a value between theirs.

```markdown
## length → word budget

> How much should this email say?

1. `25` A glance: a code, a one-line confirmation.
2. `60` A few lines around the details or the button.
3. `250` Several sections, each with a little text.
```

### Write criteria Jev can read

Jev reads a situation well and judges design poorly. So:

- Describe the content, not the design. Not "use a card", but "there are a few headline numbers the
  person wants at a glance".
- Give examples on both sides. A bare yes-or-no question comes back near even odds. `+ Results,
  products, people, records.` and `- The screen is about one thing.` come back committed.
- Take the criteria from the design systems the components come from. Material says a switch is for
  a setting that is on or off and takes effect at once; write that as a fact about the row.
- Jev reads wording to the letter. "A tent left in your cart" is one thing, not several things. Test
  your wording with examples (step 9) before you rely on it.

## Step 3: Describe the kinds

One choice is special: the one whose options carry a **shape**, a line in a code span under the option
that lists the parts this kind may have, in the order they come.

```markdown
## kind → page

> What kind of email is this?

- **receipt** — Proof of something bought, booked or billed: an order confirmation, an invoice.
  `prose? items FACTS cta?`
- **alert** — Something happened to the person's account that they must know about now.
  `WARNING prose? facts cta`
- **welcome** — The first email after signing up.
  `hero? PROSE steps cta` at least 2, intro
```

In a shape:

- CAPITALS mean the part is always there, whatever Jev says.
- A bare name means the part is expected: kept at about even odds.
- A `?` means the part is an extra: kept only when Jev is confident.
- `at least N` after the shape pads a thin thing with its likeliest remaining parts up to N.
- Anything else after the shape sets a knob of the frame (step 8).

`→ page` after the heading names the pattern that draws the frame around the parts.

There are no threshold numbers in the file. "Confident" is a fact about whoever answers, and it's kept
beside the reader in code, because a number written into a graph is wrong the moment somebody switches
the model.

## Step 4: Describe the parts

Each part is a heading one level below the kinds' question. Its heading is the part's name, and its
question is whether the part is there. The answer comes back as `has_<name>`.

```markdown
### items → collection

> Does the email show several similar things?

+ Products ordered, articles to read, line items, recommendations.
- It is about one thing, or about the account.
```

`→ collection` names the pattern of the catalog that draws the part. A part that names no pattern isn't
drawn.

A trait can go in parentheses after a part's name:

- `(never padding)`: don't add this part to pad a thin thing. Use it for banners and anything baked.

A question under a part is asked only when the part is there. Because it's asked before anyone knows
that, open it with "If":

```markdown
#### item_price

> If the email shows several similar things, does each one have a price or an amount?

+ Things bought, booked or billed.
- Things read, watched or done.
```

A question under a part can turn a knob of the part's pattern. Say which with `→`, and make the answers
yield what the knob takes:

```markdown
#### item_picture → leading

> If the email shows several similar things, would each one have its own picture?

+ `thumbnail` Products, articles with a lead image, places, films, recipes.
- `none` Line items on an invoice, transactions, tasks, sign-ins.
```

For a choice, put the yield in a code span after the name: `- **strip** \`3:1\` — A thin band.` Without
a yield, the option's name is the value.

## Step 5: Say what each part is made of

After a part's question, leave a blank line, then list the part's fields. A field is a name in a code
span, then what is said about it, then a dash and what the writer is told.

```markdown
- `heading` as heading — A heading above them, in a few words.
- `items` 2–6, as items — The things.
  - `title` as headline — Its name.
  - `subtitle` as supporting — One short line about it.
  - `price` as meta, when item_price is yes — Its price or amount, with currency.
  - `imageUrl` as picture, from library by pictures_of else painted else placeholder
```

What can be said about a field, separated by commas:

| Say | Meaning |
| --- | --- |
| `number`, `integer`, `boolean` | Its type. Without one, it's a string. |
| `2–6` | It's a list of that many. Indent its fields under it, two spaces. |
| `as headline` | Which slot of the pattern it fills. A field with no slot is written but not drawn. |
| `optional` | The writer may leave it out. |
| `when item_price is yes` | It's there only when that holds. Conditions are the same as in rules (step 7). |
| `from library else painted else placeholder` | Where it comes from when nobody writes it (step 6). |
| `decided by item_tone` | Jev decides it once the words exist (step 8). |

Under a list field, `- each — One or two words.` says what each element is when elements are single
values, and `- when facts_total is yes — The last one is the total.` says one more thing to the writer,
only when that holds.

A part that is nothing but a list gives the list the part's own name, and nothing else written:

```markdown
- `facts` 2–6, as rows — Label-and-value details.
  - `label` as label — Short label.
  - `value` as value — Short value.
```

What's always written and never asked, like a header, is a heading with fields and no question. Its
fields fill the frame's slots:

```markdown
## header

- `title` as title — The subject line, as it shows in an inbox.
- `subtitle` as subtitle — The preheader: the one line an inbox shows after the subject.
```

Check the slot names against the pattern in `grammar/kit.md`. The lint tells you when a field goes to a
slot the pattern doesn't have, or when a required slot is left unfilled.

## Step 6: Say where what nobody writes comes from

A field that a writer doesn't write comes from a **chain**: sources of the catalog, tried in order with
`else`, ending in something that can't fail.

```markdown
- `imageUrl` as picture, from library by pictures_of else painted else placeholder
```

The sources are listed at the end of `grammar/kit.md`, under Sources, each with traits:

- A **set** (`shelf`, `library`) is looked in. Jev is offered what's there and "none of these".
  `by <question>` says which answer names the shelf to look on.
- A **maker** (`baked`, `painted`) is a model that makes one, to a contract.
- A **terminal** (`closed`, `placeholder`) needs no model and can't fail.

A chain must end in a terminal. The lint refuses one that ends in a set or a maker, because that could
leave the thing waiting on a model that never delivers.

A field that says `computed` is worked out by the pattern its slot belongs to, once the part is written:
the `details` pattern makes the last row `strong`. Give the field a `when` if there's only sometimes
something to work out (`strong` as strong, computed, when facts_total is yes`).

A whole part can come from a chain, when nothing in the catalog draws it. Say `filled` on a line of its
own, and give the part a slot to arrive in:

```markdown
### code → slot with ratio 3:1

> Does the email exist to hand the person a code they will copy or type somewhere else?

+ A one-time passcode, a verification code, a voucher code.
- There is nothing to copy; the person reads, or presses a button.

→ The code is the whole point of the email: set it very large, in spaced groups, with a line above saying
what it is for and a line below saying how long it lasts.

filled from shelf else baked else closed
```

A line that opens with `→` under a part, or indented under an option, is what the maker is told. Criteria
are for Jev; arrows are for the model that makes the thing.

`with ratio 3:1` after a pattern's name sets one of its knobs for good, without asking.

## Step 7: Add rules

Some things can't be said with nesting and tiers. Put them under `## Rules`, one flat form each, applied
in the order written, with the reason after a dash. The reason is what a person reads in the trace when
the rule overrules Jev.

```markdown
## Rules

- when code, no hero — an email opened to copy a code is read in two seconds
- when no items, facts_total is no — a total needs lines to be the total of
- when archetype is checkout and no form, actions — with no form to submit, it needs a button to commit with
```

A condition is a part (`code`), a missing part (`no hero`), or an answer (`kind is receipt`,
`kind is not receipt`, `item_trailing is switch or checkbox`). Join conditions with `and`. What follows
the comma is one part, one missing part, or one answer set to one value.

There's no `else`, no `or` between conditions, and no nesting. If you find yourself wanting them, the
knowledge probably belongs in a kind's shape or a question's criteria instead.

### Facts nobody is asked

A rule can read a fact that comes from outside the graph, such as what the design says. Write it as a
question with the trait `given`: it's never sent to Jev, whoever runs the graph supplies the answer, and
a yes-or-no that nobody supplies is no. So phrase a given as the exception, so that silence changes nothing.
`screen.md` has three (`no_photographs`, `no_symbols`, `no_cards`), which the tool gives from the DESIGN.md,
and its rules say what a design without photographs takes off the screen:

```markdown
## no_photographs (given)

> Does the design say there are no photographs?

+ Its prose says there are no photographs, or that its pictures are drawn.
- It shows photographs, or says nothing about it.

## Rules

- when no_photographs is yes, no hero — the design has no photographs, so nothing leads with one
```

## Step 8: Decide things once the words exist

Some questions can't be answered until the words are written: is "Degraded" bad news, is "Auto-download"
a switch or a page. These are questions like any other, under the part they're about, but their heading
says what they're asked of:

| Heading | Asked of |
| --- | --- |
| `#### banner_tone (once written)` | The part's words, once. |
| `#### row_control (of each row in rows)` | Each element of the list `rows`. Say `{row}` in the question where the element goes. |
| `#### row_on (of each row in rows, within each group in groups)` | Each element of a list inside a list: one request per group. |
| `#### stat_news (of each stat in stats with delta)` | Only the elements that have a `delta`. |
| `#### main (among each action in actions)` | One question whose options are the elements themselves. |

Then say which field the question decides:

```markdown
- `control` as control, decided by row_control
- `icon` as icon, decided by row_icon, all or none
- `on` as on, decided by row_on, one where row_control is check
```

- `all or none`: every element gets a value or none does. Symbols down the edge of a group.
- `one where …`: among the elements where that holds, exactly one is yes: the likeliest, or the one
  already known to be.

A question asked once the words exist is asked only if something that's drawn reads the field it decides.
You don't say that; it's found out from the tree.

Such a question can have its own context, because it isn't read under the file's: two blockquotes with a
bare `>` between them, the first being what Jev reads first. (Any node can have one; these need it.)

Rules can be about the elements. In a rule that names one of these questions, a bare name is what was
written for the element: `when row_control is value and no value, row_control is nav`. A rule can also
set what an answer yields: `when destructive is yes and main is primary, main is danger`.

### Set the frame

The frame is drawn by the pattern the kinds' question names (`## kind → page`). Its knobs are set three
ways, later ones winning:

1. A top-level question with `→ knob`: `## top_level → navigation`, `## person → opening`.
2. The kinds' heading, for every kind: `## kind → page with leading none, intro yes`.
3. A kind's traits after its shape: `sticky actions`, `leading close`, `dialog`. A word alone means yes.

The frame's slots are filled by what's always written: the header's `as title`, the navigation's
`as destinations`.

## Step 9: Give examples

Examples are things the grammar was written to read, each with how it should come out, in the words
rules use. Label them before you run them, so they test the grammar and not your memory of what it did.

```markdown
## Examples

- Your one-time sign-in code → kind is verify, code, no hero, no items
- Weekly digest of the five most-read design articles → kind is newsletter, items, item_picture is yes
- Find a dog walker: nearby walkers with ratings
```

An example with no claim is still something to run. `## Examples (screen)` names the key Jev reads the
text under; without one, it's the grammar's name.

Run them:

```sh
npm run probe:grammar -- grammar/examples/email.md
```

Each example prints what it came out as, and for each claim that failed, what Jev said instead. Then
each rule is taken out in turn to show how many readings it was holding up. A rule that holds nothing up
is either redundant or untested.

When an example fails, read Jev's number before you change anything. A miss at 0.05 is the wording or the
label; a miss at 0.48 is a question that doesn't say enough about one side.

## Step 10: Check and draw

The lint runs first in both probes. Errors stop the run; warnings don't.

Errors mean the file can't be read as meant: a part in a shape that nothing describes, a rule naming an
answer that isn't asked, a chain ending in a maker, a field going to a slot the pattern doesn't have, a
kind's trait setting a knob the frame doesn't have.

Warnings are the format's own scars. Take them seriously:

- "does not say what yes and no look like": add `+` and `-` lines.
- "is asked before … is known, so it should open with If": it's under a part.
- "is asked of each row and never says {row}": Jev isn't told which one.
- "is decided, and nothing says by what question": add `by <question>`.
- "names no pattern": nothing will draw it. Name one, or `filled` a chain.

Then draw one:

```sh
npm run probe:draw -- grammar/examples/email.md "Order confirmation for two pairs of sneakers"
```

Jev reads the description and mixes a design for it, the tree is sent, one writer per part fills it, the
chains are tried, and what's decided once the words exist is decided. The result is a page that stands
alone in `out/grammar/`. Pictures are made only with `--paint`, because a made picture costs something
and joins the library.

## Run your grammar in the tool

The tool runs any app grammar, not only its own: an **idiom** is a grammar, a catalog and a stylesheet.
People call it the grammar and choose it in the bar, as a preset that new apps are made in; an app keeps the
one it was made in for life, so a grammar never has to survive being switched to over screens another grammar
read, and has no reason to copy `screen.md`. `grammar/ios/screen.md` is one, a graph of its own written from
the Human Interface Guidelines. To add yours: name it in
`src/shared/idioms.ts` (its name, the id its surfaces are created with, its stylesheets in the order they
layer), give it a grammar, a catalog file and the code that draws the patterns in `src/server/idioms.ts`,
bundle its stylesheet in `src/web/kit/idioms.ts`, have `src/server/grammar/export.ts` write its catalog
file if it has its own, and record what it draws (`RECORD=1 node --import tsx --test
src/server/grammar/regression.test.ts`). Two things are still the tool's and not the grammar's: a content
node called `header` is written first, and one called `nav` is where the app's destinations land.

## Change the tool's own grammar

`grammar/screen.md` is what the tool makes screens from. Editing it changes what the tool makes. After
an edit that's meant:

1. Run the probes on it. `npm run probe:grammar` runs its 30 labelled examples.
2. Run the tests. `regression.test.ts` compares what the file makes of a recorded set of answers with
   what it made before, and fails on any difference.
3. If the difference is the one you meant, record again:
   `RECORD=1 node --import tsx --test src/server/grammar/regression.test.ts`.

The other files under `grammar/` are written out from code by `npm run grammar:export`. Don't edit
those by hand; a test fails if they go stale.

## Syntax reference

| Line | Meaning |
| --- | --- |
| `# name` | The grammar's name, and the key Jev reads the description under. |
| `> text` (before any heading) | What Jev reads before every question. |
| `## name` … `###### name` | A question, or a part, or what's always written. Nesting is scope. |
| `## name (trait, trait)` | Traits: `never padding` on a part; `once written`, `of each x in list`, `among each x in list` on a later question. |
| `## name → target` | Where the answer goes: a knob, a pattern, a token. |
| `## name → pattern with knob value, knob value` | A pattern, with knobs set for good. |
| `> question` | What Jev is asked. Two blockquotes with a bare `>` between: context, then question. |
| `+ text` / `- text` | Yes and no. Open with a code span to say what each yields. |
| `- **name** \`yield\` — criteria` | An option of a choice. |
| `  \`part PART part?\` at least 2, trait` | A kind's shape, on the line after its option. |
| `  → text` | What a maker is told when this option is the answer. |
| `\`a\` \`b\` \`c\`` | Options with no criteria, as in a set file. |
| `among [name](file.md)` | Import a set file's options. Options listed after it override. |
| `1. \`value\` criteria` | A level of a score. Values on every level make it a dial. |
| `- \`field\` spec — description` | A field. Nest with two spaces. |
| `  - each type — description` | What each element of a list is, when elements are single values. |
| `  - when … — text` | One more thing to tell the writer, when that holds. |
| `→ text` | What a maker is told about the part. |
| `filled chain` | The whole part comes from a chain. |
| `## Rules` then `- when a and b, c — reason` | A rule. |
| `## Examples (key)` then `- text → a, b` | An example and its claims. |

A set file is a `# name`, a paragraph, and options with no heading. Look at `grammar/icons.md`.

A catalog file is a `# name`, then a `## pattern` per pattern with its card as a paragraph, its slots as
fields (`required` where the pattern can't be drawn without one), and a `### knob` per knob with what it
takes as bare options, or a sentence and no options when it takes any name; then `## Sources`. Look at
`grammar/kit.md`. Catalog files are written out from code; to add a pattern, add it to
`src/server/grammar/patterns.ts`.

A catalog, the grammar it reads and the stylesheet that paints it are an **idiom**, and the tool offers one per
app. To add one: name it in `src/shared/idioms.ts` (its name, the id its surfaces are created with, its
stylesheets in the order they layer), give it a grammar, a catalog file and the code that draws the patterns in
`src/server/idioms.ts`, bundle its stylesheet in `src/web/kit/idioms.ts`, have `src/server/grammar/export.ts`
write its catalog file, and record what it draws (`RECORD=1 node --import tsx --test
src/server/grammar/regression.test.ts`). `src/server/grammar/patterns-ios.ts` is the example: the kit's patterns
with a `page` of its own, and `src/web/kit/ios.css` over `kit.css`.
