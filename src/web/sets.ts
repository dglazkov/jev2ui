// How each set of components is drawn, by the catalog id a surface is created with (shared/sets.ts).
//
// A drawing is a function per component the set has, called on the general surface (surface.ts), which lends it what
// every set needs: bindings, templates, taps, the slot a baked component runs in. A surface whose catalog id names no
// drawing here is drawn as the kit's, as a screen was before there was a choice.

import type { Component, Out, Scope, Surface } from "./surface.js";
import { IDIOMS, type IdiomId } from "../shared/idioms.js";
import { KIT_DRAWING } from "./kit/components.js";
import { IOS_DRAWING } from "./kit/ios.js";

export type Drawing = Readonly<Record<string, (this: Surface, c: Component, s: Scope) => Out>>;

const OF: Record<IdiomId, Drawing> = { kit: KIT_DRAWING, ios: IOS_DRAWING };

const DRAWINGS = new Map<string, Drawing>(Object.entries(OF).map(([idiom, drawing]) => [IDIOMS[idiom as IdiomId].catalogId, drawing]));

/** How a surface created with this catalog id draws its components. */
export const drawingOf = (catalogId: unknown): Drawing => (typeof catalogId === "string" ? DRAWINGS.get(catalogId) : undefined) ?? KIT_DRAWING;

/** Adds a drawing under a catalog id of its own: for a catalog that is not an idiom's, such as a test's. */
export function registerDrawing(catalogId: string, drawing: Drawing) {
  DRAWINGS.set(catalogId, drawing);
}
