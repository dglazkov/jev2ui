import type { SavedApp, SavedScreen } from "../shared/saved.js";
import type { Seed, SeedLink } from "../server/ia/graph.js";
import { savedPlace } from "./saved-journey.js";

/** First-screen-only evidence. Sample values, later screens and original model judgments are excluded. */
export function firstSeed(app: SavedApp): { seed: Seed; first: SavedScreen } {
  const first = app.screens.find((s) => s.keys.includes("start"));
  if (!first) throw new Error("The capture has no original screen");
  const content = savedPlace(first).content!;
  const links: SeedLink[] = [];
  const bar = content.components.find((c) => c.component === "AppBar");
  if (bar?.leading && bar.leading !== "none") links.push({ id: "back", kind: "back", label: String(bar.leading) });
  for (const label of bar?.actions as string[] ?? []) links.push({ id: `appbar:${label}`, kind: "appbar", label });
  const groups = (content.data.groups ?? []) as Array<{ title: string; rows: Array<{ label: string; control?: string }> }>;
  for (const [g, group] of groups.entries()) for (const [i, row] of (group.rows ?? []).entries()) {
    links.push({ id: `row:${g}:${i}`, kind: ["switch", "check", "checkbox"].includes(row.control ?? "") ? "in_place" : "row", label: row.label, subject: `${group.title} / ${row.control ?? "nav"}` });
  }
  const nav = content.data.nav as { items?: Array<{ label: string }> } | undefined;
  for (const [i, item] of (nav?.items ?? []).entries()) links.push({ id: `nav:${i}`, kind: "nav", label: item.label });
  for (const [i, a] of ((content.data.actions ?? []) as Array<{ label: string }>).entries()) links.push({ id: `action:${i}`, kind: "action", label: a.label });
  const items = (content.data.list as { items?: Array<{ title: string }> } | undefined)?.items ?? [];
  for (const [i, item] of items.entries()) links.push({ id: `item:${i}`, kind: "item", label: item.title });
  if (content.components.some((c) => c.component === "Custom" || c.component === "Form")) throw new Error("This experiment's first-screen action extractor supports app bars, nav, grouped settings, lists and actions; custom components and forms need explicit extraction before planning.");
  return { first, seed: { brief: app.app, first: { title: first.title, archetype: first.archetype, sections: groups.map((g) => ({ title: g.title, controls: (g.rows ?? []).map((r) => ({ label: r.label, control: r.control ?? "nav" })) })) }, links } };
}
