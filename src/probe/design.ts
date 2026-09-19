// How does Jev read a DESIGN.md, and what does it mix when there is none?
//   npm run probe:design                       the bundled designs, plus any paths given
//   npm run probe:design -- --mix "a brief"    mix a DESIGN.md from a brief and print it

import { readFileSync, readdirSync } from "node:fs";
import { parseDesign, readDesign } from "../server/design-md.js";
import { mixDesign } from "../server/design-mix.js";

const args = process.argv.slice(2);

if (args[0] === "--mix") {
  for (const brief of args.slice(1)) {
    const mixed = await mixDesign(brief);
    console.log(`\n=== ${brief}  (${mixed.ms} ms, ${mixed.jevInputTokens} Jev tok)`);
    for (const d of mixed.decisions) console.log(`  ${d.question.padEnd(28)} ${d.answer.padEnd(34)} p=${d.p.toFixed(2)}${d.note ? `  (${d.note})` : ""}`);
    if (args.includes("-v")) console.log(mixed.markdown);
  }
} else {
  const bundled = readdirSync("src/probe/designs").map((f) => `src/probe/designs/${f}`);
  for (const file of [...bundled, ...args]) {
    const design = parseDesign(readFileSync(file, "utf8"));
    const read = await readDesign(design);
    console.log(`\n=== ${design.name}  (${read.ms} ms, ${read.jevInputTokens} Jev tok)`);
    for (const f of design.findings.filter((f) => f.severity !== "info")) console.log(`  ! ${f.severity}: ${f.message}`);
    for (const d of read.decisions) console.log(`  ${d.question.padEnd(28)} ${d.answer.padEnd(34)} p=${d.p.toFixed(2)}${d.note ? `  (${d.note})` : ""}`);
  }
}
