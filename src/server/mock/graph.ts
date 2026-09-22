// The bindings of one idiom's graph: its grammar and its catalog file, read once, and
// what the code around them needs from them (docs/grammar.md).
//
// What a screen is made of is the grammar's: the questions Jev is asked, how the
// answers are read, the parts and their fields, which pattern of the catalog draws
// each, where what nobody writes comes from, and what is decided once the words
// exist. The pipeline (pipeline.ts) asks the file and draws what it says. What is
// here is the little that code still has to know by name: the kinds of screen and
// their traits (for change.ts and talk.ts), the options a browser may send back
// (plan.ts), and the way from a plan, which is what the browser holds, back to a
// reading. Which idiom's graph a request reads is the request's to say (../idioms.ts).

import { walk, type Field, type Grammar, type Node, type Source } from "../grammar/format.js";
import { schemaOf } from "../grammar/make.js";
import { sourcesOf } from "../grammar/fill.js";
import { yieldOf, type Reading } from "../grammar/read.js";
import type { Block, ScreenPlan } from "./plan.js";

export interface Kind {
  order: Block[];
  requires: Block[];
  atLeast?: number;
  /** What the kind sets on the frame (`sticky actions`, `dialog`): the frame pattern reads these, not code. */
  traits: string[];
}

const EMPTY: Reading = { kind: "", blocks: [], values: {}, p: {}, decisions: [] };

export class Graph {
  /** The catalog's sources with their traits, for trying a chain (grammar/fill.ts). */
  readonly sources: Map<string, string[]>;
  /** The parts a screen may have, in the order the file lists them. */
  readonly blocks: Block[];
  readonly kinds: Record<string, Kind>;
  /** The parts of an item that are asked about one by one, in the order the file asks. */
  readonly itemParts: ScreenPlan["list"]["parts"];
  private readonly nodes = new Map<string, Node>();

  constructor(
    /** The grammar: grammar/screen.md, or one written like it. */
    readonly grammar: Grammar,
    /** The catalog file the grammar names its patterns from: grammar/kit.md, or another idiom's. */
    readonly catalog: Grammar,
  ) {
    this.sources = sourcesOf(catalog);
    walk(grammar.nodes, (node) => void this.nodes.set(node.name, node));
    // The question the kinds of screen are the options of, and the parts under it.
    const kinds = [...this.nodes.values()].find((node) => node.asking?.type === "choice" && node.asking.options.some((o) => o.shape))!;
    const kindOptions = kinds.asking?.type === "choice" ? kinds.asking.options : [];
    this.blocks = kinds.children.filter((node) => node.block).map((node) => node.name as Block);
    this.kinds = Object.fromEntries(
      kindOptions.map((option) => {
        const shape = option.shape!;
        return [
          option.name,
          {
            order: shape.parts.map((part) => part.block as Block),
            requires: shape.parts.filter((part) => part.tier === "always").map((part) => part.block as Block),
            ...(shape.atLeast ? { atLeast: shape.atLeast } : {}),
            traits: shape.traits,
          },
        ];
      }),
    );
    this.itemParts = [...this.nodes.keys()].filter((id) => id.startsWith("item_") && this.nodes.get(id)!.asking?.type === "noul" && !this.nodes.get(id)!.traits.length).map((id) => id.slice(5)) as ScreenPlan["list"]["parts"];
  }

  /** The heading a thing is under: a part, a question, or what is always written (the header, the navigation). */
  partNode(name: string): Node {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`the "${this.grammar.name}" grammar has no "${name}"`);
    return node;
  }

  /** The names of a choice's options, as the file has them. */
  optionsOf(id: string): string[] {
    const asking = this.nodes.get(id)?.asking;
    return asking?.type === "choice" ? asking.options.map((o) => o.name) : [];
  }

  /** What a choice's options yield, as the file has them: the name, where an option yields nothing else. */
  yieldsOf(id: string): string[] {
    const asking = this.nodes.get(id)?.asking;
    return asking?.type === "choice" ? asking.options.map((o) => o.value ?? o.name) : [];
  }

  /** What an option says to whoever makes the thing, after its arrow. */
  toldOf(id: string, option: string): string {
    const asking = this.nodes.get(id)?.asking;
    return (asking?.type === "choice" && asking.options.find((o) => o.name === option)?.told) || "";
  }

  /** Where a field's value comes from when nobody writes it, as the file says: a picture's chain, the custom part's. */
  chainOf(part: string, field?: string): Source {
    const node = this.partNode(part);
    if (!field) return node.filled ?? [];
    let found: Field | undefined;
    const into = (fields: Field[]) => fields.forEach((f) => (f.name === field && (found ??= f), into(f.fields)));
    into(node.fields);
    return found?.source ?? [];
  }

  /**
   * A plan is what the browser holds and sends back, and what the design and the developer's word are applied to
   * (plan.ts). What draws a part and what a writer is asked for read a reading, so a plan is read back into one: every
   * value the file could have said, as the plan now has it.
   */
  readingOf(plan: ScreenPlan): Reading {
    const appBar = this.nodes.get("app_bar_action")!.asking;
    const action = appBar?.type === "choice" ? (appBar.options.find((o) => (o.value ?? o.name) === plan.appBarAction)?.name ?? "none") : "none";
    const custom = plan.custom ?? { use: this.optionsOf("custom_use")[0], size: this.optionsOf("custom_size")[0], linked: false };
    const values: Reading["values"] = {
      archetype: plan.archetype,
      ...Object.fromEntries(this.blocks.map((block) => [`has_${block}`, plan.blocks.includes(block)])),
      top_level: plan.topLevel,
      person: plan.person,
      app_bar_action: action,
      list_layout: plan.list.layout,
      item_leading: plan.list.leading,
      item_trailing: plan.list.trailing,
      ...Object.fromEntries(this.itemParts.map((part) => [`item_${part}`, plan.list.parts.includes(part)])),
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

  /** What a writer is asked for, for one part of a plan; or, before there is a plan, for what is written whatever it turns out to be. */
  partSchema(part: string, plan: ScreenPlan | null): unknown {
    return schemaOf(this.partNode(part), plan ? this.readingOf(plan) : EMPTY);
  }

  /** What one item of a list is made of, for a baked component that draws the list's items. */
  itemSchema(plan: ScreenPlan): unknown {
    return (this.partSchema("list", plan) as any).properties.list.properties.items.items;
  }

  /** The ratio a custom part's box gets, as its size yields it. */
  ratioOf(size: string): string {
    return String(yieldOf(this.grammar, "custom_size", size));
  }
}
