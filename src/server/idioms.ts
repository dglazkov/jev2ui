// The idioms an app can be imagined in, and which one a request is imagined in.
//
// An idiom is a grammar that reads the description, a catalog that draws what it
// says (a file, and the code behind it that draws each pattern), and a stylesheet
// the browser paints it with (shared/idioms.ts, web/kit/idioms.ts). The tool's own
// is grammar/screen.md drawn by the kit (grammar/kit.md, grammar/patterns.ts); another
// idiom may read the same grammar and draw it its own way, since the frame's knobs
// and the patterns' slots are what a grammar says and a catalog interprets
// (docs/grammar.md).
//
// Which one is the person's to say, in a header on every request, the way the
// endpoint that answers System One is (models.ts): everything the request sets
// going is imagined in that one alone, however deep and however late.

import { AsyncLocalStorage } from "node:async_hooks";
import { IDIOMS as NAMED, idiomNamed as idOf, type IdiomId } from "../shared/idioms.js";
import { loadGrammar } from "./grammar/load.js";
import type { Catalog } from "./grammar/make.js";
import { KIT_PATTERNS } from "./grammar/patterns.js";
import { Graph } from "./mock/graph.js";

export interface Idiom {
  id: IdiomId;
  /** What people see it called. */
  name: string;
  /** The grammar and the catalog file, bound: what code needs of them by name. */
  graph: Graph;
  /** The code that draws the catalog's patterns. */
  patterns: Catalog;
  /** The id a surface is created with, which says whose catalog its components are drawn by. */
  catalogId: string;
}

/** Each idiom's files and code. The grammar and the catalog are names in grammar/, or paths under it. */
const OF: Record<IdiomId, { grammar: string; catalog: string; patterns: Catalog }> = {
  kit: { grammar: "screen.md", catalog: "kit.md", patterns: KIT_PATTERNS },
};

/** Every idiom, read once. */
export const IDIOMS: Record<IdiomId, Idiom> = Object.fromEntries(
  (Object.keys(OF) as IdiomId[]).map((id) => [id, { id, name: NAMED[id].name, catalogId: NAMED[id].catalogId, graph: new Graph(loadGrammar(OF[id].grammar), loadGrammar(OF[id].catalog)), patterns: OF[id].patterns }]),
) as Record<IdiomId, Idiom>;

const imagining = new AsyncLocalStorage<Idiom>();

/** What a browser said it wants, as an idiom: the kit's unless it plainly named another. */
export const idiomNamed = (said: unknown): Idiom => IDIOMS[idOf(said)];

/** Everything `work` sets going is imagined in `idiom`, however deep and however late. */
export const imaginedIn = <T>(idiom: Idiom, work: () => T): T => imagining.run(idiom, work);

/** The idiom whatever is being worked on now is imagined in: the kit's, outside any request. */
export const idiom = (): Idiom => imagining.getStore() ?? IDIOMS.kit;
