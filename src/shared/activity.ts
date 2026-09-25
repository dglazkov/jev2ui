// What people do with the tool, as the browser tells the server (web/activity.ts) and the server writes it down
// (server/http.ts): one line of JSON per action on stdout, which Cloud Logging keeps and a sink copies to a bucket
// as it comes. This file is what a line may say, and so what whoever reads the bucket can count on.
//
// Actions, not words. Nothing a person typed is here, and nothing a model wrote from it either (an option the tool
// offered, the label of a button in a mock): only what kind of thing was done, how long a message was, and how it
// came out. The only words are the tool's own, an example or a suggestion that was chosen. The keys a person
// brings never come near it.

/** How a turn (shared/turn.ts) came about: typed, one of the tool's examples or suggestions, an option it offered, a tap in the mock or on the app map, or a button. */
export type How = "typed" | "example" | "suggestion" | "option" | "tap" | "map" | "remix" | "regenerate" | "design" | "design_edit";

/** Every action, by the name its line carries in `event`, and what else the line says about it. */
export interface Activities {
  /** The page was loaded: at the home page, or from a shared link (`?app=`). `returning` is a browser that has been here before. */
  visit: { entry: "home" | "link"; page: string; view: string; width: number; returning: boolean; referrer: string };
  /** Who the person turned out to be, whenever that changes: signed out, signed in and on no line of the list, on it, or a server that signs nobody in. */
  session: { role: string };
  /** The Google sign-in popup: opened, and then signed in, closed by the person, or failed. */
  sign_in: { step: "started" | "done" | "cancelled" | "failed" };
  sign_out: Record<string, never>;
  /** The person's own keys: the form opened or left, a check and what each service said, kept, removed. */
  keys: { step: "form" | "back" | "checked" | "saved" | "removed"; jev?: "ok" | "bad"; gemini?: "ok" | "bad" };
  /**
   * Something was asked to be made or changed. `turn` numbers the turns of this visit, so that its end, or its undoing,
   * can be found. `length` is how long a typed message was; `chip`, which example or suggestion was chosen; `via`, what kind
   * of thing was tapped (item, nav, back, action, …). `first` is a turn with no app yet.
   */
  turn_start: { turn: number; source: "typed" | "tap" | "button"; how: How; length?: number; chip?: string; via?: string; first: boolean; idiom: string; device: string; endpoint: string };
  /** How it came out: a screen made, something changed, the tool asked instead (`said`), or failed; `act` is what the tool took a message to mean. `reason: "runs"` is a failure for want of runs today. */
  turn_end: { turn: number; outcome: "made" | "changed" | "said" | "failed"; act?: string; ms: number; reason?: "runs" };
  /** A turn was taken back, finished or while it was still being made (the stop button). */
  undo: { turn: number; pending: boolean; ms: number };
  /** Went to a screen that was already made: a tap in the mock (`via` is its kind), a screen's card in the chat or its tab, or the app map. */
  walk: { via: string };
  /** Tapped something that leads to a screen nobody has made, without the right to make it: the tool asked them to sign in or bring keys. */
  unmade_tap: Record<string, never>;
  /** The rail, or the address: chat, stage, design, library or settings, and which page of the settings. */
  view: { view: string; section?: string };
  /** The stage switched between the preview and the app map. */
  map: { open: boolean };
  /** Cleared for another app: the rail's button, the library's tile, or a grammar picked while an app was open. */
  new_app: { from: "rail" | "library" | "grammar" };
  /** The grammar new apps are made in. */
  grammar: { to: string };
  save: { share: boolean; ok: boolean; screens?: number; turns?: number };
  /** A saved app opened, from its link or from the library; `mine` is the person's own. */
  open: { from: "link" | "library"; ok: boolean; mine?: boolean; screens?: number };
  /** Who may open a saved app: its owner alone, or anyone with the link. */
  visibility: { to: "private" | "link" };
  copy: { what: "link" | "a2ui" | "css" | "design" };
  delete: Record<string, never>;
}

export type ActivityName = keyof Activities;
export type Primitive = string | number | boolean;

const NAMES = {
  visit: true, session: true, sign_in: true, sign_out: true, keys: true, turn_start: true, turn_end: true, undo: true, walk: true, unmade_tap: true,
  view: true, map: true, new_app: true, grammar: true, save: true, open: true, visibility: true, copy: true, delete: true,
} satisfies Record<ActivityName, true>;

/** What every line says besides its own fields; a browser cannot say these for itself (a `uid` it claims is kept only where its token proves it, server/http.ts). */
const RESERVED = new Set(["kind", "event", "at", "seq", "visitor", "visit", "uid"]);

/**
 * An action as a browser sent it, as a line may hold it, or nothing: a name the tool knows, when and in what order,
 * who the page thought was there (`state`, `keys`), and fields that are short strings, numbers or yes and no.
 */
export function tidyActivity(sent: any): Record<string, Primitive> | undefined {
  if (!sent || typeof sent !== "object" || !Object.hasOwn(NAMES, sent.name)) return undefined;
  const at = typeof sent.at === "string" && sent.at.length <= 40 && !Number.isNaN(Date.parse(sent.at)) ? sent.at : undefined;
  if (!at || !Number.isInteger(sent.seq)) return undefined;
  const fields = Object.entries(sent).filter(
    ([key, value]) => key !== "name" && !RESERVED.has(key) && /^[a-z][a-zA-Z_]{0,30}$/.test(key) && ((typeof value === "string" && value.length <= 100) || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean"),
  ) as Array<[string, Primitive]>;
  return { event: sent.name, at, seq: sent.seq, ...Object.fromEntries(fields.slice(0, 20)) };
}
