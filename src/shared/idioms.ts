// The idioms an app can be imagined in, by name: what both the server and the browser know of one.
//
// An idiom is a grammar that reads the description, a catalog that draws what it says and a stylesheet that paints
// it (docs/grammar.md). The server has the grammar, the catalog and the code behind it (server/idioms.ts); the
// browser has the stylesheets (web/kit/idioms.ts). What they share is the names, and the id the surface is created
// with, which says which catalog its components are of.

export const IDIOMS = {
  kit: { name: "Kit", catalogId: "https://github.com/dglazkov/jev2ui/catalogs/kit/v1", stylesheet: "kit.css" },
} as const;

export type IdiomId = keyof typeof IDIOMS;

export const IDIOM_IDS = Object.keys(IDIOMS) as IdiomId[];

/** What a browser said it wants, as an idiom: the kit's unless it plainly named another. */
export const idiomNamed = (said: unknown): IdiomId => (typeof said === "string" && said in IDIOMS ? (said as IdiomId) : "kit");

/** Whether a surface created with this id speaks the kit's components, whichever idiom's catalog they are drawn by. */
export const isKitCatalog = (catalogId: unknown): boolean => IDIOM_IDS.some((id) => IDIOMS[id].catalogId === catalogId);
