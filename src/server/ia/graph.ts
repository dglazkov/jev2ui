import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const GRAPH = z.object({
  boundary: z.string().min(1).max(1600),
  home: id,
  nodes: z.array(z.object({
    id, label: z.string().min(1).max(100), purpose: z.string().min(1).max(600),
    actions: z.array(z.object({
      id, label: z.string().min(1).max(100),
      kind: z.enum(["navigate", "back", "in_place", "complete", "remove", "unresolved"]),
      target: id.nullable(), sourceLink: z.string().max(100).nullable(),
    })).max(40),
  })).min(1).max(24),
});
export type AppMap = z.infer<typeof GRAPH>;
export type MapAction = AppMap["nodes"][number]["actions"][number];
export interface SeedLink { id: string; kind: string; label: string; subject?: string }
export interface Seed {
  brief: string;
  first: { title: string; archetype: string; sections: Array<{ title: string; controls: Array<{ label: string; control: string }> }> };
  links: SeedLink[];
}
export interface Finding { id: string; severity: "error" | "uncertain"; detail: string; p?: number }

// Both the generated vocabulary and its graph must be bounded. A logical first destination is
// permanently attached to the original mock; presentation/route cannot introduce another identity.
export function validateMap(map: AppMap, seed: Seed): Finding[] {
  const out: Finding[] = [];
  const error = (id: string, detail: string) => out.push({ id, severity: "error", detail });
  const ids = new Set(map.nodes.map((node) => node.id));
  if (ids.size !== map.nodes.length) error("unique", "Destination IDs must be unique.");
  if (!ids.has("first")) error("anchor", "The first destination must remain bound to the first screen mock, with ID first.");
  if (!ids.has(map.home)) error("home", "The home destination must exist.");
  const used = new Map<string, number>();
  for (const node of map.nodes) {
    if (new Set(node.actions.map((a) => a.id)).size !== node.actions.length) error(`actions:${node.id}`, "Action IDs must be unique within each destination.");
    for (const action of node.actions) {
      const key = `${node.id}/${action.id}`;
      if (action.kind === "unresolved") error(key, "This action needs a supported decision before the map can be closed.");
      if (action.sourceLink !== null) {
        used.set(action.sourceLink, (used.get(action.sourceLink) ?? 0) + 1);
        if (node.id !== "first" || !seed.links.some((l) => l.id === action.sourceLink)) error(key, "Only first-screen actions may reference an observed sourceLink, and that link must exist.");
      }
      if (["navigate", "back"].includes(action.kind)) {
        if (!action.target || !ids.has(action.target)) error(key, "Navigation must name a destination inside the map.");
        if (action.target === node.id) error(key, "Navigation points at the current destination; remove the redundant entry point or identify a genuinely different destination.");
      } else if (action.target !== null) error(key, "In-place changes, completion and removed actions do not create a destination; target must be null.");
    }
  }
  for (const link of seed.links) if (used.get(link.id) !== 1) error(`coverage:${link.id}`, `Observed action ${link.label} (${link.id}) needs exactly one explicit disposition on first, including removal if redundant.`);
  const reached = new Set<string>();
  const visit = (at: string) => {
    if (reached.has(at)) return;
    reached.add(at);
    for (const a of map.nodes.find((n) => n.id === at)?.actions ?? []) if (a.target && ["navigate", "back"].includes(a.kind)) visit(a.target);
  };
  visit(map.home);
  for (const node of map.nodes) if (!reached.has(node.id)) error(`unreachable:${node.id}`, `${node.label} cannot be reached from the app's home.`);
  return out;
}

export function mapChanges(before: AppMap, after: AppMap): string[] {
  const lines: string[] = [];
  for (const node of before.nodes) {
    const next = after.nodes.find((n) => n.id === node.id);
    if (!next) { lines.push(`Removed destination: ${node.label}`); continue; }
    if (next.purpose !== node.purpose || next.label !== node.label) lines.push(`Revised responsibility: ${next.label}`);
    for (const a of node.actions) {
      const b = next.actions.find((x) => x.id === a.id);
      if (!b) lines.push(`${node.label}: removed action ${a.label}`);
      else if (JSON.stringify(a) !== JSON.stringify(b)) lines.push(`${node.label} / ${a.label}: ${a.kind} → ${a.target ?? "—"} became ${b.kind} → ${b.target ?? "—"}`);
    }
    for (const a of next.actions) if (!node.actions.some((b) => b.id === a.id)) lines.push(`${next.label}: added ${a.label} → ${a.target ?? a.kind}`);
  }
  for (const node of after.nodes) if (!before.nodes.some((n) => n.id === node.id)) lines.push(`Added destination: ${node.label}`);
  return lines;
}

export interface Resolution { kind: "reuse" | "materialize" | "blocked" | "in_place" | "complete" | "outside"; destination?: string; mockId?: string; reason: string }
export function resolveAction(map: AppMap, current: string, action: MapAction, bindings: Record<string, string>): Resolution {
  if (!map.nodes.some((n) => n.id === current)) return { kind: "outside", reason: "The current destination is outside the map." };
  if (!map.nodes.find((n) => n.id === current)!.actions.some((a) => a.id === action.id && JSON.stringify(a) === JSON.stringify(action))) return { kind: "outside", reason: "This action is not part of the current map." };
  if (action.kind === "unresolved") return { kind: "outside", reason: "The action needs an explicit map decision before it can be followed." };
  if (action.kind === "remove" || action.target === current) return { kind: "blocked", destination: current, mockId: bindings[current], reason: "Redundant action: remain on the current screen mock." };
  if (action.kind === "in_place" || action.kind === "complete") return { kind: action.kind, destination: current, mockId: bindings[current], reason: "This action does not open another mock." };
  if (!action.target || !map.nodes.some((n) => n.id === action.target)) return { kind: "outside", reason: "Revise the map before generating an unplanned destination." };
  const mockId = bindings[action.target];
  return { kind: mockId ? "reuse" : "materialize", destination: action.target, ...(mockId ? { mockId } : {}), reason: mockId ? "Return the already-bound screen mock." : "Make the first mock for this planned destination, then bind it once." };
}
