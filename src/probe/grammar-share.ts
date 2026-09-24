// What an idiom shares with the others: its grammar's kinds, parts, questions and what is always written, its catalog's
// patterns, and its set of components (docs/grammar.md, step 10). A grammar that is meant to differ in structure should
// share little, and each thing it does share wants a reason.
//
//   npm run probe:share                 every idiom against every other
//   npm run probe:share -- windows      one idiom against the others

import { IDIOMS } from "../server/idioms.js";
import { idOf, walk } from "../server/grammar/format.js";
import { kindsOf } from "../server/grammar/make.js";
import { setOf } from "../shared/sets.js";

const said = process.argv[2];
const ids = Object.keys(IDIOMS) as Array<keyof typeof IDIOMS>;

function namesOf(id: keyof typeof IDIOMS) {
  const idiom = IDIOMS[id];
  const { grammar } = idiom.graph;
  const questions = new Set<string>(), parts = new Set<string>(), written = new Set<string>();
  walk(grammar.nodes, (node) => void (node.block ? parts.add(node.name) : node.question ? questions.add(idOf(node)) : node.fields.length && written.add(node.name)));
  const kinds = kindsOf(grammar)?.asking;
  return {
    kinds: new Set(kinds?.type === "choice" ? kinds.options.map((option) => option.name) : []),
    parts,
    questions,
    "always written": written,
    patterns: new Set(Object.keys(idiom.patterns)),
    components: new Set(Object.keys(setOf(idiom.catalogId)?.schemas ?? {})),
  };
}

for (const a of said ? [said as keyof typeof IDIOMS] : ids) {
  const mine = namesOf(a);
  console.log(`\n${a}`);
  for (const [what, names] of Object.entries(mine)) {
    const shared = ids.filter((b) => b !== a).map((b) => {
      const theirs = namesOf(b)[what as keyof typeof mine];
      const both = [...names].filter((name) => theirs.has(name));
      return `${b}: ${both.length ? `${both.length} (${both.slice(0, 8).join(", ")}${both.length > 8 ? ", …" : ""})` : "none"}`;
    });
    console.log(`  ${what.padEnd(16)} ${String(names.size).padStart(3)}   shared with ${shared.join("; ")}`);
  }
}
