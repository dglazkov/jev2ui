import { ARCHITECTURE, type Architecture } from "./architecture.js";
import type { DestinationEvidence, IdentityResult } from "./identity.js";
import type { A2uiMessage } from "./events.js";
import { screenContents } from "./screen-content.js";

/** Refresh from the actual mocks at request time, including restored and edited screens.
 * Only the screen's own subject is evidence: its list of other subjects is not its identity. */
export function withRenderedScreens(state: Architecture, screens: Iterable<{ destination?: string; title: string; archetype: string; running: boolean; messages: readonly A2uiMessage[] }>): Architecture {
  const byId = new Map([...screens].filter((s) => s.destination).map((s) => [s.destination!, s]));
  return { ...withCatalog(state), catalog: withCatalog(state).catalog!.map((entry) => {
    const screen = byId.get(entry.id);
    if (!screen) return { ...entry, status: "planned" as const, rendered: undefined };
    const { data } = screenContents(screen.messages);
    const own = Object.fromEntries(["header", "prose", "facts", "steps", "person"].filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
    const content = JSON.stringify(own, (key, value) => ["imageUrl", "icon", "on"].includes(key) ? undefined : value).slice(0, 4000);
    return { ...entry, status: screen.running ? "generating" as const : screen.messages.length ? "made" as const : "planned" as const,
      rendered: screen.title && screen.messages.length ? { title: screen.title.slice(0, 200), archetype: screen.archetype.slice(0, 80), content } : undefined };
  }) };
}

/** Initial IA nodes are suggestions; observed links can establish further, more specific destinations. */
export function withCatalog(state: Architecture): Architecture {
  if (state.catalog) return state;
  return { ...state, catalog: state.map.nodes.map((node) => ({ id: node.id, status: "planned" as const, evidence: {
    from: { title: "Initial app proposal", archetype: "plan" },
    link: { kind: "asked", label: node.id === "first" ? state.seed.brief.slice(0, 200) : node.label },
    intent: node.id === "first" ? state.seed.brief : node.purpose,
  } })) };
}

/** Called against the latest catalog after resolution. Never allocates a second ID for reuse. */
export function connectDestination(state: Architecture, from: string, requested: DestinationEvidence, result: IdentityResult): { state: Architecture; destination: string } {
  if (result.kind === "uncertain") throw new Error("Destination identity is undecided.");
  const next = structuredClone(withCatalog(state));
  const source = next.map.nodes.find((n) => n.id === from);
  if (!source) throw new Error("The source screen no longer exists.");
  let destination: string;
  if (result.kind === "existing") {
    destination = result.destination;
    if (!next.catalog!.some((c) => c.id === destination)) throw new Error("The resolved destination no longer exists.");
  } else {
    if (next.map.nodes.length >= 80) throw new Error("This prototype has reached its 80-screen limit.");
    let n = 1; while (next.map.nodes.some((d) => d.id === `screen_${n}`)) n++;
    destination = `screen_${n}`;
    next.catalog!.push({ id: destination, evidence: requested, status: "planned" });
    next.map.nodes.push({ id: destination, label: requested.link.label.slice(0, 100) || "Screen", purpose: requested.intent.slice(0, 600), actions: [{ id: "back", label: "Back", kind: "back", target: from, sourceLink: null }] });
  }
  if (from !== destination && !source.actions.some((a) => a.target === destination)) {
    if (source.actions.length >= 40) throw new Error("This screen has reached its 40-link limit.");
    let n = 1; while (source.actions.some((a) => a.id === `open_${n}`)) n++;
    source.actions.push({ id: `open_${n}`, label: requested.link.label.slice(0, 100) || "Open", kind: "navigate", target: destination, sourceLink: null });
  }
  const record = next.catalog!.find((c) => c.id === destination)!;
  record.aliases = [...new Set([...(record.aliases ?? []), requested.link.label])].slice(-30);
  next.revision++;
  return { state: ARCHITECTURE.parse(next), destination };
}
