import { z } from "zod";
import { ARCHITECTURE } from "../../shared/architecture.js";
import { withCatalog, connectDestination } from "../../shared/catalog.js";
import { destination } from "../mock/link.js";
import { askJev } from "../models.js";
import { resolveIdentity, type AskIdentity, type DestinationEvidence } from "./identity.js";

export const NAVIGATION_REQUEST = z.object({
  state: ARCHITECTURE,
  from: z.object({ destination: z.string().max(40), title: z.string().max(200), archetype: z.string().max(80) }),
  via: z.object({ kind: z.enum(["item", "itemAction", "row", "nav", "appbar", "action", "submit", "back", "part", "asked"]), label: z.string().max(200), group: z.string().max(200).optional(), component: z.string().max(200).optional(), data: z.record(z.unknown()).optional() }),
});
export async function resolveNavigation(raw: unknown, ask: AskIdentity = askJev) {
  const { state: before, from, via } = NAVIGATION_REQUEST.parse(raw);
  const state = withCatalog(before);
  const node = state.map.nodes.find((n) => n.id === from.destination);
  if (!node) throw new Error("The originating screen is outside the catalog.");
  const { screen } = destination({ app: state.seed.brief, from, via });
  const subject = via.data ? Object.fromEntries(Object.entries(via.data).filter(([key, value]) => !["imageUrl", "on", "icon"].includes(key) && ["string", "number", "boolean"].includes(typeof value))) : undefined;
  const requested: DestinationEvidence = { from: { title: from.title, archetype: from.archetype, scope: node.purpose }, link: { kind: via.kind, label: via.label, ...(via.group ? { group: via.group } : {}), ...(typeof via.data?.control === "string" ? { control: via.data.control } : {}), ...(subject ? { subject: JSON.stringify(subject).slice(0, 2000) } : {}) }, intent: screen.slice(0, 4000) };
  const resolved = await resolveIdentity({ app: state.seed.brief, requested, catalog: state.catalog! }, "pairs", ask);
  if (resolved.result.kind === "uncertain") return { result: resolved.result, requested, ms: resolved.ms };
  const connected = connectDestination(state, from.destination, requested, resolved.result);
  // A proposed Details destination has no subject until a real link establishes one.
  // Record that evidence when reusing the proposal, so generation and future identity
  // decisions refer to the same destination rather than its generic planning role.
  const entry = connected.state.catalog!.find((c) => c.id === connected.destination)!;
  if (entry.status === "planned" && entry.evidence.from.archetype === "plan") {
    entry.evidence = requested;
    connected.state.map.nodes.find((n) => n.id === connected.destination)!.purpose = requested.intent.slice(0, 600);
  }
  return { ...connected, result: resolved.result, requested, ms: resolved.ms };
}
