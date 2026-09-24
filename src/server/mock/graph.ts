// The bindings of one idiom's graph: its grammar and its catalog file, read once, and
// what the code around them needs from them (docs/grammar.md).
//
// What a screen is made of is the grammar's: the questions Jev is asked, how the
// answers are read, the parts and their fields, which pattern of the catalog draws
// each, where what nobody writes comes from, and what is decided once the words
// exist. The pipeline (pipeline.ts) asks the file and draws what it says, and holds
// nothing but the reading. What is here is the little that code still has to know
// by name: the kinds of screen and their traits (for change.ts and talk.ts), and
// what stays of a reading the browser sends back. Which idiom's graph a request
// reads is the request's to say (../idioms.ts).

import { idOf, laterOf, walk, type Field, type Grammar, type Node, type Source } from "../grammar/format.js";
import { sourcesOf } from "../grammar/fill.js";
import { yieldOf, type Value } from "../grammar/read.js";

export interface Kind {
  order: string[];
  requires: string[];
  atLeast?: number;
  /** What the kind sets on the frame (`sticky actions`, `dialog`): the frame pattern reads these, not code. */
  traits: string[];
}

export class Graph {
  /** The catalog's sources with their traits, for trying a chain (grammar/fill.ts). */
  readonly sources: Map<string, string[]>;
  /** The parts a screen may have, in the order the file lists them. */
  readonly blocks: string[];
  readonly kinds: Record<string, Kind>;
  private readonly nodes = new Map<string, Node>();
  private readonly parentOf = new Map<Node, Node | undefined>();

  constructor(
    /** The grammar: grammar/screen.md, or one written like it. */
    readonly grammar: Grammar,
    /** The catalog file the grammar names its patterns from: grammar/kit.md, or another idiom's. */
    readonly catalog: Grammar,
  ) {
    this.sources = sourcesOf(catalog);
    walk(grammar.nodes, (node, parent) => (this.nodes.set(node.name, node), this.parentOf.set(node, parent)));
    // The question the kinds of screen are the options of, and the parts under it.
    const kinds = [...this.nodes.values()].find((node) => node.asking?.type === "choice" && node.asking.options.some((o) => o.shape));
    const kindOptions = kinds?.asking?.type === "choice" ? kinds.asking.options : [];
    this.blocks = (kinds?.children ?? []).filter((node) => node.block).map((node) => node.name);
    this.kinds = Object.fromEntries(
      kindOptions.map((option) => {
        const shape = option.shape!;
        return [
          option.name,
          {
            order: shape.parts.map((part) => part.block),
            requires: shape.parts.filter((part) => part.tier === "always").map((part) => part.block),
            ...(shape.atLeast ? { atLeast: shape.atLeast } : {}),
            traits: shape.traits,
          },
        ];
      }),
    );
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

  /** The ratio a custom part's box gets, as its size yields it. */
  ratioOf(size: string): string {
    return String(yieldOf(this.grammar, "custom_size", size));
  }

  /** The part a question is under, if it is under one. */
  private partOf(node: Node): Node | undefined {
    for (let up = this.parentOf.get(node); up; up = this.parentOf.get(up)) if (up.block) return up;
    return undefined;
  }

  /**
   * What stays of a reading the browser sent back, for the parts that stay: every answer that is one the file could have
   * given, under a question at the top of the graph or under one of `blocks`. A browser that still holds a plan of the old
   * shape (an app saved before readings travelled) is read as one.
   */
  keptOf(sent: Record<string, unknown>, blocks: string[]): Record<string, Value> {
    const values = sent.values && typeof sent.values === "object" ? (sent.values as Record<string, unknown>) : "archetype" in sent ? this.valuesOfPlan(sent) : {};
    const out: Record<string, Value> = {};
    walk(this.grammar.nodes, (node) => {
      const id = idOf(node);
      const asking = node.asking;
      if (!asking || laterOf(node) || node.block || !(id in values)) return;
      const part = this.partOf(node);
      if (part && !blocks.includes(part.name)) return;
      const value = values[id];
      const one = asking.type === "noul" ? typeof value === "boolean" : asking.type === "choice" ? typeof value === "string" && asking.options.some((o) => o.name === value) : typeof value === "number";
      if (one) out[id] = value as Value;
    });
    return out;
  }

  /** The old shape, read back into the file's values: kept only for what was saved holding one. */
  private valuesOfPlan(plan: Record<string, any>): Record<string, unknown> {
    const appBar = this.nodes.get("app_bar_action")?.asking;
    const action = appBar?.type === "choice" ? (appBar.options.find((o) => (o.value ?? o.name) === plan.appBarAction)?.name ?? "none") : "none";
    const list = plan.list ?? {};
    const parts: string[] = Array.isArray(list.parts) ? list.parts : [];
    return {
      top_level: plan.topLevel,
      person: plan.person,
      app_bar_action: action,
      list_layout: list.layout,
      item_leading: list.leading,
      item_trailing: list.trailing,
      ...Object.fromEntries(["description", "price", "rating", "status", "time", "progress"].map((part) => [`item_${part}`, parts.includes(part)])),
      search: plan.search,
      stat_deltas: plan.statDeltas,
      facts_total: plan.factsTotal,
      ...(plan.custom ? { custom_use: plan.custom.use, custom_size: plan.custom.size, custom_linked: plan.custom.linked } : {}),
      screen_icon: plan.symbol === "image" ? "none" : plan.symbol,
      hero_subject: plan.pictures?.hero?.subject,
      item_subject: plan.pictures?.items?.subject,
    };
  }
}

/**
 * What an app settles once, on its first screen, and every screen after it is given: the answers to the questions with
 * the trait `app` (a Windows app's silhouette), of those given, each one the file could have given.
 */
export function appAnswers(graph: Graph, values: Record<string, unknown> | undefined): Record<string, Value> {
  const out: Record<string, Value> = {};
  if (!values || typeof values !== "object") return out;
  walk(graph.grammar.nodes, (node) => {
    if (!node.traits.includes("app") || !node.asking) return;
    const id = idOf(node);
    const value = values[id];
    if (node.asking.type === "noul" ? typeof value === "boolean" : node.asking.type === "choice" && typeof value === "string" && graph.optionsOf(id).includes(value)) out[id] = value as Value;
  });
  return out;
}
