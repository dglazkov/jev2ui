// From a reading of grammar/screen.md to the plan the builders take (mock/screen.ts).
//
// This is all that is left of readPlan when the graph is a file: the names of
// the fields. Nothing here decides anything.

import type { Block, CustomSize, CustomUse, ItemPart, Layout, Leading, ScreenPlan, Trailing } from "../mock/plan.js";
import type { SubjectName } from "../photos/subjects.js";
import type { Grammar } from "./format.js";
import { yieldOf, type Reading } from "./read.js";

const ITEM_PARTS: ItemPart[] = ["description", "price", "rating", "status", "time", "progress"];

export function planOf(grammar: Grammar, reading: Reading): ScreenPlan {
  const v = reading.values;
  const has = (block: Block) => reading.blocks.includes(block);
  return {
    archetype: reading.kind,
    blocks: reading.blocks as Block[],
    topLevel: v.top_level === true,
    person: v.person === true,
    appBarAction: v.app_bar_action === "none" ? null : String(yieldOf(grammar, "app_bar_action", v.app_bar_action)),
    list: { layout: v.list_layout as Layout, leading: v.item_leading as Leading, trailing: v.item_trailing as Trailing, parts: ITEM_PARTS.filter((part) => v[`item_${part}`] === true) },
    ...(has("custom") ? { custom: { use: v.custom_use as CustomUse, size: v.custom_size as CustomSize, linked: v.custom_linked === true } } : {}),
    search: v.search === true,
    statDeltas: v.stat_deltas === true,
    factsTotal: v.facts_total === true,
    symbol: v.screen_icon === "none" ? "image" : String(v.screen_icon),
    pictures: { hero: { subject: v.hero_subject as SubjectName, p: reading.p.hero_subject }, items: { subject: v.item_subject as SubjectName, p: reading.p.item_subject } },
    imagery: true,
    illustrated: false,
    icons: true,
    contained: true,
  };
}
