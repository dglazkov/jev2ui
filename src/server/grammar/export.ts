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
import { USES } from "../mock/bake.js";
import { CONTROLS, TONES } from "../mock/refine.js";
import { ICON_OPTIONS } from "../mock/icons.js";
import { SUBJECT_OPTIONS } from "../mock/pictures.js";
import { APP_BAR_ACTIONS, ARCHETYPES, BLOCKS, CUSTOM_SIZE, planQuestions, type Block } from "../mock/plan.js";
import { SUBJECTS } from "../photos/subjects.js";
import { PROMPTS } from "../../probe/custom.js";
import { parseGrammar, printGrammar, type Atom, type Example, type Grammar, type Node, type Option, type Rule, type Shape } from "./format.js";
import { GRAMMAR_DIR } from "./load.js";
import { kitCatalog } from "./patterns.js";

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

/** What readPlan does by hand after the thresholds, in the words the file uses. */
const SCREEN_RULES: Rule[] = parseGrammar(`## Rules
- when form, no actions — a form's submit button is the screen's call to action; a second set of buttons only competes with it
- when archetype is checkout and no form, actions — a checkout is where the person commits; with no form to submit, it needs a button to do it with
- when archetype is confirm, top_level is no — a dialog is not a main screen
- when archetype is result, top_level is no — how something went is not a main screen
- when archetype is confirm, app_bar_action is none — a dialog has no top bar
- when archetype is not detail, person is no — only a page about one thing can be about one person
- when item_leading is not thumbnail, list_layout is rows — picture layouts are for things with a look; anything else is scanned as rows
- when no list, custom_linked is no — with no list there are no items for it to draw
- when row_control is value and no value, row_control is nav — a row can only show a value if one was written
- when row_control is switch and value, row_control is value — a row that has a value is not a switch
- when row_control is check, row_icon is none — options to pick among are told apart by their words, and a group with any of them has no symbols
- when row_control is check, no value — which option is chosen is shown by the tick
- when destructive is yes and main is primary, main is danger — if it destroys something, it says so in red
`).rules;

/** The prompts of probe:custom, labelled by hand before they were ever run. Those that could be read either way claim nothing. */
const SCREEN_EXAMPLES: Example[] = PROMPTS.map(([text, custom, use]) => ({
  text,
  expect: custom === null ? [] : [{ block: "custom", present: custom }, ...(use ? [{ id: "custom_use", is: [use], not: false } satisfies Atom] : [])],
}));

/**
 * What each part is made of: what partSchema asks a writer for and what BUILDERS binds, said once. `as` names the slot of
 * the pattern the part is drawn by (patterns.ts); a field with a source is bound but not written. Tests hold both halves.
 */
/** The two chains the tool has, in the order bakeCustom (mock/bake.ts) and Pictures.find (mock/pictures.ts) try them. A test runs each against the code it was read off. */
export const CUSTOM_CHAIN = "from shelf else baked else closed";
const pictureChain = (by: string) => `from library by ${by} else painted else placeholder`;

const MADE_OF: Record<Block, { pattern: string; made: string; filled?: string }> = {
  banner: { pattern: "banner", made: "- `title` as title — What needs attention, in a few words.\n- `text` as text — One sentence of detail.\n- `tone` as tone, decided by banner_tone" },
  hero: { pattern: "picture", made: `- \`imageUrl\` as picture, ${pictureChain("hero_subject")}` },
  filters: {
    pattern: "filters",
    made: "- `searchPlaceholder` as search, when search is yes — Placeholder of the search field.\n- `chips` 3–6, as chips — Filter categories. The first is the one currently selected, usually 'All'.\n  - each — One or two words.",
  },
  custom: { pattern: "slot", filled: CUSTOM_CHAIN, made: "- `items` as items, from /list/items, when custom_linked is yes" },
  stats: {
    pattern: "stats",
    made: [
      "- `stats` 2–6, as stats — Headline numbers.",
      "  - `label` as label — Short label.",
      "  - `value` as value — The figure with its unit, e.g. '24.2 kWh'.",
      "  - `delta` as delta, when stat_deltas is yes — Change against the previous period, signed, e.g. '+12%' or '-0.4 kW'.",
      "  - `tone` as tone, decided by stat_news, when stat_deltas is yes",
    ].join("\n"),
  },
  list: {
    pattern: "collection",
    made: [
      "- `heading` as heading, when archetype is not feed — Heading above the list.",
      "- `actionLabel` as action, when item_trailing is button — One word for the button on every item, e.g. 'Book', 'Add', 'Play'.",
      "- `items` 3–8, as items — The items.",
      "  - `title` as headline — The item's name.",
      "  - `subtitle` as supporting — A short secondary line: category, author, place, variant.",
      "  - `description` as supporting, when item_description is yes — One sentence.",
      "  - `price` as meta, when item_price is yes — Price or amount with currency, e.g. '$24.00'.",
      "  - `rating` number, as rating, when item_rating is yes — Rating out of 5, one decimal.",
      "  - `reviews` as count, when item_rating is yes — Number of reviews, e.g. '128'.",
      "  - `status` as badge, when item_status is yes — One or two words: the item's current state.",
      "  - `time` as meta, when item_time is yes — Short date, time or duration, e.g. 'Today 7:15 pm', '42 min'.",
      "  - `progress` number, as progress, when item_progress is yes — Percent from 0 to 100.",
      "  - `on` boolean, as on, when item_trailing is switch or checkbox — Whether it is currently on or ticked.",
      "  - `tone` as tone, decided by item_tone",
      "  - `icon` as icon, decided by item_icon",
      `  - \`imageUrl\` as picture, ${pictureChain("item_subject")}`,
    ].join("\n"),
  },
  groups: {
    pattern: "groups",
    made: [
      "- `groups` 2–5, as groups — Groups of related settings. The last group holds account-level actions if there are any.",
      "  - `title` as title — Group heading, one or two words.",
      "  - `rows` 1–6, as rows — Rows in this group.",
      "    - `label` as label — The setting or option.",
      "    - `detail` as detail, optional — ONLY if the label needs explaining: one short line.",
      "    - `value` as value, optional — ONLY for a setting with one current value picked from several: that value, e.g. 'English', 'High quality', '15 seconds'. Never for on/off settings.",
      "    - `icon` as icon, decided by row_icon, all or none",
      "    - `control` as control, decided by row_control",
      "    - `on` as on, decided by row_on, one where row_control is check",
    ].join("\n"),
  },
  facts: {
    pattern: "details",
    made: "- `facts` 2–8, as rows — Label-value details.\n  - when facts_total is yes — The last one is the total.\n  - `label` as label — Short label.\n  - `value` as value — Short value.\n  - `strong` as strong, computed",
  },
  prose: { pattern: "prose", made: "- `body` as body — Body text. Simple markdown (bold, short bullet lists) is allowed." },
  steps: { pattern: "steps", made: "- `steps` 2–8, as steps — Ordered steps.\n  - `title` as title — Imperative step title.\n  - `detail` as detail — One or two sentences." },
  form: {
    pattern: "form",
    made: [
      "- `heading` as heading — Heading above the fields.",
      "- `submitLabel` as submit — Label of the submit button.",
      "- `fields` 1–8, as fields — The input fields.",
      "  - `label` as label — Field label.",
      "  - `placeholder` as placeholder — Example of what a person would enter, e.g. 'Jane Appleseed', 'name@example.com'.",
      "  - `options` 2–8, as options, optional — ONLY for fields where the person picks from three or more known choices. Never for yes/no fields.",
      "    - each — Option label.",
      "  - `min` number, as min, optional — ONLY for bounded numeric fields.",
      "  - `max` number, as max, optional — ONLY for bounded numeric fields.",
      "  - `kind` as kind, decided",
    ].join("\n"),
  },
  actions: { pattern: "actions", made: "- `actions` 1–2, as actions — One or two buttons, most important first.\n  - `label` as label — Button label, one to three words.\n  - `variant` as variant, decided by main" },
};

/** What is written for every screen whatever it is made of, and what is written for a main screen: the frame's, not any part's. */
const HEADER = "- `title` — Screen title, at most four words.\n- `subtitle` — One short supporting line.";
const NAV = "- `items` 3–5 — The app's three to five main destinations.\n  - `label` — One word.\n  - `icon` decided by destination_icon\n- `active` integer — Index of the destination this screen belongs to.";

/**
 * What Jev is asked once the words exist: refine.ts, in the words the file uses. Each sits under the part it is about, and
 * its heading says what it is asked of. A test asks them of made-up words both ways and holds the requests, and what
 * comes of the answers, to refine.ts.
 */
const options = (table: Record<string, string>, yields: Record<string, string> = {}) => Object.entries(table).map(([name, criteria]) => `- **${name}**${yields[name] ? ` \`${yields[name]}\`` : ""} — ${criteria}`).join("\n");
const ROW = "`{row}` is a row in the supplied screen and section. Grouped rows can represent content, navigation, settings or actions; use their actual text and context to decide.";
const LATER: Record<string, string> = {
  banner: `#### banner_tone (once written)\n\n> For the person looking at the screen, what kind of news is \`banner\`?\n\n${options(TONES, { neutral: "accent" })}`,
  stats: [
    "#### stat_news (of each stat in stats with delta)",
    "",
    "\"+12%\" is good news for revenue and bad news for an electricity bill.",
    "",
    "> For the person looking at the screen, is the change in {stat} good or bad news?",
    "",
    "- **good** — The figure moved the way the person wants it to.\n- **bad** — The figure moved the way the person does not want.\n- **neutral** — Neither; it is just a change.",
  ].join("\n"),
  list: [
    `#### item_tone (of each item in items)\n\n> For the person looking at the screen, what is the state of {item}?\n\n${options(TONES)}`,
    "#### item_icon (of each item in items)\n\n> Which symbol best stands for {item}?\n\namong [icons](icons.md)\n\n- **none** `circle` — No symbol in the set relates to it.",
  ].join("\n\n"),
  groups: [
    `#### row_control (of each row in rows, within each group in groups)\n\nMaterial: a switch for one on/off setting that takes effect at once. HIG: a disclosure indicator for a row that opens another page.\n\n> ${ROW}\n>\n> What kind of row is {row}?\n\n${options(CONTROLS)}`,
    `#### row_on (of each row in rows, within each group in groups)\n\n> ${ROW}\n>\n> If {row} is an on/off setting, would a typical person have it switched on?`,
    "#### row_icon (of each row in rows, within each group in groups)\n\n> Which symbol best stands for {row}?\n\namong [icons](icons.md)",
  ].join("\n\n"),
  actions: [
    "#### destructive (once written)\n\n> Does the main action of this screen delete, cancel or otherwise destroy something that cannot be recovered?",
    "#### main (among each action in actions)\n\nOne primary action per screen: Material, HIG and Polaris all agree.\n\n> Which button is the main thing the person came to this screen to do?\n\n+ `primary` It is the one.\n- `secondary` It is one of the others.",
  ].join("\n\n"),
  nav: "#### destination_icon (of each destination in items)\n\n> Which symbol best stands for {destination} of the app's main navigation?\n\namong [icons](icons.md)\n\n- **none** `circle` — No symbol in the set relates to it.",
};
const laterOf = (part: string): Node[] => (LATER[part] ? parseGrammar(`## part\n\n${LATER[part]}`).nodes[0].children : []);

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
    ...Object.fromEntries(BLOCKS.map((block) => [`has_${block}`, { target: MADE_OF[block].pattern, made: MADE_OF[block].made }])),
    custom_use: { told: USES },
    has_banner: { target: "banner", made: MADE_OF.banner.made, traits: ["never padding"], prose: ["Polaris: banners are for important, often time-sensitive status; use sparingly."] },
    has_custom: { target: "slot", made: MADE_OF.custom.made, filled: MADE_OF.custom.filled, traits: ["never padding"], prose: ["The one part the kit has no component for. What it is gets baked at run time; the graph only knows that it is there, and what it is held to."] },
    custom_size: { target: "ratio", values: Object.fromEntries(Object.entries(CUSTOM_SIZE).map(([name, size]) => [name, size.ratio])) },
    list_layout: { target: "layout", prose: ["Cards and grids are for browsing by look; rows are for scanning text (NN/g, Material)."] },
    item_leading: { target: "leading", prose: ["Material 3 list item: the leading slot says what kind of thing each item is."] },
    item_trailing: { target: "trailing", prose: ["Material 3 list item trailing slot; HIG disclosure indicators; Material selection controls."] },
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
  const content = (name: string, prose: string, made: string): Node => ({ name, block: false, traits: [], prose: [prose], fields: fieldsOf(made), children: laterOf(name) });
  for (const node of grammar.nodes.find((n) => n.name === "archetype")!.children) node.children.push(...laterOf(node.name));
  grammar.nodes.unshift(content("header", "Written for every screen, before anything about it is known. It is the frame's, which no part draws.", HEADER));
  grammar.nodes.find((node) => node.name === "top_level")!.children.push(content("nav", "Written once for an app, on its first main screen; every main screen after that shows the same one.", NAV));
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
    "kit.md": printGrammar(kitCatalog()),
    "screen.md": printGrammar(screenGrammar()),
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
    writeFileSync(`${GRAMMAR_DIR}${name}`, text);
    console.log(`grammar/${name}  ${text.split("\n").length} lines`);
  }
}
