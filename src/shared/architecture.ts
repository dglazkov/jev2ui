import { orderedNavigation } from "./navigation.js";
import { KNOWN_DESTINATION } from "./identity.js";
import { z } from "zod";
import { GRAPH, validateMap, type MapAction } from "./ia-graph.js";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const answer = z.object({ choice: z.string().max(60), probabilities: z.record(z.number().min(0).max(1)) });
export const ARCHITECTURE = z.object({
  navigation: z.array(key).min(1).max(10).optional(),
  catalog: z.array(KNOWN_DESTINATION).max(80).optional(),
  version: z.literal(1), revision: z.number().int().positive(),
  seed: z.object({
    brief: z.string().min(1).max(4000),
    first: z.object({ title: z.string().max(100), archetype: z.string().max(80), sections: z.array(z.object({ title: z.string().max(200), controls: z.array(z.object({ label: z.string().max(200), control: z.string().max(80) })).max(40) })).max(20) }),
    links: z.array(z.object({ id: z.string().max(100), kind: z.string().max(40), label: z.string().max(200), subject: z.string().max(400).optional() })).max(40),
  }),
  map: GRAPH,
  answers: z.record(answer).refine((v) => Object.keys(v).length <= 80),
  aliases: z.record(key), roles: z.array(key).max(24), activity: z.string().max(100), pattern: z.string().max(40),
  receipts: z.array(z.string().max(1600)).max(100),
  notes: z.array(z.object({ destination: key, message: z.string().max(2000) })).max(40).default([]),
  status: z.enum(["reviewing", "ready", "review"]),
  findings: z.array(z.object({ id: z.string().max(120), severity: z.enum(["error", "uncertain"]), detail: z.string().max(1600), p: z.number().optional() })).max(100),
  ms: z.number().nonnegative(),
}).superRefine((value, context) => {
  for (const finding of validateMap(value.map, value.seed)) context.addIssue({ code: "custom", message: finding.detail, path: ["map"] });
  const ids = new Set(value.map.nodes.map((n) => n.id));
  if (value.navigation && (new Set(value.navigation).size !== value.navigation.length || value.navigation.some((id) => !ids.has(id)))) context.addIssue({ code: "custom", message: "Navigation must name distinct registered destinations." });
  if (value.catalog && (new Set(value.catalog.map((c) => c.id)).size !== value.catalog.length || value.catalog.length !== ids.size || value.catalog.some((c) => !ids.has(c.id)))) context.addIssue({ code: "custom", message: "Catalog must identify each map destination exactly once." });
  if (Object.values(value.aliases).some((id) => !ids.has(id))) context.addIssue({ code: "custom", message: "Role alias is outside the map." });
});
export type Architecture = z.infer<typeof ARCHITECTURE>;
export const ARCHITECTURE_REQUEST = z.union([
  z.object({ create: z.literal(true) }),
  z.object({ state: ARCHITECTURE, destination: key }),
]);
export type ArchitectureRequest = z.infer<typeof ARCHITECTURE_REQUEST>;

export const OBSERVED_CONTROL = z.object({ source: z.string().max(240), kind: z.string().max(40), label: z.string().max(200), control: z.string().max(40).optional(), target: key.optional() });
export type ObservedControl = z.infer<typeof OBSERVED_CONTROL>;

/** A control binds to an existing map action, or has an explicit local/outside disposition. */
export const ROUTES = z.object({
  revision: z.number().int().positive(),
  observed: z.array(OBSERVED_CONTROL).max(100).optional(),
  controls: z.record(z.object({ label: z.string().max(200), kind: z.enum(["action", "in_place", "complete", "remove", "outside"]), action: key.optional(), subject: z.boolean().optional() })).refine((v) => Object.keys(v).length <= 100),
  findings: z.array(z.string().max(400)).max(100),
});
export type ScreenRoutes = z.infer<typeof ROUTES>;
export const SCREEN_BINDINGS = z.array(z.object({ destination: key, routes: ROUTES })).max(24);

/** Code-owned controls already name a map destination; they need no rendered-content decision. */
export function mappedControl(state: Architecture, destination: string, control: ObservedControl): ScreenRoutes["controls"][string] | undefined {
  const node = state.map.nodes.find((n) => n.id === destination);
  if (!node) return;
  const target = control.kind === "appbar" && control.label === "settings" ? state.aliases.w_preferences : control.target;
  const local = control.kind === "row" && ["switch", "check", "checkbox"].includes(control.control ?? "") || control.kind === "appbar" && ["favorite", "share", "more_vert"].includes(control.label);
  if (local || target === destination) return { label: control.label, kind: local ? "in_place" : "remove" };
  const action = target ? node.actions.find((a) => a.target === target) : control.kind === "back" ? node.actions.find((a) => a.kind === "back") : undefined;
  if (action) return { label: control.label, kind: "action", action: action.id };
}

export function routeAction(state: Architecture, destination: string, routes: ScreenRoutes | undefined, source: string): MapAction | undefined {
  if (state.status === "reviewing" || routes && routes.revision !== state.revision) return;
  const kind = source === "back" ? "back" : source.startsWith("nav:") ? "nav" : source.startsWith("appbar:") ? "appbar" : "";
  const route = routes?.controls[source] ?? (kind ? mappedControl(state, destination, { source, kind, label: source.split(":")[1] ?? "Back", ...(kind === "nav" ? { target: source.slice(4) } : {}) }) : undefined);
  if (!route || route.kind === "outside") return;
  if (route.kind !== "action") return { id: "local", label: route.label, kind: route.kind, target: null, sourceLink: null };
  return state.map.nodes.find((n) => n.id === destination)?.actions.find((a) => a.id === route.action);
}

const DESTINATION_ICONS: Record<string, string> = {
  w_collection: "explore", w_detail: "article", w_select: "checklist", w_operate: "tune",
  w_monitor: "dashboard", w_history: "history", w_edit: "edit", w_review: "fact_check",
  w_outcome: "task_alt", w_conversation: "chat", w_preferences: "settings", w_help: "help",
};

/** The first screen keeps the icon of its primary responsibility, even when other roles alias it. */
export function architectureIcon(state: Architecture, destination: string): string {
  if (destination === state.map.home) return "home";
  const role = destination === "first" ? state.answers.anchor?.choice : destination;
  return DESTINATION_ICONS[role] ?? "apps";
}

/** New apps keep their initial main sections stable; older maps retain their per-screen navigation. */
export function architectureNav(state: Architecture, destination: string) {
  const node = state.map.nodes.find((n) => n.id === destination)!;
  const ids = state.navigation ?? [...new Set([destination, ...node.actions.filter((a) => a.target).map((a) => a.target!)])];
  // A map made with its own main destinations kept to what its frame has room for; an older one, to a bar of five.
  const items = orderedNavigation(ids.map((id) => ({ label: state.map.nodes.find((n) => n.id === id)!.label, destination: id, icon: architectureIcon(state, id) }))).slice(0, state.navigation ? undefined : 5).map(({ item }) => item);
  return { items, active: items.findIndex((item) => item.destination === destination) };
}

/** Bindings follow replacement screens, while canonical destination IDs stay fixed. */
export function boundScreens<T extends { destination?: string; id: number }>(screens: Iterable<T>): Map<string, T> {
  return new Map([...screens].filter((s) => s.destination).map((s) => [s.destination!, s]));
}

/** Unchanged controls retain their meaning; changed actions must be rebound by a screen generation. */
export function rebaseRoutes(before: Architecture, after: Architecture, destination: string, routes?: ScreenRoutes): ScreenRoutes | undefined {
  if (!routes) return;
  const oldNode = before.map.nodes.find((n) => n.id === destination), node = after.map.nodes.find((n) => n.id === destination);
  const controls = Object.fromEntries(Object.entries(routes.controls).map(([source, route]) => {
    if (route.kind !== "action") return [source, JSON.stringify(oldNode) === JSON.stringify(node) || route.kind === "outside" ? route : { label: route.label, kind: "outside" as const }];
    const was = oldNode?.actions.find((a) => a.id === route.action), now = node?.actions.find((a) => a.id === route.action);
    return [source, was && now && was.kind === now.kind && was.target === now.target ? route : { label: route.label, kind: "outside" as const }];
  }));
  // Navigation is deterministic and can be refreshed without generating content.
  if (node && Object.keys(routes.controls).some((source) => source.startsWith("nav:"))) for (const item of architectureNav(after, destination).items) {
    const action = node.actions.find((a) => a.target === item.destination);
    controls[`nav:${item.destination}`] = { label: item.label, kind: action ? "action" : "remove", ...(action ? { action: action.id } : {}) };
  }
  return { revision: after.revision, observed: routes.observed, controls, findings: Object.values(controls).filter((r) => r.kind === "outside").map((r) => `“${r.label}” is outside the current map. Regenerate this screen to reconnect its controls.`) };
}
