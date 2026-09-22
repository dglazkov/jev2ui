// Probe: a graph kept in a file, run on its own examples (docs/grammar.md).
//
// The questions are read from the file and sent to Jev as they stand; the answers
// are read by a reader that knows nothing about what is being made and takes the
// file's word for everything. Each example says how it should come out, and was
// labelled before it was run. One Jev request per example; no Gemini.
//
//   npm run probe:grammar                                 grammar/screen.md
//   npm run probe:grammar -- grammar/examples/email.md    any graph
//   npm run probe:grammar -- -v                           plus what was overruled, and why
//
// For screen.md the answers are also read by readPlan, as the tool does: the two
// plans should be the same plan. Then, without asking anything more, each rule is
// taken out of the file in turn, to see how many of the readings it was holding up.

import { resolve } from "node:path";
import { askJev, JEV_MODEL } from "../server/models.js";
import { readPlan } from "../server/mock/plan.js";
import { checkGrammar, printAtom, printRule, walk } from "../server/grammar/format.js";
import { loadGrammar } from "../server/grammar/load.js";
import { JEV, holdsIn, questionsOf, readGrammar, yieldOf, type Reading } from "../server/grammar/read.js";
import { planOf } from "../server/grammar/screen-plan.js";

const verbose = process.argv.includes("-v");
const file = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const grammar = loadGrammar(file ? resolve(file) : "screen.md");
const isScreen = !file || /(^|\/)grammar\/screen\.md$/.test(file);
const questions = questionsOf(grammar);
const key = grammar.stateKey ?? grammar.name;

console.log(`Jev: ${JEV_MODEL}; ${Object.keys(questions).length} questions read from ${file ?? "grammar/screen.md"}, asked about \`${key}\``);
const { errors, warnings } = checkGrammar(grammar);
for (const problem of errors) console.log(`  error: ${problem}`);
for (const problem of warnings) console.log(`  warning: ${problem}`);
if (errors.length) process.exit(1);
console.log();

const dials: string[] = [];
walk(grammar.nodes, (node) => void (node.asking?.type === "score" && node.asking.levels.every((l) => l.value !== undefined) && dials.push(node.name)));
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const readings = (g: typeof grammar, all: Array<Record<string, any>>) => all.map((answers) => readGrammar(g, answers, JEV)).map(({ kind, blocks, values }) => ({ kind, blocks, values }));

const asked: Array<Record<string, any>> = [];
let claims = 0;
let held = 0;
let whole = 0;
let labelled = 0;
let agree = 0;
for (const example of grammar.examples) {
  const { answers, ms } = await askJev({ [key]: example.text }, questions);
  asked.push(answers);
  const reading: Reading = readGrammar(grammar, answers, JEV);
  const missed = example.expect.filter((atom) => !holdsIn(reading, atom));
  claims += example.expect.length;
  held += example.expect.length - missed.length;
  if (example.expect.length) (labelled++, missed.length || whole++);
  const mark = !example.expect.length ? " " : missed.length ? "✗" : "✓";
  const turned = dials.map((name) => `${name} ${Number(yieldOf(grammar, name, reading.values[name])).toFixed(0)}`).join(" ");
  console.log(`${mark} ${String(Math.round(ms)).padStart(4)} ms  ${example.text.padEnd(64)} ${reading.kind}: ${reading.blocks.join(" ")}${turned ? `  [${turned}]` : ""}`);
  for (const atom of missed) {
    const id = "block" in atom ? `has_${atom.block}` : atom.id;
    const was = "block" in atom ? (reading.p[id] === undefined ? `a ${reading.kind} has no such part` : `Jev said ${reading.p[id].toFixed(2)}`) : `read as ${reading.values[id]}; Jev said ${answers[id]?.choice ?? answers[id]?.noul?.toFixed(2)}`;
    console.log(`           expected ${printAtom(atom)}: ${was}`);
  }
  if (verbose) for (const d of reading.decisions) if (d.note) console.log(`           ${d.id} → ${d.answer}: ${d.note}`);
  if (isScreen) {
    const byHand = readPlan(answers).plan;
    const byFile = planOf(grammar, reading);
    if (same(byHand, byFile)) agree++;
    else {
      // Only where they differ, and what Jev said there, so that a rare one can be understood from the log.
      const differing = Object.keys({ ...byHand, ...byFile }).filter((k) => !same((byHand as any)[k], (byFile as any)[k]));
      console.log(`           readPlan differs in ${differing.join(", ")}`);
      for (const k of differing) console.log(`             ${k}: by hand ${JSON.stringify((byHand as any)[k])}; by file ${JSON.stringify((byFile as any)[k])}`);
      if (differing.includes("symbol")) console.log(`             screen_icon: choice ${answers.screen_icon.choice}; top of the ranking ${Object.entries(answers.screen_icon.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, p]) => `${n} ${p.toFixed(4)}`).join(", ")}`);
    }
  }
}
console.log(`\n${whole}/${labelled} labelled examples came out as labelled; ${held}/${claims} of what they claim`);
if (isScreen) console.log(`${agree}/${grammar.examples.length} plans are the plan readPlan makes of the same answers`);

console.log("\nEach rule taken out of the file in turn, and how many of those readings change:");
const before = readings(grammar, asked);
for (const rule of grammar.rules) {
  const after = readings({ ...grammar, rules: grammar.rules.filter((r) => r !== rule) }, asked);
  const changed = grammar.examples.filter((_, i) => !same(before[i], after[i]));
  console.log(`  ${String(changed.length).padStart(2)}  ${printRule(rule)}${verbose && changed.length ? `\n        ${changed.map((c) => c.text).join("; ")}` : ""}`);
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
  return value;
}
