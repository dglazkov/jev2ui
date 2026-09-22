---
name: grammar
description: Write, edit, lint, probe and draw a grammar file (grammar/*.md): the decision graph a Jev-style decision model fills to make a screen, an email or anything with parts. Use when asked to add or change a question, kind, part, field, rule, chain or frame knob in grammar/screen.md, to write a new grammar, or to bind one to a catalog (grammar/kit.md).
---

# Grammar files

A grammar = questions for a decision model (yes/no, choice, score) + how answers are read + what each part is made of + which catalog pattern draws it + where unwritten values come from + what is decided once words exist. `grammar/screen.md` is production: the tool reads it on every run. `grammar/examples/email.md` is a second graph with no code behind it. `grammar/kit.md` is the catalog (patterns, slots, knobs, sources); it and `paint.md`, `icons.md`, `subjects.md` are **generated** (`npm run grammar:export`), never hand-edited. Long form for humans: `docs/writing-a-grammar.md`. Rationale and open problems: `docs/grammar.md`.

## Workflow

1. Read `grammar/kit.md` first (slot and knob names, sources with traits).
2. Edit the `.md`. Keep lines one per statement; the printer must round-trip: `printGrammar(parseGrammar(text)) === text`.
3. Lint: `npm run probe:grammar -- <file>` (runs `checkGrammar` + `checkBindings`, then asks Jev the file's examples, then ablates each rule). Errors abort. Fix warnings unless deliberate.
4. Draw one: `npm run probe:draw -- <file> "<description>" [--paint]` → `out/grammar/<name>.html` (+ `.json`). `--paint` spends money (image model) and adds to `.cache/photos`.
5. Tests: `node --import tsx --test src/server/grammar/*.test.ts src/server/mock/plan.test.ts`.
6. If `grammar/screen.md` changed on purpose: `RECORD=1 node --import tsx --test src/server/grammar/regression.test.ts` (rewrites `src/server/grammar/fixtures/screen.json`), then `npx tsc`, then land per house rules (commit to main, push, redeploy: `PROJECT=jev2ui-3281b2 ./deploy.sh`). Verify live through `runMock` before landing, never only by tests.
7. Never edit generated files. To add a pattern/source: edit `src/server/grammar/patterns.ts` / `fill.ts`, then `npm run grammar:export`.

## Syntax (exact; parser is `src/server/grammar/format.ts`)

| Line | Means |
|---|---|
| `# name` | Graph name = key Jev reads the description under (override: `## Examples (key)`). |
| `> text` before any `##` | Context read before every question. |
| `## id` … `######` | Node. `id` = `[A-Za-z_]\w*`. Nesting = scope: a question under a part applies only when the part is present; a node under a Noul applies when it is yes. |
| `## id (t1, t2)` | Traits. Part: `never padding`. Later question: `once written` \| `of each X in LIST` \| `of each X in LIST with FIELD` \| `within each Y in OUTER` \| `among each X in LIST`. |
| `## id → target` | Answer goes to: a pattern knob (question under a part), a frame knob (top-level question), a pattern (part or kinds), a token (`vivid → accent chroma`). |
| `## id → pattern with knob value, knob value` | Pattern with knobs fixed. |
| `> q` / `> ctx` `>` `> q` | Question; or context + bare `>` + question (any node; later questions are not read under the file's context, so this is their only one). |
| `+ text` / `- text` | Noul yes/no criteria. Prefix `` `value` `` = yield. `-` immediately after `+` is always the "no" line; a blank line ends the pair. |
| `- **name** `` `yield` `` — criteria` | Choice option; yield optional; criteria may be omitted. |
| `  `` `filters? banner? LIST` `` at least 2, sticky actions, intro` | Shape line right after a kind option (indented, opens with backtick). CAPS=always, bare=expected, `?`=extra. Words after: `at least N`, else frame-knob settings (`knob value` or `knob` = yes). |
| `  → text` (indented, after an option) | What a maker is told when this option is the answer. |
| `` `a` `b` `c` `` | Bare options (no criteria). |
| `among [name](file.md)` | Import a set file's options; options written after it override by name. |
| `1. `` `value` `` criteria` | Score level; values on all levels ⇒ dial (interpolated). |
| `- `` `field` `` spec — writer text` | Field. Nest by 2 spaces. Spec words, comma-separated: `number|integer|boolean`, `N–M` (list, en dash), `as slot`, `optional`, `required` (catalog only), `all or none`, `one where <conds>`, `when <conds>`, `decided by <id>`, `computed`, `from /path`, source chain. |
| `  - each type — text` | Scalar element of a list. |
| `  - when <conds> — text` | Extra writer note when conds hold. |
| `→ text` (unindented, under a part) | What a maker is told about the part. |
| `filled from shelf else baked else closed` | Whole part comes from a chain (part must `→ slot`). |
| `## Rules` then `- when A and B, C — reason` | Atoms: `part`, `no part`, `id is v`, `id is not v`, `id is a or b`. Then-part: one part / `no part` / `id is v`. Applied in order. In rules naming a later question, bare names = element fields. Then-value may be a yield (`main is danger`). |
| `## Examples (key)` then `- text → atoms` | Claims in rule-atom form; claim-less examples allowed. |

Chains: `from library by <choice id> else painted else placeholder`. Sources (kit.md ▸ Sources): `set` (shelf, library: Jev picks or "none"; `by` names the shelf), `maker` (baked, painted, written), `terminal` (closed, placeholder), plus `decided`, `computed`. Chain must end in a terminal or a `/path`. `fresh` skips sets.

Frame: kinds question `→ page`. Knobs of `page`: `opening title|person|outcome`, `leading back|close|none`, `action <icon|none>`, `navigation yes|no`, `sticky <part|none>`, `dialog yes|no`, `intro yes|no`, `symbol <icon|none>`. Set by (later wins): top-level `→ knob` answers < kinds-heading `with` < chosen kind's traits. Pattern rule not overridable: main screen (`navigation yes`) ⇒ `leading none`. Slots filled by content nodes (heading with fields, no question): header `as title/subtitle/portrait`, nav `as destinations` (elements `as label/icon`), `as active`.

Later questions (`decided by`): asked per part once written, one request per part or per outer element; only if something drawn binds the field (`boundIn(tree)`); `{X}` in question text = element key (`row_0`). `among` with one element asks nothing. `none` yields nothing unless overridden (`- **none** `` `circle` ``).

Whole-list rule: a part whose only written root field is a list named like the part IS the list (`facts` → `/facts`, elements at `/facts/i`); otherwise `/part/field`.

## Lint messages → fixes

`checkGrammar` errors: asked twice; no question and no fields; choice <2 options (set not read?); score <2 levels; dial needs numbers on all levels; shape/rule/example names undescribed part or unasked id; value not an option / not yes|no; rule on a score; rule then with `or`/`not`; element rule naming non-field; `decided by` non-later question; `by` non-choice. Warnings: bare noul (add ±); sub-part question not opening with "If"; `of each X` without `{X}`; `decided` without `by`; no examples.
`checkBindings` errors: unknown pattern; field → missing slot; required slot unfilled; knob unknown / value not taken; chain source unknown / ends in set or maker; kinds frame unknown; kind trait → unknown knob/value; content field → missing frame slot. Warnings: part names no pattern; `by` on non-set; top-level `→` not a frame knob (may be a token); traits with no frame.

## Wording rules (probed, not opinions)

- Criteria = facts about content with examples on both sides; never design judgments. Bare nouls ≈ 0.5.
- Questions under parts open with "If …" (asked before the part is known).
- Jev reads literally ("a tent" = one item). Label examples before running; read `p` on a miss (≈0.05 wording/label; ≈0.5 one side underdescribed).
- No thresholds in files. Tiers only; `JEV` calibration in `read.ts` (`expected 0.4`, `extra 0.75`, `yes 0.5`, per-question overrides e.g. `has_custom 0.55`, `destructive 0.6`).
- Rules carry reasons; the reason is the trace note. Prefer a shape tier or a criterion over a rule.

## Code API (all in `src/server/grammar/`, tool bindings in `src/server/mock/graph.ts`)

`loadGrammar(fileOrName)` (resolves links); `parseGrammar/printGrammar/checkGrammar`; `questionsOf(g)` → Jev `Questions`; `readGrammar(g, answers, JEV, {among?, blocks?, values?})` → `Reading {kind, blocks, values, p, decisions}`; `yieldOf(g, id, value)`; `schemaOf(node, reading)` → writer JSON schema or null; `treeOf(KIT_PATTERNS, g, node, reading, look)` → kit components; `frameOf(KIT_PATTERNS, g, reading, look, parts:{name,root}[])`; `boundIn(components)` → bound paths; `partsOf(g, reading)`; `checkBindings(g, catalog)`; `fill(chain, fillers, sourcesOf(kit), {fresh})`; `decide(g, part, content, {description, reading, calibration, needed, known})` → `Asked[] {outer?, state, questions, read(answers)→{decorations, decisions}}`; `decorate(content, decorations)`. Tool: `SCREEN`, `KIT`, `KINDS`, `BLOCKS`, `partNode`, `optionsOf`, `toldOf`, `chainOf(part[, field])`, `readingOf(plan)`, `partSchema(part, plan|null)`. Pipeline: `src/server/mock/pipeline.ts` (`runMock`). Every once-written hook must be wrapped in `once`/`asTheyComplete`: a refresh re-fires hooks (a missing `once` looped ~9k Jev calls once).

## Gotchas

- Set files (`icons.md`, `subjects.md`) and `kit.md` are generated; hand edits are overwritten and a test fails when stale.
- `probe:draw` needs a frame: the kinds question must say `→ page` (or `→ page with …`), else it throws.
- Fields come after the `+`/`-` lines with a blank line between, or the first field is read as the "no" line.
- `none` is a real value for closed knobs; don't treat it as unset.
- `email.md`'s `length → word budget` warns (not a frame knob); intended.
- Regression fixture is blunt: it says *what* changed, not whether it's good; the examples probe reads meaning and needs `JEV_API_KEY`.
- Trace labels come from question text; per-element decisions are labelled by the element.
- Form-field kind (`design.ts`) is still code; lint warns `"kind" is decided, and nothing says by what question` on `screen.md` — known.
