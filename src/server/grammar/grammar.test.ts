import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STOPS, dial, mixQuestions } from "../design-mix.js";
import { BLOCKS, KINDS, SCREEN } from "../mock/graph.js";
import { files } from "./export.js";
import { answersTo, random } from "./fixtures.js";
import { GRAMMAR_DIR, loadGrammar } from "./load.js";
import { checkGrammar, laterIn, parseGrammar, printGrammar, printRule } from "./format.js";
import { JEV, questionsOf, readGrammar, yieldOf } from "./read.js";
import { planOf } from "./screen-plan.js";
import { readFileSync as read } from "node:fs";

test("the files still written from code are what the code asks and draws: run `npm run grammar:export` after changing a question", () => {
  assert.deepEqual(Object.keys(files()).sort(), ["icons.md", "kit.md", "paint.md", "subjects.md"]);
  for (const [name, text] of Object.entries(files())) assert.equal(readFileSync(`${GRAMMAR_DIR}${name}`, "utf8"), text, `grammar/${name} is stale`);
});

test("a file read and written again is the same file, screen.md and email.md included", () => {
  for (const name of [...Object.keys(files()), "screen.md", "examples/email.md"]) {
    const text = readFileSync(`${GRAMMAR_DIR}${name}`, "utf8");
    assert.equal(printGrammar(parseGrammar(text)), text, name);
  }
});

test("the tool's graph is the file: what the code knows by name is what the file says", () => {
  assert.deepEqual(BLOCKS, ["banner", "hero", "filters", "custom", "stats", "list", "groups", "facts", "prose", "steps", "form", "actions"]);
  assert.deepEqual(Object.keys(KINDS), ["feed", "dashboard", "detail", "guide", "settings", "form", "checkout", "result", "confirm"]);
  assert.deepEqual(KINDS.checkout, { order: ["banner", "custom", "list", "facts", "form", "actions"], requires: [], atLeast: 2, traits: ["sticky actions", "intro"] });
  assert.deepEqual([KINDS.confirm.traits, KINDS.result.traits, KINDS.feed.requires], [["dialog"], ["opening outcome", "leading close"], ["list"]]);
});

test("paint.md asks Jev exactly what mixQuestions asks", () => {
  assert.deepEqual(questionsOf(loadGrammar("paint.md")), mixQuestions());
});

test("the files pass their own check, and the check says which of them has no examples yet", () => {
  // The tool's own graph has three things to be told: two questions that do not say what yes and no look like, and the kind
  // of a form's field, which is still decided by code that is older than the kit (design.ts).
  assert.deepEqual(checkGrammar(loadGrammar("screen.md")), {
    errors: [],
    warnings: [
      '"row_on" does not say what yes and no look like; bare questions come back near even odds',
      '"destructive" does not say what yes and no look like; bare questions come back near even odds',
      '"kind" is decided, and nothing says by what question',
    ],
  });
  assert.deepEqual(checkGrammar(loadGrammar("examples/email.md")), { errors: [], warnings: [] });
  assert.deepEqual(checkGrammar(loadGrammar("paint.md")), { errors: [], warnings: ["the file has no examples, so nothing says its questions are read as they were meant"] });
});

test("the check says what Jev will stumble on", () => {
  const { errors, warnings } = checkGrammar(
    parseGrammar(["# thing", "## kind", "> What is it?", "- **a** — An a.", "  `LIST extra?`", "- **b** — A b.", "  `list`", "### list", "> Are there items?", "#### layout", "> How are they laid out?", "- **rows** — Rows.", "- **grid** — A grid.", "## Rules", "- when list_layout is rows, no list", "## Examples", "- A thing with a list → list"].join("\n")),
  );
  assert.deepEqual(errors, ['"a" has a part "extra" that nothing describes', 'a rule or an example names "list_layout", which is not asked']);
  assert.deepEqual(warnings, ['"has_list" does not say what yes and no look like; bare questions come back near even odds', '"layout" is asked before "has_list" is known, so it should open with "If…"']);
});

// --- The reader, against readPlan ------------------------------------------------

const answersFrom = (rng: () => number) => answersTo(questionsOf(SCREEN), rng);

test("nothing in the file is there for show: without any one rule, trait or probed threshold, some screen comes out differently", () => {
  const grammar = loadGrammar("screen.md");
  const cases = Array.from({ length: 1500 }, (_, i) => answersFrom(random(i + 1)));
  const plans = (g: typeof grammar, calibration = JEV) => JSON.stringify(cases.map((answers) => planOf(g, readGrammar(g, answers, calibration))));
  const whole = plans(grammar);
  // The rules about what is decided once the words exist have a test of their own (decide.test.ts).
  const first = grammar.rules.filter((rule) => !laterIn(grammar, rule));
  assert.equal(first.length, 9);
  void read;
  for (const rule of first) assert.notEqual(plans({ ...grammar, rules: grammar.rules.filter((r) => r !== rule) }), whole, printRule(rule));
  const untraited = parseGrammar(printGrammar(grammar).replaceAll(" (never padding)", ""), (href) => readFileSync(`${GRAMMAR_DIR}${href}`, "utf8"));
  assert.notEqual(plans(untraited), whole, "never padding");
  assert.notEqual(plans(grammar, { ...JEV, questions: {} }), whole, "has_custom, probed");
});

test("a rule says why, where the person can read it", () => {
  const grammar = loadGrammar("screen.md");
  const answers = answersFrom(random(7));
  Object.assign(answers, { archetype: { choice: "checkout", probabilities: { checkout: 1 } }, has_form: { noul: 0.1 }, has_actions: { noul: 0.1 }, has_list: { noul: 0.9 }, has_facts: { noul: 0.9 } });
  const reading = readGrammar(grammar, answers, JEV);
  assert.ok(reading.blocks.includes("actions"));
  assert.match(reading.decisions.find((d) => d.id === "has_actions")!.note!, /^added: a checkout is where the person commits/);
});

test("a score with a value at every level is a dial, read as design-mix reads it", () => {
  const grammar = loadGrammar("paint.md");
  const rng = random(3);
  for (const key of ["vivid", "round", "air"] as const) {
    for (let i = 0; i < 50; i++) {
      const level = rng() * 4;
      assert.equal(yieldOf(grammar, key, level), dial(STOPS[key], level));
    }
  }
  assert.equal(yieldOf(grammar, "hue", "teal"), "185");
  assert.equal(yieldOf(loadGrammar("screen.md"), "custom_size", "tall"), "3:4");
});
