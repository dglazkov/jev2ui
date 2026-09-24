// The files that are still written out from code (docs/grammar.md).
//
//   npm run grammar:export      writes grammar/paint.md, kit.md, ios/catalog.md, icons.md, subjects.md
//
// grammar/screen.md is the tool's own graph and is edited by hand: the tool reads it
// (mock/graph.ts). These are not: the paint questions are still asked by
// design-mix.ts from its own tables, a catalog is what its patterns can draw
// (patterns.ts, patterns-ios.ts), and the two sets are lists of assets (Material
// Symbols, the shelves of the photo library). They are taken from what is actually asked and drawn, so they cannot
// drift from it, and a test holds the files to this (grammar.test.ts).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { Question, Questions } from "@typesafe-ai/sdk";
import { HUES, STOPS, mixQuestions } from "../design-mix.js";
import { ICON_OPTIONS } from "../mock/icons.js";
import { SUBJECT_OPTIONS } from "../mock/pictures.js";
import { SUBJECTS } from "../photos/subjects.js";
import { parseGrammar, printGrammar, type Grammar, type Node, type Option, type Shape } from "./format.js";
import { GRAMMAR_DIR } from "./load.js";
import { kitCatalog } from "./patterns.js";
import { iosCatalog } from "./patterns-ios.js";
import { windowsCatalog } from "./patterns-windows.js";

interface Extra {
  traits?: string[];
  target?: string;
  /** What it is made of, as the file says it. */
  made?: string;
  /** For a part that arrives whole: the chain it comes from, as the file says it. */
  filled?: string;
  /** What a maker is told when an option is the answer, by option. */
  told?: Record<string, string>;
  prose?: string[];
  /** What each option yields, by name; or what each level of a score is worth, in order. */
  values?: Record<string, string> | number[];
  among?: { name: string; href: string };
  shapes?: Record<string, Shape>;
}

const fieldsOf = (made: string) => parseGrammar(`## made\n${made}`).nodes[0].fields;

function nodeOf(name: string, question: Question, extra: Extra = {}, block = false): { node: Node; context?: string } {
  const instructions = question.instructions as string | { context: string; question: string };
  const values = extra.values;
  const node: Node = {
    name,
    block,
    traits: extra.traits ?? [],
    ...(extra.target ? { target: extra.target } : {}),
    prose: extra.prose ?? [],
    question: typeof instructions === "string" ? instructions : instructions.question,
    ...(extra.filled ? { filled: parseGrammar(`## part\nfilled ${extra.filled}`).nodes[0].filled } : {}),
    fields: extra.made ? fieldsOf(extra.made) : [],
    children: [],
  };
  if (question.type === "noul") node.asking = { type: "noul", ...(question.criteria?.true != null ? { yes: String(question.criteria.true) } : {}), ...(question.criteria?.false != null ? { no: String(question.criteria.false) } : {}) };
  if (question.type === "choice") {
    const options = Object.entries(question.criteria).map(([option, criteria]): Option => {
      const value = values && !Array.isArray(values) ? values[option] : undefined;
      return { name: option, ...(value !== undefined && value !== option ? { value } : {}), criteria: criteria === null ? null : String(criteria), ...(extra.shapes?.[option] ? { shape: extra.shapes[option] } : {}), ...(extra.told?.[option] ? { told: extra.told[option] } : {}) };
    });
    node.asking = { type: "choice", options, ...(extra.among ? { among: extra.among } : {}) };
  }
  if (question.type === "score") node.asking = { type: "score", levels: question.criteria.map((criteria, i) => ({ ...(Array.isArray(values) ? { value: String(values[i]) } : {}), criteria: String(criteria) })) };
  return { node, ...(typeof instructions === "string" ? {} : { context: instructions.context }) };
}

/** Builds a graph from a request: `under` says which questions sit beneath which heading, and everything not named sits at the top, in the order asked. */
function grammarOf(name: string, questions: Questions, prose: string[], extras: Record<string, Extra>, under: Record<string, string[]>, blocksOf?: { kinds: string; blocks: readonly string[] }): Grammar {
  const contexts = new Set<string>();
  const made = new Map<string, Node>();
  for (const [id, question] of Object.entries(questions)) {
    const block = blocksOf && id.startsWith("has_") && blocksOf.blocks.includes(id.slice(4)) ? id.slice(4) : undefined;
    const { node, context } = nodeOf(block ?? id, question, extras[id], !!block);
    if (context) contexts.add(context);
    made.set(id, node);
  }
  if (contexts.size > 1) throw new Error(`"${name}" is asked in more than one context, and a file has one`);
  const nested = new Set<string>();
  for (const [parent, children] of Object.entries(under)) {
    for (const child of children) {
      made.get(parent)!.children.push(made.get(child)!);
      nested.add(child);
    }
  }
  if (blocksOf) {
    for (const block of blocksOf.blocks) {
      made.get(blocksOf.kinds)!.children.push(made.get(`has_${block}`)!);
      nested.add(`has_${block}`);
    }
  }
  return { name, ...(contexts.size ? { context: [...contexts][0] } : {}), prose, options: [], nodes: [...made].filter(([id]) => !nested.has(id)).map(([, node]) => node), rules: [], examples: [] };
}

function setOf(name: string, prose: string[], options: Record<string, string | null>, told: Record<string, string> = {}): Grammar {
  return { name, prose, options: Object.entries(options).map(([option, criteria]) => ({ name: option, criteria, ...(told[option] ? { told: told[option] } : {}) })), nodes: [], rules: [], examples: [] };
}

// --- The paint -------------------------------------------------------------------

export function paintGrammar(): Grammar {
  const extras: Record<string, Extra> = {
    hue: { traits: ["circular"], values: Object.fromEntries(Object.entries(HUES).map(([name, hue]) => [name, String(hue.angle)])), prose: ["A rubric has two ends and hue is a circle, so hue is a choice among named hues. What an option yields is its angle in OKLCH; the answer is read as the circular mean of the winner and its neighbours."] },
    vivid: { values: STOPS.vivid, target: "accent chroma" },
    round: { values: STOPS.round, target: "corner radius, px" },
    air: { values: STOPS.air, target: "spacing unit, px" },
  };
  return grammarOf(
    "paint",
    mixQuestions(),
    ["The graph of a design mixed from a brief, when the developer brings no DESIGN.md. Written out from src/server/design-mix.ts by `npm run grammar:export`; docs/grammar.md says how to read it."],
    extras,
    { photos: ["photo_look"] },
  );
}

export function files(): Record<string, string> {
  return {
    "kit.md": printGrammar(kitCatalog()),
    "ios/catalog.md": printGrammar(iosCatalog()),
    "windows/catalog.md": printGrammar(windowsCatalog()),
    "paint.md": printGrammar(paintGrammar()),
    "icons.md": printGrammar(setOf("icons", ["Material Symbols. The symbols Jev can choose from, wherever a screen, a row, an item or a destination wants one."], ICON_OPTIONS)),
    "subjects.md": printGrammar(
      setOf(
        "subjects",
        ["What a picture on a screen can be of. The answer names a shelf of the photo library to look on, and, after the arrow, says how such a thing is photographed: the art direction, when a picture has to be made."],
        SUBJECT_OPTIONS,
        Object.fromEntries(Object.entries(SUBJECTS).map(([name, subject]) => [name, subject.shot])),
      ),
    ),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(GRAMMAR_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files())) {
    mkdirSync(dirname(`${GRAMMAR_DIR}${name}`), { recursive: true });
    writeFileSync(`${GRAMMAR_DIR}${name}`, text);
    console.log(`grammar/${name}  ${text.split("\n").length} lines`);
  }
}
