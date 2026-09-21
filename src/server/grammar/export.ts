// The graphs this tool already has, written out as files (docs/grammar.md).
//
//   npm run grammar:export      writes grammar/*.md
//
// The questions are taken from what is actually asked (planQuestions, mixQuestions)
// and not from the tables behind them, so the files cannot drift from the request.
// What the questions do not say is added here: which question sits under which,
// the tiers of each kind of screen, what an option yields, and the rules that
// readPlan applies by hand. A test holds the files to this (grammar.test.ts).

import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Question, Questions } from "@typesafe-ai/sdk";
import { HUES, STOPS, mixQuestions } from "../design-mix.js";
import { ICON_OPTIONS } from "../mock/icons.js";
import { SUBJECT_OPTIONS } from "../mock/pictures.js";
import { APP_BAR_ACTIONS, ARCHETYPES, BLOCKS, CUSTOM_SIZE, planQuestions, type Block } from "../mock/plan.js";
import { PROMPTS } from "../../probe/custom.js";
import { printGrammar, type Atom, type Example, type Grammar, type Node, type Option, type Rule, type Shape } from "./format.js";
import { GRAMMAR_DIR } from "./load.js";

interface Extra {
  traits?: string[];
  target?: string;
  prose?: string[];
  /** What each option yields, by name; or what each level of a score is worth, in order. */
  values?: Record<string, string> | number[];
  among?: { name: string; href: string };
  shapes?: Record<string, Shape>;
}

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
    children: [],
  };
  if (question.type === "noul") node.asking = { type: "noul", ...(question.criteria?.true != null ? { yes: String(question.criteria.true) } : {}), ...(question.criteria?.false != null ? { no: String(question.criteria.false) } : {}) };
  if (question.type === "choice") {
    const options = Object.entries(question.criteria).map(([option, criteria]): Option => {
      const value = values && !Array.isArray(values) ? values[option] : undefined;
      return { name: option, ...(value !== undefined && value !== option ? { value } : {}), criteria: criteria === null ? null : String(criteria), ...(extra.shapes?.[option] ? { shape: extra.shapes[option] } : {}) };
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

function setOf(name: string, prose: string[], options: Record<string, string | null>): Grammar {
  return { name, prose, options: Object.entries(options).map(([option, criteria]) => ({ name: option, criteria })), nodes: [], rules: [], examples: [] };
}

// --- The screen ------------------------------------------------------------------

const SHAPES: Record<string, Shape> = Object.fromEntries(
  Object.entries(ARCHETYPES).map(([name, a]): [string, Shape] => [
    name,
    {
      parts: a.order.map((block) => ({ block, tier: a.requires?.includes(block) ? "always" : a.expects.includes(block) ? "expected" : "extra" })),
      ...(a.atLeast ? { atLeast: a.atLeast } : {}),
      traits: [...(a.stickyActions ? ["sticky actions"] : []), ...(a.dialog ? ["dialog"] : []), ...(a.outcome ? ["outcome"] : [])],
    },
  ]),
);

const SCREEN_RULES: Rule[] = [
  { when: [{ block: "form", present: true }], then: { block: "actions", present: false }, reason: "a form's submit button is the screen's call to action; a second set of buttons only competes with it" },
  { when: [{ id: "archetype", is: "checkout", not: false }, { block: "form", present: false }], then: { block: "actions", present: true }, reason: "a checkout is where the person commits; with no form to submit, it needs a button to do it with" },
  { when: [{ id: "archetype", is: "confirm", not: false }], then: { id: "top_level", is: "no", not: false }, reason: "a dialog is not a main screen" },
  { when: [{ id: "archetype", is: "result", not: false }], then: { id: "top_level", is: "no", not: false }, reason: "how something went is not a main screen" },
  { when: [{ id: "archetype", is: "confirm", not: false }], then: { id: "app_bar_action", is: "none", not: false }, reason: "a dialog has no top bar" },
  { when: [{ id: "archetype", is: "detail", not: true }], then: { id: "person", is: "no", not: false }, reason: "only a page about one thing can be about one person" },
  { when: [{ id: "item_leading", is: "thumbnail", not: true }], then: { id: "list_layout", is: "rows", not: false }, reason: "picture layouts are for things with a look; anything else is scanned as rows" },
  { when: [{ block: "list", present: false }], then: { id: "custom_linked", is: "no", not: false }, reason: "with no list there are no items for it to draw" },
];

/** The prompts of probe:custom, labelled by hand before they were ever run. Those that could be read either way claim nothing. */
const SCREEN_EXAMPLES: Example[] = PROMPTS.map(([text, custom, use]) => ({
  text,
  expect: custom === null ? [] : [{ block: "custom", present: custom }, ...(use ? [{ id: "custom_use", is: use, not: false } satisfies Atom] : [])],
}));

const UNDER_BLOCK: Partial<Record<Block, string[]>> = {
  filters: ["search"],
  custom: ["custom_use", "custom_size", "custom_linked"],
  stats: ["stat_deltas"],
  list: ["list_layout", "item_leading", "item_trailing", "item_description", "item_price", "item_rating", "item_status", "item_time", "item_progress"],
  facts: ["facts_total"],
};

export function screenGrammar(): Grammar {
  const extras: Record<string, Extra> = {
    archetype: { shapes: SHAPES, prose: ["The order of the parts is not asked. It belongs to the kind of screen, where the best practice lives."] },
    has_banner: { traits: ["never padding"], prose: ["Polaris: banners are for important, often time-sensitive status; use sparingly."] },
    has_custom: { traits: ["never padding"], prose: ["The one part the kit has no component for. What it is gets baked at run time; the graph only knows that it is there, and what it is held to."] },
    custom_size: { values: Object.fromEntries(Object.entries(CUSTOM_SIZE).map(([name, size]) => [name, size.ratio])) },
    list_layout: { prose: ["Cards and grids are for browsing by look; rows are for scanning text (NN/g, Material)."] },
    item_leading: { prose: ["Material 3 list item: the leading slot says what kind of thing each item is."] },
    item_trailing: { prose: ["Material 3 list item trailing slot; HIG disclosure indicators; Material selection controls."] },
    app_bar_action: { values: Object.fromEntries(Object.entries(APP_BAR_ACTIONS).flatMap(([name, a]) => (a.icon ? [[name, a.icon]] : []))), prose: ["Material top app bar: at most a couple of actions, the most used one first. What an option yields is the name of its symbol."] },
    hero_subject: { among: { name: "subjects", href: "subjects.md" } },
    item_subject: { among: { name: "subjects", href: "subjects.md" } },
    screen_icon: { among: { name: "icons", href: "icons.md" } },
  };
  const under = Object.fromEntries(Object.entries(UNDER_BLOCK).map(([block, ids]) => [`has_${block}`, ids]));
  const grammar = grammarOf(
    "screen",
    planQuestions(),
    ["The graph of one screen of an apparition: what kind of screen it is, which parts it has, and what each part is made of. Written out from src/server/mock/plan.ts by `npm run grammar:export`; docs/grammar.md says how to read it."],
    extras,
    under,
    { kinds: "archetype", blocks: BLOCKS },
  );
  grammar.rules = SCREEN_RULES;
  grammar.examples = SCREEN_EXAMPLES;
  return grammar;
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
    "screen.md": printGrammar(screenGrammar()),
    "paint.md": printGrammar(paintGrammar()),
    "icons.md": printGrammar(setOf("icons", ["Material Symbols. The symbols Jev can choose from, wherever a screen, a row, an item or a destination wants one."], ICON_OPTIONS)),
    "subjects.md": printGrammar(setOf("subjects", ["What a picture on a screen can be of. The answer names a shelf of the photo library to look on."], SUBJECT_OPTIONS)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(GRAMMAR_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files())) {
    writeFileSync(`${GRAMMAR_DIR}${name}`, text);
    console.log(`grammar/${name}  ${text.split("\n").length} lines`);
  }
}
