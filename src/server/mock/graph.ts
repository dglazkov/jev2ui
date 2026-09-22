// The tool's own graph: grammar/screen.md, read once, and what the code around it
// needs from it (docs/grammar.md).
//
// What a screen is made of is the file's: the questions Jev is asked, how the answers
// are read, the parts and their fields, which pattern of the kit draws each, where
// what nobody writes comes from, and what is decided once the words exist. The
// pipeline (pipeline.ts) asks the file and draws what it says. What is here is the
// little that code still has to know by name: the kinds of screen and their traits
// (the frame is not a pattern yet), the options a browser may send back (plan.ts),
// and the way from a plan, which is what the browser holds, back to a reading.

import { walk, type Field, type Grammar, type Node, type Source } from "../grammar/format.js";
import { loadGrammar } from "../grammar/load.js";
import { schemaOf } from "../grammar/make.js";
import { sourcesOf } from "../grammar/fill.js";
import { yieldOf, type Reading } from "../grammar/read.js";
import type { Block, ScreenPlan } from "./plan.js";

export const SCREEN: Grammar = loadGrammar("screen.md");
export const KIT: Grammar = loadGrammar("kit.md");
export const SOURCES = sourcesOf(KIT);

const nodes = new Map<string, Node>();
walk(SCREEN.nodes, (node) => void nodes.set(node.name, node));

/** The heading a thing is under: a part, a question, or what is always written (the header, the navigation). */
export function partNode(name: string): Node {
  const node = nodes.get(name);
  if (!node) throw new Error(`grammar/screen.md has no "${name}"`);
  return node;
}

/** The names of a choice's options, as the file has them. */
export function optionsOf(id: string): string[] {
  const asking = nodes.get(id)?.asking;
  return asking?.type === "choice" ? asking.options.map((o) => o.name) : [];
}

/** What an option says to whoever makes the thing, after its arrow. */
export function toldOf(id: string, option: string): string {
  const asking = nodes.get(id)?.asking;
  return (asking?.type === "choice" && asking.options.find((o) => o.name === option)?.told) || "";
}

/** The question the kinds of screen are the options of, and the parts under it, in the order the file lists them. */
const kinds = [...nodes.values()].find((node) => node.asking?.type === "choice" && node.asking.options.some((o) => o.shape))!;
const kindOptions = kinds.asking?.type === "choice" ? kinds.asking.options : [];
export const BLOCKS = kinds.children.filter((node) => node.block).map((node) => node.name as Block);

export interface Kind {
  order: Block[];
  requires: Block[];
  atLeast?: number;
  /** Commit-style screens keep their call to action pinned to the bottom edge (Material: bottom app bar; HIG: toolbar). */
  stickyActions: boolean;
  dialog: boolean;
  /** Opens with a symbol and a headline saying how it went, in place of an app bar title. */
  outcome: boolean;
}

export const KINDS: Record<string, Kind> = Object.fromEntries(
  kindOptions.map((option) => {
    const shape = option.shape!;
    return [
      option.name,
      {
        order: shape.parts.map((part) => part.block as Block),
        requires: shape.parts.filter((part) => part.tier === "always").map((part) => part.block as Block),
        ...(shape.atLeast ? { atLeast: shape.atLeast } : {}),
        stickyActions: shape.traits.includes("sticky actions"),
        dialog: shape.traits.includes("dialog"),
        outcome: shape.traits.includes("outcome"),
      },
    ];
  }),
);

/** Where a field's value comes from when nobody writes it, as the file says: a picture's chain, the custom part's. */
export function chainOf(part: string, field?: string): Source {
  const node = partNode(part);
  if (!field) return node.filled ?? [];
  let found: Field | undefined;
  const into = (fields: Field[]) => fields.forEach((f) => (f.name === field && (found ??= f), into(f.fields)));
  into(node.fields);
  return found?.source ?? [];
}

// --- From a plan back to a reading -----------------------------------------------------

const EMPTY: Reading = { kind: "", blocks: [], values: {}, p: {}, decisions: [] };

/**
 * A plan is what the browser holds and sends back, and what the design and the developer's word are applied to
 * (plan.ts). What draws a part and what a writer is asked for read a reading, so a plan is read back into one: every
 * value the file could have said, as the plan now has it.
 */
export function readingOf(plan: ScreenPlan): Reading {
  const appBar = nodes.get("app_bar_action")!.asking;
  const action = appBar?.type === "choice" ? (appBar.options.find((o) => (o.value ?? o.name) === plan.appBarAction)?.name ?? "none") : "none";
  const custom = plan.custom ?? { use: optionsOf("custom_use")[0], size: optionsOf("custom_size")[0], linked: false };
  const values: Reading["values"] = {
    archetype: plan.archetype,
    ...Object.fromEntries(BLOCKS.map((block) => [`has_${block}`, plan.blocks.includes(block)])),
    top_level: plan.topLevel,
    person: plan.person,
    app_bar_action: action,
    list_layout: plan.list.layout,
    item_leading: plan.list.leading,
    item_trailing: plan.list.trailing,
    ...Object.fromEntries(ITEM_PARTS.map((part) => [`item_${part}`, plan.list.parts.includes(part)])),
    search: plan.search,
    stat_deltas: plan.statDeltas,
    facts_total: plan.factsTotal,
    custom_use: custom.use,
    custom_size: custom.size,
    custom_linked: custom.linked,
    screen_icon: plan.symbol === "image" ? "none" : plan.symbol,
    hero_subject: plan.pictures.hero.subject,
    item_subject: plan.pictures.items.subject,
  };
  return { kind: plan.archetype, blocks: [...plan.blocks], values, p: { hero_subject: plan.pictures.hero.p, item_subject: plan.pictures.items.p }, decisions: [] };
}

/** The parts of an item that are asked about one by one, in the order the file asks. */
export const ITEM_PARTS = [...nodes.keys()].filter((id) => id.startsWith("item_") && nodes.get(id)!.asking?.type === "noul" && !nodes.get(id)!.traits.length).map((id) => id.slice(5)) as ScreenPlan["list"]["parts"];

/** What a writer is asked for, for one part of a plan; or, before there is a plan, for what is written whatever it turns out to be. */
export function partSchema(part: string, plan: ScreenPlan | null): unknown {
  return schemaOf(partNode(part), plan ? readingOf(plan) : EMPTY);
}

/** What one item of a list is made of, for a baked component that draws the list's items. */
export function itemSchema(plan: ScreenPlan): unknown {
  return (partSchema("list", plan) as any).properties.list.properties.items.items;
}

/** The ratio a custom part's box gets, as its size yields it. */
export const ratioOf = (size: string) => String(yieldOf(SCREEN, "custom_size", size));

