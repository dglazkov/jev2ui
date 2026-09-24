// An app, saved: everything the browser holds of a session (web/app.ts), so that opening it again, by whoever has
// the link, shows what was made and calls no model. It carries the design it was painted with, read and all, and
// its screens carry their messages, which are everything there is to know about them, baked components included.
//
// A saved app does not change: its id is a hash of what it is and whose (server/apps.ts), and saving a session
// that has moved on makes another. Where the person was standing in it is not what it is: `stack` is kept, not hashed. Whether others may open it is beside the app, and its owner's to change.

import { ARCHITECTURE, ROUTES } from "./architecture.js";
import { IDIOM_IDS, type IdiomId } from "./idioms.js";
import { z } from "zod";

const MESSAGE = z.record(z.unknown());

export const SAVED_SCREEN = z.object({
  destination: z.string().max(40).optional(),
  subject: z.string().max(2000).optional(),
  routes: ROUTES.optional(),
  links: z.record(z.string().max(40)).refine((v) => Object.keys(v).length <= 200).optional(),
  id: z.number().int().positive(),
  /** Every way this screen is reached: `start`, `nav:Saved`, `3:item:Il Corvo Pasta`. */
  keys: z.array(z.string().max(400)).min(1).max(40),
  title: z.string().max(200),
  archetype: z.string().max(80),
  topLevel: z.boolean(),
  dialog: z.boolean(),
  messages: z.array(MESSAGE).min(1).max(400),
  /** The trace, as the tool showed it. */
  log: z.array(z.record(z.unknown())).max(200),
  stats: z.record(z.unknown()).optional(),
  firstPaintMs: z.number().optional(),
  builtWith: z.string().max(200).optional(),
  /** The plan it was built from (shared/events.ts), so that it can be made again with one part changed and the rest as it is. */
  plan: z.record(z.unknown()).optional(),
  /** What it was made from, so that whoever opens the app can have it made again. */
  request: z.object({ prompt: z.string().max(4000), journey: z.record(z.unknown()).optional(), fresh: z.boolean().optional(), notes: z.array(z.string().max(2000)).max(12).optional(), edit: z.object({ plan: z.record(z.unknown()), blocks: z.array(z.string().max(40)).max(20) }).optional() }),
});

/** A turn of the chat that made the app (shared/turn.ts), as the browser showed it: what was said, and what came of it. */
export const SAVED_TURN = z.object({
  id: z.number().int().positive(),
  source: z.enum(["typed", "tap", "button"]),
  said: z.string().max(4000),
  /** The screen it made, or was about. */
  screen: z.number().int().positive().optional(),
  on: z.string().max(200).optional(),
  outcome: z.enum(["made", "changed", "said", "failed"]),
  lines: z.array(z.object({ what: z.string().max(200), from: z.string().max(200), to: z.string().max(200) })).max(40),
  text: z.string().max(2000).optional(),
  options: z.array(z.object({ label: z.string().max(200), instruction: z.string().max(2000) })).max(6).optional(),
  decisions: z.array(z.record(z.unknown())).max(80),
  ms: z.number().optional(),
  endpoint: z.enum(["jev", "gev"]).optional(),
});

export const SAVED_APP = z.object({
  /** 3 adds the app map and canonical screen bindings; 2 adds chat and design changes; 1 predates chat. */
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  architecture: ARCHITECTURE.optional(),
  /** The description the session started from. */
  app: z.string().min(1).max(4000),
  nav: z.object({ items: z.array(z.object({ label: z.string(), icon: z.string().optional() })) }).optional(),
  design: z.object({ choice: z.string().max(20), markdown: z.string().max(1 << 20), seed: z.number(), change: z.record(z.unknown()).optional(), report: z.record(z.unknown()).optional() }),
  /** The idiom the app was imagined in (shared/idioms.ts); one saved before there was a choice is the kit's. */
  idiom: z.enum(IDIOM_IDS as [IdiomId, ...IdiomId[]]).optional(),
  turns: z.array(SAVED_TURN).max(400).optional(),
  screens: z.array(SAVED_SCREEN).min(1).max(80),
  /** The ids of the screens that were showing, the way back first. */
  stack: z.array(z.number().int().positive()).min(1).max(40),
}).superRefine((app, context) => {
  if (app.version === 3 && !app.architecture) context.addIssue({ code: "custom", message: "An app map is required for version 3." });
  if (!app.architecture) return;
  const bound = new Set<string>();
  for (const screen of app.screens) {
    const node = app.architecture.map.nodes.find((n) => n.id === screen.destination);
    if (!node || bound.has(node.id)) { context.addIssue({ code: "custom", message: "Each screen must bind to a unique map destination." }); continue; }
    bound.add(node.id);
    if (screen.links && Object.values(screen.links).some((id) => !app.architecture!.map.nodes.some((n) => n.id === id))) context.addIssue({ code: "custom", message: "Saved link points outside the catalog." });
    if (screen.routes && (screen.routes.revision !== app.architecture.revision || Object.values(screen.routes.controls).some((r) => r.kind === "action" && !node.actions.some((a) => a.id === r.action)))) context.addIssue({ code: "custom", message: "Screen controls must belong to the saved map revision." });
  }
});

export type SavedScreen = z.infer<typeof SAVED_SCREEN>;
export type SavedApp = z.infer<typeof SAVED_APP>;
export type SavedTurn = z.infer<typeof SAVED_TURN>;

export type Visibility = "private" | "link";

/** What is kept beside a saved app, and listed in its owner's library. */
export interface SavedAbout {
  id: string;
  /** The description it started from. */
  title: string;
  /** The title of its first screen, and the colours it is painted with (page, card, text, accent, border): what a tile in the library is drawn from. Apps saved before there were tiles have neither. */
  name: string;
  palette: string[];
  /** The grammar it was made in (shared/idioms.ts). Apps saved before the library knew it name none. */
  idiom?: string;
  owner: string;
  visibility: Visibility;
  created: string;
  screens: number;
  /** Whether the person asking is the owner. */
  mine: boolean;
}
