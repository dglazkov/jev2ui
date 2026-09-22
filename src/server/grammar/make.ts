// From a reading of a graph to what a writer is asked for, and to what is drawn (docs/grammar.md).
//
// A part in a graph file says what it is made of, once. Both halves come from that:
//
//   schemaOf   the fields that are there for this reading and that somebody writes,
//              as the schema a writer fills. Gemini is asked for exactly the slots the tree has.
//   treeOf     the same fields, by the slot each one fills, handed to the pattern the part
//              names, with the answers that turn the pattern's knobs.
//
// Nothing here knows what a list is. What a list looks like is the catalog's business
// (patterns.ts); which of the writer's words is the headline is the graph's.

import type { KitComponent } from "../../shared/kit.js";
import { sourcesOf } from "./fill.js";
import { idOf, pathIn, walk, type Atom, type Field, type Grammar, type Node, type Source } from "./format.js";
import { holdsIn, yieldOf, type Reading, type Value } from "./read.js";

// --- What the writer is asked for ------------------------------------------------

type Schema = Record<string, unknown>;
type Holds = (atoms?: Atom[]) => boolean;

/**
 * A part that is a list of things, and not a thing with a list in it, says so by giving the list its own name and
 * nothing else to write: `facts` is 2–8 rows, where `list` is a heading and its items. Both halves have to agree on
 * which it is, because it decides where the data is.
 */
function wholeOf(node: Node, holds: Holds): Field | undefined {
  const written = node.fields.filter((field) => !field.source && holds(field.when));
  return written.length === 1 && written[0].name === node.name && written[0].list ? written[0] : undefined;
}

const scalar = (type: Field["type"], description?: string): Schema => ({ type: type ?? "string", ...(description ? { description } : {}) });

export function schemaOf(node: Node, reading: Reading): Schema | null {
  const holds = (atoms?: Atom[]) => !atoms || atoms.every((atom) => holdsIn(reading, atom));
  const written = (fields: Field[]) => fields.filter((field) => !field.source && holds(field.when));
  const object = (fields: Field[]): Schema => {
    const shown = written(fields);
    return { type: "object", properties: Object.fromEntries(shown.map((field) => [field.name, schema(field)])), required: shown.filter((f) => !f.optional).map((f) => f.name), propertyOrdering: shown.map((f) => f.name) };
  };
  const schema = (field: Field): Schema => {
    const description = [field.description, ...field.notes.filter((note) => holds(note.when)).map((note) => note.text)].filter(Boolean).join(" ");
    if (field.list) return { type: "array", items: field.element ? scalar(field.element.type, field.element.description) : object(field.fields), ...(description ? { description } : {}), maxItems: field.list.max, minItems: field.list.min };
    return field.fields.length ? object(field.fields) : scalar(field.type, description);
  };
  // A part that arrives whole is not written to a schema of the graph's: what fills it brings its own.
  if (node.filled || !written(node.fields).length) return null;
  const whole = wholeOf(node, holds);
  const content = whole ? schema(whole) : object(node.fields);
  return { type: "object", properties: { [node.name]: content }, required: [node.name], propertyOrdering: [node.name] };
}

// --- What is drawn -----------------------------------------------------------------

/** The fields of a part that are there for this reading, by the slot each fills. */
export interface Bound {
  /** Where the data of every field that claims the slot is, in the order written. */
  all(slot: string): string[];
  one(slot: string): string | undefined;
  /** A list that claims the slot: where it is, and what each of its elements binds, relative to the element. */
  each(slot: string): { path: string; bound: Bound } | undefined;
}

/** What a pattern is told that no graph decides: it comes from the design (mock/plan.ts, applyDesign). */
export interface Look {
  contained: boolean;
  icons: boolean;
  /** The symbol that holds the place of a picture until it has loaded. */
  symbol: string;
}

/** A part already drawn, as the frame needs to know it: its name, and the id of the component at its root. */
export interface DrawnPart {
  name: string;
  root: string;
}

/** What a knob can be set to: the names listed, or, with none listed, anything (a symbol, the name of a part). */
export interface Knob {
  takes: readonly string[];
  is: string;
}

export interface Pattern {
  name: string;
  /** When to use it, in the words a Choice would offer. */
  card: string;
  /** Its slots, as fields: a name, whether it is required, what it is for; nested where a slot is a list of things. */
  slots: Field[];
  knobs: Record<string, Knob>;
  /** `parts` are given to a frame: the parts drawn already, in the order they come. */
  draw(id: string, bound: Bound, knobs: Record<string, Value>, look: Look, parts?: DrawnPart[]): KitComponent[];
}

export type Catalog = Record<string, Pattern>;

/** The fields of several headings, bound together: the frame's slots are filled by the header and the navigation. */
function boundOfAll(nodes: Node[], reading: Reading): Bound {
  const holds = (atoms?: Atom[]) => !atoms || atoms.every((atom) => holdsIn(reading, atom));
  const bind = (fields: Field[], base: string | null, whole?: Field): Bound => {
    const there = fields.filter((field) => field.role && holds(field.when));
    const pathOf = (field: Field) => pathIn(field.source) ?? (base === null ? field.name : field === whole ? base : `${base}/${field.name}`);
    const all = (slot: string) => there.filter((field) => field.role === slot).map(pathOf);
    return {
      all,
      one: (slot) => all(slot)[0],
      each: (slot) => {
        const list = there.find((field) => field.role === slot && field.list);
        return list && { path: pathOf(list), bound: bind(list.fields, null) };
      },
    };
  };
  const each = nodes.map((node) => bind(node.fields, `/${node.name}`, wholeOf(node, holds)));
  return {
    all: (slot) => each.flatMap((b) => b.all(slot)),
    one: (slot) => each.map((b) => b.one(slot)).find((path) => path !== undefined),
    each: (slot) => each.map((b) => b.each(slot)).find((found) => found !== undefined),
  };
}

export const boundOf = (node: Node, reading: Reading): Bound => boundOfAll([node], reading);

/** The answers under a part that turn one of its pattern's knobs, as what they yield. */
export function knobsOf(grammar: Grammar, node: Node, reading: Reading): Record<string, Value> {
  const knobs: Record<string, Value> = {};
  walk(node.children, (child) => {
    const value = reading.values[idOf(child)];
    if (child.target && value !== undefined) knobs[child.target] = yieldOf(grammar, idOf(child), value);
  });
  // What was set where the pattern is named is set whatever was answered.
  return { ...knobs, ...node.fixed };
}

export function treeOf(catalog: Catalog, grammar: Grammar, node: Node, reading: Reading, look: Look): KitComponent[] {
  const pattern = node.target ? catalog[node.target] : undefined;
  return pattern ? pattern.draw(node.name, boundOf(node, reading), knobsOf(grammar, node, reading), look) : [];
}

// --- The frame -----------------------------------------------------------------------

/** The question the kinds are the options of: the one whose options carry a shape. */
export function kindsOf(grammar: Grammar): Node | undefined {
  let found: Node | undefined;
  walk(grammar.nodes, (node) => void (node.asking?.type === "choice" && node.asking.options.some((o) => o.shape) && (found ??= node)));
  return found;
}

/** A trait of a kind, read as a setting of the frame: `sticky actions` sets `sticky` to `actions`; `dialog` alone sets it to yes. */
export function traitKnob(trait: string): [string, string] {
  const [knob, ...value] = trait.split(/\s+/);
  return [knob, value.length ? value.join(" ") : "yes"];
}

/** What is always written and never asked, at the top of a graph or under a question: the header, the navigation. Their fields fill the frame's slots. */
export function contentNodes(grammar: Grammar): Node[] {
  const out: Node[] = [];
  walk(grammar.nodes, (node) => void (!node.block && !node.question && node.fields.length && out.push(node)));
  return out;
}

/**
 * The frame's knobs: what the answers at the top of the graph turn, then what the kinds' heading fixes for every kind,
 * then what the kind that was read says in its traits. Nothing under a part reaches the frame.
 */
export function frameKnobsOf(grammar: Grammar, reading: Reading, knobs: Record<string, Knob>): Record<string, Value> {
  const kinds = kindsOf(grammar);
  const out: Record<string, Value> = {};
  for (const node of grammar.nodes) {
    const value = reading.values[idOf(node)];
    if (node !== kinds && node.target && node.target in knobs && value !== undefined) out[node.target] = yieldOf(grammar, idOf(node), value);
  }
  Object.assign(out, kinds?.fixed);
  const kind = kinds?.asking?.type === "choice" ? kinds.asking.options.find((o) => o.name === reading.kind) : undefined;
  for (const trait of kind?.shape?.traits ?? []) {
    const [knob, value] = traitKnob(trait);
    if (knob in knobs) out[knob] = value;
  }
  return out;
}

/** The frame around the parts, drawn by the pattern the kinds' question names; nothing, for a graph that names none. */
export function frameOf(catalog: Catalog, grammar: Grammar, reading: Reading, look: Look, parts: DrawnPart[]): KitComponent[] | undefined {
  const kinds = kindsOf(grammar);
  const pattern = kinds?.target ? catalog[kinds.target] : undefined;
  if (!pattern) return undefined;
  return pattern.draw("root", boundOfAll(contentNodes(grammar), reading), frameKnobsOf(grammar, reading, pattern.knobs), look, parts);
}

/** Where the data that a tree reads is: every path some component is bound to. A field nothing is bound to is not drawn, and Jev is not asked about it. */
export function boundIn(components: KitComponent[]): Set<string> {
  const paths = new Set<string>();
  const into = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (typeof (value as { path?: unknown }).path === "string") paths.add((value as { path: string }).path);
    Object.values(value).forEach(into);
  };
  components.forEach(into);
  return paths;
}

/** The parts of a reading, in the order its kind puts them. */
export function partsOf(grammar: Grammar, reading: Reading): Node[] {
  const parts: Node[] = [];
  walk(grammar.nodes, (node) => void (node.block && parts.push(node)));
  return reading.blocks.map((block) => parts.find((node) => node.name === block)!).filter(Boolean);
}

// --- Checking a graph against a catalog ----------------------------------------------

/**
 * Whether what a graph says its parts are made of is something the catalog can draw. `catalog` is a catalog file as
 * read (grammar/kit.md), so a graph can be checked by someone who has the two files and none of the code.
 */
export function checkBindings(grammar: Grammar, catalog: Grammar): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const patterns = new Map(catalog.nodes.filter((node) => node.name !== "Sources").map((pattern) => [pattern.name, pattern]));
  const sources = sourcesOf(catalog);
  /** A knob of a pattern as the catalog file has it: what it takes, or anything when it lists nothing. */
  const knobOf = (pattern: Node, name: string) => {
    const knob = pattern.children.find((k) => k.name === name);
    return knob && { takes: knob.asking?.type === "choice" ? knob.asking.options.map((o) => o.name) : [] };
  };
  const checkSetting = (pattern: Node, who: string, knob: string, value: string) => {
    const found = knobOf(pattern, knob);
    if (!found) errors.push(`"${who}" sets "${knob}", and "${pattern.name}" has no such knob`);
    else if (found.takes.length && !found.takes.includes(value)) errors.push(`"${who}" sets "${knob}" to "${value}", and it is one of ${found.takes.join(", ")}`);
  };
  const checkTurns = (pattern: Node, child: Node, top = false) => {
    const found = knobOf(pattern, child.target!);
    // At the top of a graph, an answer may go to something outside the catalog: a token of a DESIGN.md, a writer's word budget.
    if (!found) return void (top ? warnings : errors).push(`"${child.name}" turns "${child.target}", and "${pattern.name}" has no such knob${top ? ": taken for the name of something outside the catalog" : ""}`);
    const asking = child.asking;
    const yields = asking?.type === "choice" ? asking.options.map((o) => o.value ?? o.name) : asking?.type === "noul" ? [asking.yesValue ?? "yes", asking.noValue ?? "no"] : [];
    for (const value of yields) if (found.takes.length && !found.takes.includes(value)) errors.push(`"${child.name}" can yield "${value}", and the "${child.target}" of "${pattern.name}" is one of ${found.takes.join(", ")}`);
  };
  // The frame: named by the kinds' question, set by their traits, turned by the answers at the top of the graph, filled by what is always written.
  const kinds = kindsOf(grammar);
  const frame = kinds?.target ? patterns.get(kinds.target) : undefined;
  if (kinds?.target && !frame) errors.push(`the kinds are framed by "${kinds.target}", which the catalog does not have`);
  if (frame && kinds) {
    for (const [knob, value] of Object.entries(kinds.fixed ?? {})) checkSetting(frame, kinds.name, knob, value);
    if (kinds.asking?.type === "choice") for (const option of kinds.asking.options) for (const trait of option.shape?.traits ?? []) checkSetting(frame, option.name, ...traitKnob(trait));
    for (const node of grammar.nodes) if (node !== kinds && node.target && node.question) checkTurns(frame, node, true);
    for (const node of contentNodes(grammar)) for (const field of node.fields) if (field.role && !frame.fields.some((slot) => slot.name === field.role)) errors.push(`"${node.name}.${field.name}" goes to "${field.role}", and "${frame.name}" has no such slot (it has ${frame.fields.map((s) => s.name).join(", ")})`);
  } else if (kinds?.asking?.type === "choice") {
    for (const option of kinds.asking.options) for (const trait of option.shape?.traits ?? []) warnings.push(`"${option.name}" says "${trait}", and no frame is named to read it`);
  }
  const sure = [...sources].filter(([, traits]) => traits.includes("terminal")).map(([name]) => name);
  const checkChain = (chain: Source | undefined, where: string) => {
    if (!chain?.length) return;
    for (const step of chain) if (!step.name.startsWith("/") && !sources.has(step.name)) errors.push(`"${where}" comes from "${step.name}", which the catalog does not have`);
    const last = chain.at(-1)!;
    const traits = sources.get(last.name) ?? [];
    if (traits.includes("set") || traits.includes("maker")) errors.push(`"${where}" ends in "${last.name}", which can come up empty: end the chain with ${sure.join(" or ")}`);
    for (const step of chain) if (step.by && !sources.get(step.name)?.some((trait) => trait === "set" || trait === "asks")) warnings.push(`"${where}": "by ${step.by}" says where in a set to look, and "${step.name}" is not a set`);
  };
  const checkChains = (fields: Field[], where: string) => fields.forEach((field) => (checkChain(field.source, `${where}${field.name}`), checkChains(field.fields, `${where}${field.name}.`)));
  walk(grammar.nodes, (node) => (checkChain(node.filled, node.name), checkChains(node.fields, `${node.name}.`)));
  walk(grammar.nodes, (node) => {
    if (!node.block) return;
    if (!node.target) return void warnings.push(`nothing draws "${node.name}": it names no pattern`);
    const pattern = patterns.get(node.target);
    if (!pattern) return void errors.push(`"${node.name}" is drawn by "${node.target}", which the catalog does not have`);
    const check = (fields: Field[], slots: Field[], where: string) => {
      for (const field of fields) {
        if (!field.role) continue;
        const slot = slots.find((s) => s.name === field.role);
        if (!slot) errors.push(`"${where}${field.name}" goes to "${field.role}", and "${pattern.name}" has no such slot${slots.length ? ` there (it has ${slots.map((s) => s.name).join(", ")})` : ""}`);
        else if (slot.fields.length) check(field.fields, slot.fields, `${where}${field.name}.`);
      }
      for (const slot of slots) if (slot.required && !fields.some((f) => f.role === slot.name && !f.when)) errors.push(`"${node.name}" fills no "${slot.name}", and "${pattern.name}" cannot be drawn without one`);
    };
    check(node.fields, pattern.fields, `${node.name}.`);
    for (const [knob, value] of Object.entries(node.fixed ?? {})) checkSetting(pattern, node.name, knob, value);
    walk(node.children, (child) => void (child.target && checkTurns(pattern, child)));
  });
  return { errors, warnings };
}
