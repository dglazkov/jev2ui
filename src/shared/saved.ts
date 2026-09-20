// An app, saved: everything the browser holds of a session (web/app.ts), so that opening it again, by whoever has
// the link, shows what was made and calls no model. It carries the design it was painted with, read and all, and
// its screens carry their messages, which are everything there is to know about them, baked components included.
//
// A saved app does not change: its id is a hash of what it is and whose (server/apps.ts), and saving a session
// that has moved on makes another. Where the person was standing in it is not what it is: `stack` is kept, not hashed. Whether others may open it is beside the app, and its owner's to change.

import { z } from "zod";

const MESSAGE = z.record(z.unknown());

export const SAVED_SCREEN = z.object({
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
});

export const SAVED_APP = z.object({
  /** 2 has the turns, and what has been changed about the design; 1 was made before there was a chat. */
  version: z.union([z.literal(1), z.literal(2)]),
  /** The description the session started from. */
  app: z.string().min(1).max(4000),
  nav: z.object({ items: z.array(z.object({ label: z.string(), icon: z.string().optional() })) }).optional(),
  design: z.object({ choice: z.string().max(20), markdown: z.string().max(1 << 20), seed: z.number(), change: z.record(z.unknown()).optional(), report: z.record(z.unknown()).optional() }),
  turns: z.array(SAVED_TURN).max(400).optional(),
  screens: z.array(SAVED_SCREEN).min(1).max(80),
  /** The ids of the screens that were showing, the way back first. */
  stack: z.array(z.number().int().positive()).min(1).max(40),
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
  owner: string;
  visibility: Visibility;
  created: string;
  screens: number;
  /** Whether the person asking is the owner. */
  mine: boolean;
}
