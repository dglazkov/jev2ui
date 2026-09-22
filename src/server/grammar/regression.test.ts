// What the tool's graph makes of answers nobody gave, recorded (fixtures/screen.json).
//
// grammar/screen.md is the tool's own: editing it changes what the tool makes. So a
// change to it, or to the code that reads it, is meant to show up here, and to be
// looked at. The recording was first made while the hand-written plan.ts, screen.ts
// and refine.ts still existed and the readers were held equal to them, so it is
// their last word as much as the file's.
//
//   RECORD=1 node --import tsx --test src/server/grammar/regression.test.ts    after a change that is meant

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { IDIOMS } from "../idioms.js";
import { applyDesign, type ScreenPlan } from "../mock/plan.js";
import { decide, decorate } from "./decide.js";
import { answersTo, random } from "./fixtures.js";
import { boundIn, frameOf, partsOf, schemaOf, treeOf } from "./make.js";
import { JEV, questionsOf, readGrammar } from "./read.js";
import { planOf } from "./screen-plan.js";

/** What depends on the grammar alone (plans, what is decided) is recorded under its name; what a catalog draws of it (parts), under each idiom's. */
const FIXTURE = new URL("./fixtures/screen.json", import.meta.url);
const fixtureOf = (idiom: string) => new URL(`./fixtures/${idiom}.json`, import.meta.url);
const { graph } = IDIOMS.kit;
const { grammar: SCREEN, kinds: KINDS } = graph;
const readingOf = graph.readingOf.bind(graph);
const partNode = graph.partNode.bind(graph);
const questions = questionsOf(SCREEN);
const kinds = Object.keys(KINDS);
const blocks = SCREEN.nodes.find((n) => n.name === "archetype")!.children.filter((n) => n.block).map((n) => n.name);
const some = <T>(rng: () => number, all: readonly T[]) => all.filter(() => rng() < 0.4);
const WORDS = ["Notifications", "Language", "Autoplay", "Delete account", "10 seconds", "Downloads", "About", "High", "Sign out", "Theme", "Delayed", "Paid"];
const pick = <T>(rng: () => number, from: readonly T[]) => from[Math.floor(rng() * from.length)];
const many = (rng: () => number, min: number, max: number) => Array.from({ length: min + Math.floor(rng() * (max - min + 1)) }, (_, i) => i);

function made() {
  const out: Record<string, unknown> = {};
  // Plans: what a reading of the file comes to, with and without what is settled beforehand.
  out.plans = Array.from({ length: 200 }, (_, i) => {
    const rng = random(1000 + i);
    const answers = answersTo(questions, rng);
    const among = rng() < 0.3 ? some(rng, kinds) : undefined;
    const known = { ...(among?.length ? { among } : {}), ...(rng() < 0.3 ? { blocks: some(rng, blocks) } : {}), ...(rng() < 0.4 ? { values: { top_level: rng() < 0.5 } } : {}) };
    const reading = readGrammar(SCREEN, answers, JEV, known);
    return { seed: 1000 + i, known, plan: planOf(SCREEN, reading), notes: reading.decisions.filter((d) => d.note).map((d) => `${d.id}: ${d.note}`) };
  });
  // What is decided once the words exist, for words nobody wrote.
  out.decided = Array.from({ length: 40 }, (_, i) => {
    const rng = random(3000 + i);
    const plan = planOf(SCREEN, readGrammar(SCREEN, answersTo(questions, rng), JEV));
    const reading = readingOf(plan);
    const content: Record<string, unknown> = {
      groups: many(rng, 1, 3).map(() => ({ title: pick(rng, WORDS), rows: many(rng, 1, 5).map(() => ({ label: pick(rng, WORDS), ...(rng() < 0.5 ? { value: pick(rng, WORDS) } : {}) })) })),
      list: { heading: "Things", items: many(rng, 3, 6).map(() => ({ title: pick(rng, WORDS), subtitle: "A line", ...(rng() < 0.5 ? { status: "Delayed" } : {}) })) },
      stats: many(rng, 2, 5).map(() => ({ label: pick(rng, WORDS), value: "24 kWh", ...(rng() < 0.6 ? { delta: "+12%" } : {}) })),
      banner: { title: pick(rng, WORDS), text: "Something happened." },
      nav: { items: many(rng, 3, 5).map(() => ({ label: pick(rng, WORDS) })), active: 0 },
      actions: many(rng, 1, 2).map(() => ({ label: pick(rng, WORDS) })),
    };
    const icons = rng() < 0.7;
    const bound = new Set(["tone", "icon", "control", "on", "variant", "delta", "/banner/tone"].filter(() => rng() < 0.8));
    const asked = Object.fromEntries(
      Object.entries(content).map(([part, value]) => [
        part,
        decide(SCREEN, partNode(part), value, { description: "Settings screen for a podcast app", reading, calibration: JEV, needed: (path) => (part === "nav" ? icons : bound.has(path)) }).map((a) => {
          const answers = answersTo(a.questions, random(a.outer ?? 0 + 3000 + i));
          const { decorations, decisions } = a.read(answers);
          return { outer: a.outer, state: a.state, questions: Object.keys(a.questions), decorated: decorate(value, decorations), decisions };
        }),
      ]),
    );
    return { seed: 3000 + i, icons, bound: [...bound], asked };
  });
  return out;
}

/** Trees and schemas: what an idiom draws and what is written for every part, under a design that may rule things out. */
function drawn(idiom: (typeof IDIOMS)[keyof typeof IDIOMS]) {
  const { grammar } = idiom.graph;
  const of = questionsOf(grammar);
  return Array.from({ length: 16 }, (_, i) => {
    const rng = random(2000 + i);
    const reading = readGrammar(grammar, answersTo(of, rng), JEV);
    const look = { imagery: rng() < 0.7, icons: rng() < 0.7, contained: rng() < 0.7 };
    const plan = applyDesign(planOf(grammar, reading), look).plan;
    const back = idiom.graph.readingOf(plan);
    const parts = Object.fromEntries(partsOf(grammar, back).map((node) => [node.name, { schema: schemaOf(node, back), tree: treeOf(idiom.patterns, grammar, node, back, { contained: plan.contained, icons: plan.icons, symbol: plan.symbol }) }]));
    const drawing = { contained: plan.contained, icons: plan.icons, symbol: plan.symbol };
    const frame = frameOf(idiom.patterns, grammar, back, drawing, Object.entries(parts).map(([name, part]) => ({ name, root: part.tree[0].id })))!;
    return { seed: 2000 + i, look, plan, parts, header: schemaOf(idiom.graph.partNode("header"), back), nav: schemaOf(idiom.graph.partNode("nav"), back), screen: [...frame, ...Object.values(parts).flatMap((p) => p.tree)] };
  });
}

const RECORD_AGAIN = "If the change is meant, record again: RECORD=1 node --import tsx --test src/server/grammar/regression.test.ts";

test("what the file makes of answers nobody gave is what it made when this was recorded", () => {
  const now = JSON.parse(JSON.stringify(made()));
  if (process.env.RECORD) {
    writeFileSync(FIXTURE, JSON.stringify(now, null, 1));
    return;
  }
  const then = JSON.parse(readFileSync(FIXTURE, "utf8"));
  for (const section of Object.keys(then)) {
    for (const [i, one] of (then[section] as any[]).entries()) {
      assert.deepEqual(now[section][i], one, `${section}[${i}] (seed ${one.seed}) differs from the recording. ${RECORD_AGAIN}`);
    }
  }
});

test("what each idiom draws of the file is what it drew when this was recorded", () => {
  for (const idiom of Object.values(IDIOMS)) {
    const now = JSON.parse(JSON.stringify({ parts: drawn(idiom) }));
    if (process.env.RECORD) {
      writeFileSync(fixtureOf(idiom.id), JSON.stringify(now, null, 1));
      continue;
    }
    const then = JSON.parse(readFileSync(fixtureOf(idiom.id), "utf8"));
    for (const [i, one] of (then.parts as any[]).entries()) {
      assert.deepEqual(now.parts[i], one, `${idiom.id}: parts[${i}] (seed ${one.seed}) differs from the recording. ${RECORD_AGAIN}`);
    }
  }
});

test("every part of the file is drawn by something and every question of it is asked", () => {
  const drawn = new Set<string>();
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const rng = random(i);
    const reading = readGrammar(SCREEN, answersTo(questions, rng), JEV);
    const plan: ScreenPlan = planOf(SCREEN, reading);
    for (const node of partsOf(SCREEN, readingOf(plan))) {
      const tree = treeOf(IDIOMS.kit.patterns, SCREEN, node, readingOf(plan), { contained: true, icons: true, symbol: "image" });
      if (tree.length) drawn.add(node.name);
      for (const path of boundIn(tree)) seen.add(`${node.name}:${path}`);
    }
  }
  assert.deepEqual([...drawn].sort(), [...blocks].sort());
  for (const path of ["list:/list/items", "list:tone", "list:icon", "groups:control", "groups:icon", "stats:delta", "facts:strong", "custom:/custom/use", "actions:variant", "form:kind"]) assert.ok(seen.has(path), path);
});
