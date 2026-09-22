import { test } from "node:test";
import assert from "node:assert/strict";
import { IDIOMS } from "../idioms.js";
import { decide, decorate, type DecideOptions } from "./decide.js";
import { DESIGN_SAYS, answersTo, random } from "./fixtures.js";
import { checkGrammar, parseGrammar, walk, type Field, type Grammar, type Node } from "./format.js";
import { loadGrammar } from "./load.js";
import { boundIn, partsOf, treeOf } from "./make.js";
import { KIT_PATTERNS } from "./patterns.js";
import { JEV, questionsOf, readGrammar, type Reading } from "./read.js";

const { graph } = IDIOMS.kit;
const screen = graph.grammar;
const named = (grammar: Grammar, name: string): Node => {
  let found: Node | undefined;
  walk(grammar.nodes, (node) => void (node.name === name && (found = node)));
  return found!;
};
const reading = { kind: "settings", blocks: [], values: {}, p: {}, decisions: [] } as Reading;
const DESCRIPTION = "Settings screen for a podcast app";

const pick = <T>(rng: () => number, from: readonly T[]) => from[Math.floor(rng() * from.length)];
const many = (rng: () => number, min: number, max: number) => Array.from({ length: min + Math.floor(rng() * (max - min + 1)) }, (_, i) => i);
const WORDS = ["Notifications", "Language", "Autoplay", "Delete account", "10 seconds", "Downloads", "About", "High", "Sign out", "Theme"];
const options = (extra: Partial<DecideOptions> = {}): DecideOptions => ({ description: DESCRIPTION, reading, calibration: JEV, ...extra });

test("a question is needed when the tree the file makes reads the field it decides: the tones and symbols of items, the symbols of rows, the news of a figure", () => {
  const rng = random(13);
  const seen = { tones: 0, icons: 0, deltas: 0 };
  for (let n = 0; n < 1500; n++) {
    const read = readGrammar(screen, answersTo(questionsOf(screen), rng), JEV, { values: { ...DESIGN_SAYS, no_symbols: rng() < 0.5 } });
    const look = { contained: true, icons: read.values.item_leading === "icon" || rng() < 0.5, symbol: "image" };
    for (const part of partsOf(screen, read)) {
      const bound = boundIn(treeOf(KIT_PATTERNS, screen, part, read, look));
      const v = read.values;
      if (part.name === "list") {
        const want = { tones: v.item_status === true || v.item_progress === true, icons: v.item_leading === "icon" && v.list_layout === "rows" };
        assert.deepEqual({ tones: bound.has("tone"), icons: bound.has("icon") }, want, JSON.stringify(v));
        seen.tones += Number(want.tones);
        seen.icons += Number(want.icons);
      }
      if (part.name === "groups") assert.equal(bound.has("icon"), look.icons);
      if (part.name === "stats") (assert.equal(bound.has("tone"), v.stat_deltas === true), (seen.deltas += Number(v.stat_deltas === true)));
    }
  }
  assert.ok(seen.tones > 20 && seen.icons > 5 && seen.deltas > 20, JSON.stringify(seen));
});

test("exactly one option of a picker is chosen, and symbols go down the edge of a group all or none: 400 groups", () => {
  const rng = random(11);
  let checks = 0;
  let ragged = 0;
  for (let n = 0; n < 400; n++) {
    const groups = many(rng, 1, 3).map(() => ({ title: pick(rng, WORDS), rows: many(rng, 1, 5).map(() => ({ label: pick(rng, WORDS), ...(rng() < 0.5 ? { value: pick(rng, WORDS) } : {}) })) }));
    for (const asked of decide(screen, named(screen, "groups"), groups, options())) {
      const rows = decorate(groups, asked.read(answersTo(asked.questions, rng)).decorations)[asked.outer!].rows as unknown as Array<{ control: string; icon?: string; on: boolean }>;
      if (rows.some((row) => row.control === "check")) (checks++, assert.equal(rows.filter((row) => row.control === "check" && row.on).length, 1, "exactly one option is chosen"));
      if (new Set(rows.map((row) => !!row.icon)).size > 1) ragged++;
    }
  }
  assert.ok(checks > 50, `${checks} groups had options to pick among`);
  assert.equal(ragged, 0);
});

test("one button is the main one, and none is asked about when there is only one", () => {
  const rng = random(12);
  for (let n = 0; n < 200; n++) {
    const actions = many(rng, 1, 2).map(() => ({ label: pick(rng, WORDS) }));
    const [asked] = decide(screen, named(screen, "actions"), actions, options());
    assert.equal("main" in asked.questions, actions.length > 1);
    const decided = decorate(actions, asked.read(answersTo(asked.questions, rng)).decorations) as unknown as Array<{ variant: string }>;
    assert.equal(decided.filter((a) => a.variant !== "secondary").length, 1);
  }
});

test("nothing said about a decision is for show: without any rule about the rows, `all or none`, or `one where`, some group comes out differently", async () => {
  const rng = random(14);
  const cases = Array.from({ length: 300 }, () => {
    const groups = [{ title: "Playback", rows: many(rng, 2, 5).map(() => ({ label: pick(rng, WORDS), ...(rng() < 0.5 ? { value: pick(rng, WORDS) } : {}) })) }];
    return { groups, seed: Math.floor(rng() * 1e9) };
  });
  const all = (grammar: Grammar) =>
    JSON.stringify(
      cases.map(({ groups, seed }) => {
        const [asked] = decide(grammar, named(grammar, "groups"), groups, options());
        return decorate(groups, asked.read(answersTo(asked.questions, random(seed))).decorations);
      }),
    );
  const whole = all(screen);
  const about = (grammar: Grammar) => grammar.rules.filter((rule) => [...rule.when, rule.then].some((atom) => "id" in atom && atom.id.startsWith("row_")));
  assert.equal(about(screen).length, 4);
  for (const rule of about(screen)) assert.notEqual(all({ ...screen, rules: screen.rules.filter((r) => r !== rule) }), whole, JSON.stringify(rule.then));
  for (const said of ["allOrNone", "oneWhere"] as const) {
    const changed: Grammar = structuredClone(screen);
    const into = (fields: Field[]): void => fields.forEach((field) => (delete field[said], into(field.fields)));
    into(named(changed, "groups").fields);
    assert.notEqual(all(changed), whole, said);
  }
});

test("what is asked once the words exist is not asked before, and the check knows what such a question needs", () => {
  assert.ok(!Object.keys(questionsOf(screen)).some((id) => id.startsWith("row_")));
  const { errors, warnings } = checkGrammar(
    parseGrammar(
      [
        "# thing",
        "## kind",
        "> What is it?",
        "- **a** — An a.",
        "  `LIST`",
        "- **b** — A b.",
        "  `list`",
        "### list",
        "> Are there items?",
        "+ Yes.",
        "- No.",
        "- `items` 1–3",
        "  - `name`",
        "  - `tone` decided by mood",
        "  - `size` decided",
        "  - `shape` decided by kind",
        "#### mood (of each item in items)",
        "> What is the mood?",
        "- **up** — Up.",
        "- **down** — Down.",
        "## Rules",
        "- when mood is up and no colour, mood is down",
        "## Examples",
        "- A thing",
      ].join("\n"),
    ),
  );
  assert.deepEqual(errors, ['a rule about each item names "colour", which is neither written for one nor a part', '"shape" is decided by "kind", which is not a question asked once the words exist']);
  assert.deepEqual(warnings, ['"mood" is asked of each item and never says {item}, so Jev is not told which one', '"size" is decided, and nothing says by what question']);
});
