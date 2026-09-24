// Extract evidence mechanically: no model summary and no description of what is wrong.
import { z } from "zod";
import { createHash } from "node:crypto";
import { SAVED_APP, type SavedScreen } from "../shared/saved.js";
import type { JourneyCase, Place } from "./coherence-cases.js";

export const CAPTURE = z.object({
  provenance: z.object({ url: z.string().url(), capturedAt: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  app: SAVED_APP,
  history: z.array(z.object({ from: z.number().int(), to: z.number().int() })).optional(),
  transition: z.object({
    from: z.number().int(), to: z.number().int(),
    // The user's report, translated into critic vocabulary, is the hypothesis to test.
    expected: z.object({
      relation: z.enum(["starts", "advances", "narrows", "returns", "in_place", "repeats", "unknown"]),
      repair: z.enum(["keep", "remove", "reuse", "inspect"]),
    }),
  }),
});

export function savedPlace(screen: SavedScreen): Place {
  let data: Record<string, unknown> = {};
  const components = new Map<string, Record<string, unknown>>();
  for (const message of screen.messages) {
    const updates = message.updateComponents as { components: Array<Record<string, unknown> & { id: string }> } | undefined;
    if (updates) for (const component of updates.components) components.set(component.id, component);
    const update = message.updateDataModel as { path?: string; value: unknown } | undefined;
    if (!update) continue;
    const keys = (update.path ?? "/").split("/").filter(Boolean);
    // Match the surface's replace-at-path semantics (src/web/surface.ts), with no mutation of the saved stream.
    if (keys.some((key) => ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Unsafe data path in saved screen");
    const value = structuredClone(update.value);
    if (!keys.length) { data = (value ?? {}) as Record<string, unknown>; continue; }
    let at: any = data;
    for (const key of keys.slice(0, -1)) at = at[key] ??= {};
    at[keys.at(-1)!] = value;
  }
  const header = data.header as { title?: string; subtitle?: string } | undefined;
  return {
    id: String(screen.id), title: header?.title ?? screen.title, shows: header?.subtitle ?? "",
    content: { data, components: [...components.values()] },
    generation: { plan: screen.plan, request: screen.request, log: screen.log },
  };
}

/** Deliberately excludes original model judgments and analyst labels from critique input. */
export function criticPlace(place: Place) {
  const { generation: _generation, ...evidence } = place;
  return evidence;
}

export function capturedJourney(value: unknown): { cases: JourneyCase[]; provenance: z.infer<typeof CAPTURE>["provenance"] } {
  const capture = CAPTURE.parse(value);
  const original = value as { app: unknown };
  const hash = createHash("sha256").update(JSON.stringify(original.app)).digest("hex");
  if (hash !== capture.provenance.sha256) throw new Error("Saved app differs from its capture fingerprint");
  const from = capture.app.screens.find((screen) => screen.id === capture.transition.from);
  const to = capture.app.screens.find((screen) => screen.id === capture.transition.to);
  if (!from || !to) throw new Error("Captured transition names a missing screen");
  function action(source: SavedScreen, target: SavedScreen) {
    const journey = target.request.journey as { from?: { title?: string; archetype?: string }; via?: { kind?: string; label?: string } } | undefined;
    const via = journey?.via;
    if (!via?.kind || !via.label) throw new Error("Saved destination has no recorded action");
    // Nav keys are app-wide. The stored request identifies which source created this destination.
    const key = via.kind === "nav" ? `nav:${via.label}` : `${source.id}:${via.kind}:${via.label}`;
    if (!target.keys.includes(key) || journey?.from?.title !== source.title || journey.from.archetype !== source.archetype) throw new Error("Saved destination does not record this source/action transition");
    return `${via.kind}: ${via.label}`;
  }
  const observed = action(from, to);
  const history = (capture.history ?? []).map((edge) => {
    const source = capture.app.screens.find((s) => s.id === edge.from);
    const target = capture.app.screens.find((s) => s.id === edge.to);
    if (!source || !target) throw new Error("Captured history names a missing screen");
    return { from: savedPlace(source), action: action(source, target), to: savedPlace(target) };
  });
  if (history.some((edge, i) => i > 0 && history[i - 1].to.id !== edge.from.id) || (history.length && history.at(-1)!.to.id !== String(from.id))) throw new Error("Captured history does not lead to the source screen");
  // Use recorded creation turns rather than assuming screen IDs are chronological. Do not include
  // the destination being judged or any screens created after it (future evidence would leak).
  const turns = capture.app.turns ?? [];
  const cutoff = turns.findIndex((turn) => turn.outcome === "made" && turn.screen === to.id);
  const prior = new Set((cutoff >= 0 ? turns.slice(0, cutoff) : []).filter((turn) => turn.outcome === "made").map((turn) => turn.screen));
  const existing = capture.app.screens.filter((s) => prior.has(s.id) && s.id !== from.id && s.id !== to.id).map(savedPlace);
  return { provenance: capture.provenance, cases: [{
    id: `saved-${from.id}-${to.id}`, title: `${from.title} → ${to.title}`,
    app: capture.app.app,
    goal: "No task goal was recorded beyond the original app brief and the action taken.",
    start: savedPlace(from),
    ...(existing.length ? { existing } : {}), ...(history.length ? { history } : {}),
    hops: [{ action: observed, to: savedPlace(to), expected: capture.transition.expected }],
  }] };
}
