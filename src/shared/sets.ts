// Which set of components a surface speaks, by the catalog id it is created with (components.ts).
//
// Each idiom's catalog brings its own set: the server checks what it sends against it (server/validate.ts), and the
// browser draws it with the drawing registered under the same id (web/sets.ts). A surface whose id names no set here
// speaks A2UI's basic catalog.

import type { ComponentSet } from "./components.js";
import { IDIOMS, type IdiomId } from "./idioms.js";
import { IOS_SET } from "./ios.js";
import { KIT_SET } from "./kit.js";
import { WINDOWS_SET } from "./windows.js";

const OF: Record<IdiomId, ComponentSet> = { kit: KIT_SET, ios: IOS_SET, windows: WINDOWS_SET };

const SETS = new Map<string, ComponentSet>(Object.entries(OF).map(([idiom, set]) => [IDIOMS[idiom as IdiomId].catalogId, set]));

/** The set a surface created with this catalog id speaks, if it is one of ours. */
export const setOf = (catalogId: unknown): ComponentSet | undefined => (typeof catalogId === "string" ? SETS.get(catalogId) : undefined);

/** Adds a set under a catalog id of its own: for a catalog that is not an idiom's, such as a test's. */
export function registerSet(catalogId: string, set: ComponentSet) {
  SETS.set(catalogId, set);
}
