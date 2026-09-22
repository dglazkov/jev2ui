import { test } from "node:test";
import assert from "node:assert/strict";
import type { Questions } from "@typesafe-ai/sdk";
import { planQuestions } from "../mock/plan.js";
import { refineActions, refineBanner, refineGroup, refineItems, refineNav, refineStats, type Decoration } from "../mock/refine.js";
import type { Run } from "../run.js";
import { decide, decorate, type Asked, type DecideOptions } from "./decide.js";
import { answersTo, random } from "./fixtures.js";
import { checkGrammar, parseGrammar, walk, type Field, type Grammar, type Node } from "./format.js";
import { loadGrammar } from "./load.js";
import { boundIn, partsOf, treeOf } from "./make.js";
import { KIT_PATTERNS } from "./patterns.js";
import { JEV, readGrammar, type Reading } from "./read.js";

const screen = loadGrammar("screen.md");
const named = (grammar: Grammar, name: string): Node => {
  let found: Node | undefined;
  walk(grammar.nodes, (node) => void (node.name === name && (found = node)));
  return found!;
};
const reading = { kind: "settings", blocks: [], values: {}, p: {}, decisions: [] } as Reading;
const DESCRIPTION = "Settings screen for a podcast app";

/** What refine.ts asked, and the answers it was given: the same answers are then given to the file's questions, in the same order. */
interface Heard {
  state: unknown;
  questions: Questions;
  answers: Record<string, any>;
}

async function byHand(rng: () => number, refine: (run: Run) => Promise<Decoration[]>): Promise<{ heard: Heard[]; decorations: Decoration[] }> {
  const heard: Heard[] = [];
  const run = {
    trace: () => {},
    askJev: async (stage: string, state: unknown, questions: Questions) => {
      const answers = answersTo(questions, rng);
      heard.push({ state, questions, answers });
      return { stage, ms: 0, inputTokens: 0, answers };
    },
  } as unknown as Run;
  return { heard, decorations: await refine(run) };
}

/** Holds one request made from the file to the one refine.ts made, and gives back what comes of the same answers. */
function sameRequest(asked: Asked, heard: Heard, what: string): Decoration[] {
  assert.deepEqual(asked.state, heard.state, `${what}: what Jev reads`);
  assert.deepEqual(Object.values(asked.questions), Object.values(heard.questions), `${what}: what Jev is asked`);
  const theirs = Object.values(heard.answers);
  return asked.read(Object.fromEntries(Object.keys(asked.questions).map((key, n) => [key, theirs[n]]))).decorations;
}

const pick = <T>(rng: () => number, from: readonly T[]) => from[Math.floor(rng() * from.length)];
const some = (rng: () => number, min: number, max: number) => Array.from({ length: min + Math.floor(rng() * (max - min + 1)) }, (_, i) => i);
const WORDS = ["Notifications", "Language", "Autoplay", "Delete account", "10 seconds", "Downloads", "About", "High", "Sign out", "Theme"];
const options = (extra: Partial<DecideOptions> = {}): DecideOptions => ({ description: DESCRIPTION, reading, calibration: JEV, ...extra });
const same = (x: unknown, y: unknown) => String(x).trim().toLowerCase() === String(y).trim().toLowerCase();

test("the rows of a group: asked and read from the file as refineGroup asks and reads them, 400 groups", async () => {
  const rng = random(11);
  let checks = 0;
  let ragged = 0;
  for (let n = 0; n < 400; n++) {
    const groups = some(rng, 1, 3).map(() => ({ title: pick(rng, WORDS), rows: some(rng, 1, 5).map(() => ({ label: pick(rng, WORDS), ...(rng() < 0.3 ? { detail: "One line." } : {}), ...(rng() < 0.5 ? { value: pick(rng, WORDS) } : {}) })) }));
    const icons = rng() < 0.7;
    const g = Math.floor(rng() * groups.length);
    const chosen = rng() < 0.3 ? pick(rng, groups[g].rows).label : undefined;
    const hand = await byHand(rng, (run) => refineGroup(run, DESCRIPTION, g, groups[g], icons, chosen));
    const asked = decide(screen, named(screen, "groups"), groups, options({ needed: (path) => path !== "icon" || icons, known: (field, row) => field.name === "on" && !!chosen && same(row.label, chosen) }));
    assert.equal(asked.length, groups.length, "one request for each group");
    const mine = sameRequest(asked.find((a) => a.outer === g)!, hand.heard[0], `group ${n}`);
    assert.deepEqual(JSON.parse(JSON.stringify(decorate(groups, mine))), JSON.parse(JSON.stringify(decorate(groups, hand.decorations))), `group ${n}`);
    const rows = decorate(groups, mine)[g].rows as unknown as Array<{ control: string; icon?: string; on: boolean }>;
    if (rows.some((row) => row.control === "check")) (checks++, assert.equal(rows.filter((row) => row.control === "check" && row.on).length, 1, "exactly one option is chosen"));
    if (new Set(rows.map((row) => !!row.icon)).size > 1) ragged++;
  }
  assert.ok(checks > 50, `${checks} groups had options to pick among`);
  assert.equal(ragged, 0, "symbols down the edge of a group: all or none");
});

test("the items of a list, the figures that moved, a banner, the navigation and the buttons: each as refine.ts has it", async () => {
  const rng = random(12);
  for (let n = 0; n < 300; n++) {
    const items = some(rng, 3, 6).map(() => ({ title: pick(rng, WORDS), subtitle: "A line", ...(rng() < 0.5 ? { status: "Delayed" } : {}) }));
    const want = { tones: rng() < 0.6, icons: rng() < 0.5 };
    const hand = await byHand(rng, (run) => refineItems(run, DESCRIPTION, items, want));
    const asked = decide(screen, named(screen, "list"), { heading: "Things", items }, options({ needed: (path) => (path === "tone" ? want.tones : path === "icon" ? want.icons : true) }));
    assert.equal(asked.length, hand.heard.length, `items ${n}: asked at all`);
    if (asked.length) assert.deepEqual(JSON.parse(JSON.stringify(decorate({ items }, sameRequest(asked[0], hand.heard[0], `items ${n}`)))), JSON.parse(JSON.stringify(decorate({ items }, hand.decorations))), `items ${n}`);

    const stats = some(rng, 2, 5).map(() => ({ label: pick(rng, WORDS), value: "24 kWh", ...(rng() < 0.6 ? { delta: "+12%" } : {}) }));
    const moved = await byHand(rng, (run) => refineStats(run, DESCRIPTION, stats));
    const news = decide(screen, named(screen, "stats"), stats, options());
    assert.equal(news.length, moved.heard.length, `stats ${n}: asked only if a figure moved`);
    if (news.length) assert.deepEqual(decorate(stats, sameRequest(news[0], moved.heard[0], `stats ${n}`)), decorate(stats, moved.decorations), `stats ${n}`);

    const banner = { title: pick(rng, WORDS), text: "Something happened." };
    const toned = await byHand(rng, (run) => refineBanner(run, DESCRIPTION, banner));
    assert.deepEqual(decorate(banner, sameRequest(decide(screen, named(screen, "banner"), banner, options())[0], toned.heard[0], `banner ${n}`)), decorate(banner, toned.decorations), `banner ${n}`);

    const nav = { items: some(rng, 3, 5).map(() => ({ label: pick(rng, WORDS) })), active: 0 };
    const symbols = await byHand(rng, (run) => refineNav(run, DESCRIPTION, nav.items));
    assert.deepEqual(decorate(nav, sameRequest(decide(screen, named(screen, "nav"), nav, options())[0], symbols.heard[0], `nav ${n}`)), decorate(nav, symbols.decorations), `nav ${n}`);

    const actions = some(rng, 1, 2).map(() => ({ label: pick(rng, WORDS) }));
    const buttons = await byHand(rng, (run) => refineActions(run, DESCRIPTION, actions));
    const decided = decorate(actions, sameRequest(decide(screen, named(screen, "actions"), actions, options())[0], buttons.heard[0], `actions ${n}`));
    assert.deepEqual(decided, decorate(actions, buttons.decorations), `actions ${n}`);
    assert.equal(decided.filter((a: any) => a.variant !== "secondary").length, 1, "one main button");
  }
});

test("Jev is asked about what is drawn: a question is needed when the tree the file makes reads the field it decides", () => {
  const rng = random(13);
  const seen = { tones: 0, icons: 0, deltas: 0 };
  for (let n = 0; n < 1500; n++) {
    const read = readGrammar(screen, answersTo(planQuestions(), rng), JEV);
    const look = { contained: true, icons: rng() < 0.5, symbol: "image" };
    for (const part of partsOf(screen, read)) {
      const bound = boundIn(treeOf(KIT_PATTERNS, screen, part, read, look));
      const v = read.values;
      // What the pipeline works out by hand before it calls refine.ts (mock/pipeline.ts).
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

test("nothing said about a decision is for show: without any rule about the rows, `all or none`, or `one where`, some group comes out differently", async () => {
  const rng = random(14);
  const cases = Array.from({ length: 300 }, () => {
    const groups = [{ title: "Playback", rows: some(rng, 2, 5).map(() => ({ label: pick(rng, WORDS), ...(rng() < 0.5 ? { value: pick(rng, WORDS) } : {}) })) }];
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
  assert.ok(!Object.keys(planQuestions()).some((id) => id.startsWith("row_")));
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
