// The idioms an app can be imagined in, by name: what both the server and the browser know of one.
//
// An idiom is a grammar that reads the description, a catalog that draws what it says and a stylesheet that paints
// it (docs/grammar.md). The server has the grammar, the catalog and the code behind it (server/idioms.ts); the
// browser has the stylesheets (web/kit/idioms.ts), in src/web/kit, layered in the order named: an idiom that draws
// with the kit's components paints over the kit's sheet. What they share is the names, and the id the surface is
// created with, which says whose catalog its components are drawn by.
//
// A person picks one for the apps they are about to make, about once a session; an app keeps the one it was made in
// for as long as it lives (web/app.ts). People see it called a grammar.

export const IDIOMS = {
  kit: { name: "Kit", app: "a Kit app", line: "The tool's own components", symbol: "widgets", family: "Phone and tablet", catalogId: "https://github.com/dglazkov/jev2ui/catalogs/kit/v1", stylesheets: ["kit.css"] },
  ios: { name: "iOS", app: "an iOS app", line: "Apple · iPhone", symbol: "phone_iphone", family: "Phone and tablet", catalogId: "https://github.com/dglazkov/jev2ui/catalogs/ios/v1", stylesheets: ["kit.css", "ios.css"] },
} as const;

export type IdiomId = keyof typeof IDIOMS;

export const IDIOM_IDS = Object.keys(IDIOMS) as IdiomId[];

/** What a browser said it wants, as an idiom: the kit's unless it plainly named another. */
export const idiomNamed = (said: unknown): IdiomId => (typeof said === "string" && said in IDIOMS ? (said as IdiomId) : "kit");

/** Whether it names an idiom there is, as a saved app's may not: one saved before there was a choice names none. */
export const isIdiom = (said: unknown): said is IdiomId => typeof said === "string" && said in IDIOMS;

/** Whether a surface created with this id speaks the kit's components, whichever idiom's catalog they are drawn by. */
export const isKitCatalog = (catalogId: unknown): boolean => IDIOM_IDS.some((id) => IDIOMS[id].catalogId === catalogId);
