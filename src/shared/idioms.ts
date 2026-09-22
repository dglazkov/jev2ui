// The idioms an app can be imagined in, by name: what both the server and the browser know of one.
//
// An idiom is a grammar that reads the description, a catalog that draws what it says and a stylesheet that paints
// it (docs/grammar.md). The server has the grammar, the catalog and the code behind it (server/idioms.ts); the
// browser has the stylesheets (web/kit/idioms.ts), in src/web/kit, layered in the order named: an idiom that draws
// with the kit's components paints over the kit's sheet. What they share is the names, and the id the surface is
// created with, which says whose catalog its components are drawn by.

export const IDIOMS = {
  kit: { name: "Kit", catalogId: "https://github.com/dglazkov/jev2ui/catalogs/kit/v1", stylesheets: ["kit.css"], offered: true },
  ios: { name: "iOS", catalogId: "https://github.com/dglazkov/jev2ui/catalogs/ios/v1", stylesheets: ["kit.css", "ios.css"], offered: true },
  // Not an app at all: the emails a product sends, a graph with no code behind it, drawn by the kit. It is here to prove the
  // tool runs any grammar, reached by the header and the probes, and not offered to a person imagining an app.
  email: { name: "Email", catalogId: "https://github.com/dglazkov/jev2ui/catalogs/kit/v1", stylesheets: ["kit.css"], offered: false },
} as const;

export type IdiomId = keyof typeof IDIOMS;

export const IDIOM_IDS = Object.keys(IDIOMS) as IdiomId[];

/** The idioms a person is offered to imagine an app in. */
export const OFFERED = IDIOM_IDS.filter((id) => IDIOMS[id].offered);

/** What a browser said it wants, as an idiom: the kit's unless it plainly named another. */
export const idiomNamed = (said: unknown): IdiomId => (typeof said === "string" && said in IDIOMS ? (said as IdiomId) : "kit");

/** Whether a surface created with this id speaks the kit's components, whichever idiom's catalog they are drawn by. */
export const isKitCatalog = (catalogId: unknown): boolean => IDIOM_IDS.some((id) => IDIOMS[id].catalogId === catalogId);
