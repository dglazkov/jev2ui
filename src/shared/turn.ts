// A turn of the chat (docs/chat-and-turns.md): something that made or changed the app. The first makes it; every
// one after changes it, or asks what was meant. The browser keeps the turns, and they are the app's history.
//
// The server is asked what a typed message means (POST /api/turn, server/change.ts) and keeps nothing. It answers
// with what to do, and where the look is what changed, with the design as it now is.

import type { Decision } from "./events.js";
import type { DesignReport } from "./design.js";

export type DialName = "vivid" | "light" | "warmth" | "round" | "air";

/** The choices of a mixed design that a person can take from Jev. */
export interface Pins {
  hue?: string;
  dark?: boolean;
  type?: string;
  elevation?: string;
  photos?: boolean;
  photo_look?: string;
  cards?: boolean;
}

/**
 * What the developer has asked to have changed about Jev's mix since it was made: how far each dial has been moved
 * from where Jev put it, in levels of its rubric, and the choices that are now theirs. A remix draws the rest again
 * and keeps these.
 */
export interface PaintChange {
  dials?: Partial<Record<DialName, number>>;
  pins?: Pins;
}

/** One change on top of another. */
export function addChange(to: PaintChange, more: PaintChange): PaintChange {
  const dials = { ...to.dials };
  for (const [key, by] of Object.entries(more.dials ?? {}) as Array<[DialName, number]>) dials[key] = (dials[key] ?? 0) + by;
  return { dials, pins: { ...to.pins, ...more.pins } };
}

/** What kind of thing a message asks for (server/change.ts). */
export type TurnKind = "new_app" | "new_screen" | "look" | "structure" | "words" | "arrange" | "question";

/** One line of a receipt: what stood there, and what stands there now. */
export interface ReceiptLine {
  what: string;
  from: string;
  to: string;
}

/** What differs between two designs, in the words their decisions are shown in. */
export function receiptOf(before: Decision[], after: Decision[]): ReceiptLine[] {
  const was = new Map(before.map((d) => [d.id, d.answer]));
  const short = (answer: string) => answer.replace(/^[\d.]+ of 4 → /, "").replace(/ → \d+°$/, "");
  return after
    .filter((d) => was.has(d.id) && short(was.get(d.id)!) !== short(d.answer))
    .map((d) => ({ what: d.question.replace(/\?$/, ""), from: short(was.get(d.id)!), to: short(d.answer) }));
}

/** Something the person might have meant, as a whole instruction that can be sent as it is. */
export interface Option {
  label: string;
  instruction: string;
}

export interface TurnRequest {
  message: string;
  /** The description the app started from. */
  app: string;
  /** The design in use: Jev's mix with what has been changed about it, or the person's own file. */
  design: { brief: string; seed: number; change: PaintChange } | { markdown: string };
  /** The screen in front of the person. */
  showing: { title: string; archetype: string; /** Why it is as it is, for when the person asks. */ decisions?: Array<{ question: string; answer: string }> };
  /** Set when the message answers a question the tool asked: what the person had said, and what they were asked. */
  answering?: { message: string; question: string };
}

export type TurnResponse = {
  kind: TurnKind;
  /** What Jev made of the message. */
  decisions: Decision[];
  /**
   * What to do about it. `paint`: the look changed, and `design` is the new one. `remake`: make the screen showing
   * again with the message in mind. `screen`: make a new screen of the app. `app`: start another app. `talk`: say
   * `text`, and offer `options`.
   */
  act: "paint" | "remake" | "screen" | "app" | "talk";
  /** Set whenever the look changed, whatever else is to be done. */
  design?: { delta: PaintChange; change: PaintChange; receipt: ReceiptLine[]; report: DesignReport; markdown: string };
  text?: string;
  options?: Option[];
  ms: number;
};
