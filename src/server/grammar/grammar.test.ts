import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STOPS, dial, mixQuestions } from "../design-mix.js";
import { ARCHETYPES, BLOCKS, planQuestions, readPlan } from "../mock/plan.js";
import { files, screenGrammar } from "./export.js";
import { GRAMMAR_DIR, loadGrammar } from "./load.js";
import { checkGrammar, parseGrammar, printGrammar, printRule } from "./format.js";
import { JEV, questionsOf, readGrammar, yieldOf } from "./read.js";
import { planOf } from "./screen-plan.js";

test("the files are what the code asks: run `npm run grammar:export` after changing a question", () => {
  for (const [name, text] of Object.entries(files())) assert.equal(readFileSync(`${GRAMMAR_DIR}${name}`, "utf8"), text, `grammar/${name} is stale`);
});

test("a file read and written again is the same file", () => {
  for (const [name, text] of Object.entries(files())) assert.equal(printGrammar(parseGrammar(text)), text, name);
});

test("what is read from screen.md is what was written, to the last trait", () => {
  const written = screenGrammar();
  const read = parseGrammar(printGrammar(written));
  // A set kept in another file is only named here; its options are read through the link.
  const bare = JSON.parse(JSON.stringify(written), (key, value) => (value?.among ? { ...value, options: [] } : value));
  assert.deepEqual(JSON.parse(JSON.stringify(read)), bare);
});

test("screen.md asks Jev exactly what planQuestions asks", () => {
  assert.deepEqual(questionsOf(loadGrammar("screen.md")), planQuestions());
});

test("paint.md asks Jev exactly what mixQuestions asks", () => {
  assert.deepEqual(questionsOf(loadGrammar("paint.md")), mixQuestions());
});

test("the files pass their own check, and the check says which of them has no examples yet", () => {
  assert.deepEqual(checkGrammar(loadGrammar("screen.md")), { errors: [], warnings: [] });
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

/** A small seeded generator, so a failure can be run again. */
function random(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
}

function answersFrom(rng: () => number): Record<string, any> {
  return Object.fromEntries(
    Object.entries(planQuestions()).map(([id, question]) => {
      if (question.type !== "choice") return [id, { noul: rng() }];
      // Sharpened, so that some answers are near certain and others torn, as Jev's are.
      const weights = Object.keys(question.criteria).map(() => rng() ** 4);
      const total = weights.reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(Object.keys(question.criteria).map((name, i) => [name, weights[i] / total]));
      const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
      return [id, { choice, probabilities }];
    }),
  );
}

test("read from the file, a screen comes out as readPlan makes it: 3000 sets of answers, with and without what is settled beforehand", () => {
  const grammar = loadGrammar("screen.md");
  const rng = random(20260921);
  const some = <T>(all: readonly T[]) => all.filter(() => rng() < 0.4);
  for (let i = 0; i < 3000; i++) {
    const answers = answersFrom(rng);
    const among = rng() < 0.3 ? some(Object.keys(ARCHETYPES)) : undefined;
    const known = { ...(among?.length ? { among } : {}), ...(rng() < 0.3 ? { blocks: some(BLOCKS) } : {}), ...(rng() < 0.4 ? { topLevel: rng() < 0.5 } : {}) };
    const expected = readPlan(answers, known).plan;
    const reading = readGrammar(grammar, answers, JEV, { among: known.among, blocks: known.blocks, ...(known.topLevel !== undefined ? { values: { top_level: known.topLevel } } : {}) });
    assert.deepEqual(planOf(grammar, reading), expected, `case ${i}: ${JSON.stringify(known)}`);
  }
});

test("nothing in the file is there for show: without any one rule, trait or probed threshold, some screen comes out differently", () => {
  const grammar = loadGrammar("screen.md");
  const cases = Array.from({ length: 1500 }, (_, i) => answersFrom(random(i + 1)));
  const plans = (g: typeof grammar, calibration = JEV) => JSON.stringify(cases.map((answers) => planOf(g, readGrammar(g, answers, calibration))));
  const whole = plans(grammar);
  for (const rule of grammar.rules) assert.notEqual(plans({ ...grammar, rules: grammar.rules.filter((r) => r !== rule) }), whole, printRule(rule));
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
