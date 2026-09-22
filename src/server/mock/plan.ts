// The plan of a screen: what a reading of grammar/screen.md comes to, as the
// browser holds it and sends it back (shared/turn.ts, `ScreenEdit`).
//
// The grammar itself is the file's: what is asked, how the answers are read, what
// each part is made of, which pattern draws it (src/server/grammar, mock/graph.ts).
// What stays here is the shape of a plan, what is taken of one a browser sent, and
// what a design overrules.

import type { SubjectName } from "../photos/subjects.js";
import { ITEM_PARTS, optionsOf, SCREEN } from "./graph.js";

export type Block = "banner" | "hero" | "filters" | "custom" | "stats" | "list" | "groups" | "facts" | "prose" | "steps" | "form" | "actions";
export type Leading = "avatar" | "thumbnail" | "icon" | "number" | "none";
export type Trailing = "chevron" | "button" | "switch" | "checkbox" | "none";
export type Layout = "rows" | "cards" | "grid" | "reel";
export type ItemPart = "description" | "price" | "rating" | "status" | "time" | "progress";
export type CustomUse = "watch" | "pick" | "adjust" | "read";
export type CustomSize = "strip" | "wide" | "square" | "tall";

/** What a custom part is held to, so that whatever gets baked fits the screen: what the person does with it, the box it gets, whether it draws the list's own items. */
export interface CustomContract {
  use: CustomUse;
  size: CustomSize;
  /** It draws the items the screen also lists (pins for the places, bars for the categories), so both read `/list/items`. */
  linked: boolean;
}

export interface ListAnatomy {
  layout: Layout;
  leading: Leading;
  trailing: Trailing;
  parts: ItemPart[];
}

/** Jev's reading of what is pictured, made from the description alone. `p` says how far to trust it once there are words to read instead. */
export interface PictureSubject {
  subject: SubjectName;
  p: number;
}

export interface ScreenPlan {
  archetype: string;
  blocks: Block[];
  /** A main destination of the app (Material: navigation bar on top-level destinations only) or a page reached by drilling in. */
  topLevel: boolean;
  /** The screen is about one person: it opens with who they are (avatar, name, a line about them). */
  person: boolean;
  appBarAction: string | null;
  list: ListAnatomy;
  /** Set when the screen has a custom block. */
  custom?: CustomContract;
  search: boolean;
  statDeltas: boolean;
  factsTotal: boolean;
  /** The symbol of what the screen is about. It holds the place of every picture until the picture has loaded. */
  symbol: string;
  /** What photographs on this screen are of: which shelf of the library to look on, and how to shoot one if it has to be made. */
  pictures: { hero: PictureSubject; items: PictureSubject };
  /** Set by the design, not by the prompt. */
  imagery: boolean;
  /** The design's pictures are drawn and not photographed. */
  illustrated: boolean;
  icons: boolean;
  contained: boolean;
}

const one = (id: string, value: unknown) => typeof value === "string" && optionsOf(id).includes(value);
const yields = (id: string) => {
  const asking = SCREEN.nodes.find((node) => node.name === id)?.asking;
  return asking?.type === "choice" ? asking.options.map((o) => o.value ?? o.name) : [];
};

export function keepPlan(fresh: ScreenPlan, sent: Record<string, unknown>, blocks: Block[]): ScreenPlan {
  const was = sent as Partial<ScreenPlan>;
  const stays = (block: Block) => blocks.includes(block) && Array.isArray(was.blocks) && was.blocks.includes(block);
  const list = was.list;
  const listOk = list && one("list_layout", list.layout) && one("item_leading", list.leading) && one("item_trailing", list.trailing) && Array.isArray(list.parts) && list.parts.every((part) => (ITEM_PARTS as string[]).includes(part));
  const subject = (s: unknown): s is PictureSubject => !!s && one("hero_subject", (s as PictureSubject).subject);
  return {
    ...fresh,
    blocks,
    ...(typeof was.topLevel === "boolean" ? { topLevel: was.topLevel } : {}),
    ...(typeof was.person === "boolean" ? { person: was.person } : {}),
    ...(typeof was.appBarAction === "string" || was.appBarAction === null ? { appBarAction: was.appBarAction === null || yields("app_bar_action").includes(was.appBarAction) ? was.appBarAction : fresh.appBarAction } : {}),
    ...(stays("list") && listOk ? { list: { layout: list.layout, leading: list.leading, trailing: list.trailing, parts: [...list.parts] } } : {}),
    ...(stays("filters") && typeof was.search === "boolean" ? { search: was.search } : {}),
    ...(stays("stats") && typeof was.statDeltas === "boolean" ? { statDeltas: was.statDeltas } : {}),
    ...(stays("facts") && typeof was.factsTotal === "boolean" ? { factsTotal: was.factsTotal } : {}),
    ...(stays("custom") && was.custom && one("custom_use", was.custom.use) && one("custom_size", was.custom.size) ? { custom: { use: was.custom.use, size: was.custom.size, linked: Boolean(was.custom.linked) && blocks.includes("list") } } : {}),
    ...(typeof was.symbol === "string" && /^[a-z0-9_]{1,40}$/.test(was.symbol) ? { symbol: was.symbol } : {}),
    ...(subject(was.pictures?.hero) && subject(was.pictures?.items) ? { pictures: { hero: { subject: was.pictures.hero.subject, p: 1 }, items: { subject: was.pictures.items.subject, p: 1 } } } : {}),
  };
}

/** What a design's prose rules out is taken out of the plan. Returns what changed, for the trace. */
export function applyDesign(plan: ScreenPlan, look: { imagery: boolean; icons: boolean; contained: boolean; treatment?: string }): { plan: ScreenPlan; overruled: string[] } {
  const overruled: string[] = [];
  const { imagery, icons, contained } = look;
  const next: ScreenPlan = { ...plan, list: { ...plan.list }, imagery, icons, contained, illustrated: look.treatment === "illustrated" };
  if (!look.imagery) {
    if (next.blocks.includes("hero")) overruled.push("no lead photograph");
    next.blocks = next.blocks.filter((b) => b !== "hero");
    if (next.list.leading === "thumbnail") {
      overruled.push("no pictures on items");
      next.list.leading = look.icons ? "icon" : "none";
      next.list.layout = "rows";
    }
  }
  if (!look.icons && next.list.leading === "icon") {
    overruled.push("no icons on items");
    next.list.leading = "none";
  }
  if (!look.contained && next.blocks.some((b) => ["list", "stats", "groups", "facts"].includes(b))) overruled.push("no cards");
  if (!look.contained && (next.list.layout === "cards" || next.list.layout === "reel")) next.list.layout = "rows";
  return { plan: next, overruled };
}
