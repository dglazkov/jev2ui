// Where a value comes from when nobody simply writes it (docs/grammar.md).
//
// A chain in a graph file names the catalog's sources in the order to try them:
//
//   filled from shelf else baked else closed
//   - `imageUrl` as picture, from library by item_subject else painted else placeholder
//
// Trying them is all that happens here. What each source does is the host's: asking
// Jev which of a set will do, calling a model to make one to a contract, closing a
// slot. A source that has nothing says so by coming back empty, and the next is tried.
// A chain that ends in a terminal always ends in something, and a lint holds graphs
// to that (make.ts, checkBindings), so no screen waits on a model that may not deliver.

import type { Grammar, Source, Step } from "./format.js";

export interface SourceCard {
  name: string;
  /** `set`: Jev is offered what is in it, and none of these. `maker`: a model makes one. `terminal`: needs no model and cannot fail. */
  traits: string[];
  card: string;
}

/** What this tool can get a value from, as a catalog says it (grammar/kit.md, under Sources). */
export const SOURCES: SourceCard[] = [
  { name: "written", traits: ["maker", "fast"], card: "The small model writes it along with the rest of its part, to the schema the part's fields make. It is what a field is when it says nothing else." },
  { name: "decided", traits: ["asks"], card: "Jev decides it once the words it is about exist: whether a status is bad news, which button is the main one, what control a setting gets." },
  { name: "computed", traits: ["code"], card: "Code works it out from what was written: the last row of a bill is the one the others add up to." },
  { name: "shelf", traits: ["set", "asks"], card: "What this app has had baked before. Jev is offered their cards and 'none of these'. One that is reused has only its data written, by the small model, so the app's map is the same map on every screen." },
  { name: "baked", traits: ["maker", "strong", "slow", "2 tries", "joins shelf"], card: "A stronger model writes the component, to a contract: what the graph decided under the part, in the words its options say to a maker. Checked before it is sent: it parses, it paints with the design's variables only, it reaches for no network; on a second try it is told why the first was refused." },
  { name: "closed", traits: ["terminal"], card: "The slot closes up and the rest of what was made stands." },
  { name: "library", traits: ["set", "asks"], card: "The photo library, on the shelf that `by` names. Jev is offered five photographs by what they show, and 'none of these', because a wrong picture is worse than none." },
  { name: "painted", traits: ["maker", "image", "slow", "joins library"], card: "The image model makes the picture, shot the way its subject says to a maker. The library has it next time." },
  { name: "placeholder", traits: ["terminal"], card: "The painted frame and its symbol stay where the picture would have been." },
];

/** The sources of a catalog file, by what they are. */
export function sourcesOf(catalog: Grammar): Map<string, string[]> {
  const listed = catalog.nodes.find((node) => node.name === "Sources")?.children ?? [];
  return new Map(listed.map((source) => [source.name, source.traits]));
}

export type Filler<T> = (step: Step) => Promise<T | undefined>;

/**
 * Tries a chain. `fresh` is set when the developer asked for the thing to be made again: nothing already had will do,
 * so the sets are passed over. Comes back empty only if the chain does not end in something that cannot fail.
 */
export async function fill<T>(chain: Source, fillers: Record<string, Filler<T>>, sources: ReadonlyMap<string, readonly string[]>, options: { fresh?: boolean } = {}): Promise<{ from: string; value: T } | undefined> {
  for (const step of chain) {
    if (options.fresh && sources.get(step.name)?.includes("set")) continue;
    const filler = fillers[step.name];
    if (!filler) throw new Error(`nothing here knows how to get a value from "${step.name}"`);
    const value = await filler(step);
    if (value !== undefined) return { from: step.name, value };
  }
  return undefined;
}
