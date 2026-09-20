import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CAPTURE, savedPlace } from "./saved-journey.js";
import { destination } from "../server/mock/link.js";
import type { DestinationEvidence, KnownDestination, IdentityInput, IdentityResult } from "../server/ia/identity.js";

export interface IdentityCase { id: string; provenance: string; input: IdentityInput; expected: IdentityResult; rationale: string }
const evidence = (from: string, label: string, intent: string, scope = "app-wide", kind = "row"): DestinationEvidence => ({ from: { title: from, archetype: "settings", scope }, link: { kind, label }, intent });
const known = (id: string, evidence: DestinationEvidence, status: KnownDestination["status"] = "made"): KnownDestination => ({ id, evidence, status });
const existing = (destination: string): IdentityResult => ({ kind: "existing", destination });

/** Gold labels are authored contracts, never model judgments. Recorded evidence and authored cases stay separate. */
export async function identityCases(): Promise<IdentityCase[]> {
  const raw = JSON.parse(await readFile(new URL("./fixtures/podcast-settings-return.json", import.meta.url), "utf8"));
  const capture = CAPTURE.parse(raw);
  if (createHash("sha256").update(JSON.stringify(raw.app)).digest("hex") !== capture.provenance.sha256) throw new Error("Recording fingerprint mismatch");
  const first = capture.app.screens.find((s) => s.keys.includes("start"))!;
  const home = capture.app.screens.find((s) => s.keys.includes(`${first.id}:back:back`))!;
  const content = savedPlace(first).content!;
  const groups = content.data.groups as Array<{ title: string; rows: Array<{ label: string; control?: string; value?: string }> }>;
  const root = known("d0", { from: { title: "Initial request", archetype: "prompt" }, link: { kind: "asked", label: capture.app.app }, intent: `${capture.app.app}. Existing screen title: ${first.title}. Sections: ${groups.map((g) => `${g.title}: ${g.rows.map((r) => r.label).join(", ")}`).join("; ")}` });
  const tapped = (screen: typeof first, kind: "appbar" | "back" | "nav" | "row", label: string, data?: Record<string, unknown>): DestinationEvidence => {
    const from = { title: screen.title, archetype: screen.archetype };
    return { from, link: { kind, label, ...(typeof data?.control === "string" ? { control: data.control } : {}) }, intent: destination({ app: capture.app.app, from, via: { kind, label, data } }).screen };
  };
  const homeEvidence = tapped(first, "back", "back");
  const homeRecord = known("d1", homeEvidence);
  const skip = groups.flatMap((g) => g.rows.map((row) => ({ group: g.title, ...row }))).find((r) => r.label === "Skip forward")!;
  const skipEvidence = tapped(first, "row", skip.label, skip);
  skipEvidence.link.group = skip.group;
  const skipRecord = known("d2", skipEvidence);
  const cases: IdentityCase[] = [];
  const add = (id: string, app: string, requested: DestinationEvidence, catalog: KnownDestination[], expected: IdentityResult, rationale: string, provenance = "authored contrast case; not a captured user journey") => cases.push({ id, provenance, input: { app, requested, catalog }, expected, rationale });
  const recorded = `recorded evidence: podcast-settings-return.json sha256=${capture.provenance.sha256}; expected identity authored, generated duplicates excluded`;
  add("recorded-settings-self", capture.app.app, tapped(first, "appbar", "settings"), [root], existing("d0"), "The original requested settings overview already exists.", recorded);
  add("recorded-home-new", capture.app.app, homeEvidence, [root], { kind: "new" }, "No Home has been registered.", recorded);
  add("recorded-home-settings-gear", capture.app.app, tapped(home, "appbar", "settings"), [root, homeRecord], existing("d0"), "Home's gear returns to the original settings overview.", recorded);
  add("recorded-home-settings-nav", capture.app.app, tapped(home, "nav", "Settings"), [root, homeRecord], existing("d0"), "A second entry point should not duplicate Settings.", recorded);
  add("recorded-skip-new", capture.app.app, skipEvidence, [root, homeRecord], { kind: "new" }, "A single-setting picker is distinct from its containing overview.", recorded);
  add("recorded-skip-revisit", capture.app.app, skipEvidence, [root, homeRecord, skipRecord], existing("d2"), "The catalog now contains this picker.", recorded);

  const app = "Home energy dashboard showing today's usage";
  const preferences = known("d0", evidence("Dashboard", "settings", "App-wide preferences overview: display, units and alerts.", "app-wide", "appbar"));
  const theme = known("d1", evidence("Preferences", "Theme", "Choose the visual theme of the app."));
  const units = known("d2", evidence("Preferences", "Units", "Choose the units used to display energy measurements."));
  const history = known("d3", evidence("Dashboard", "History", "Inspect historical household energy usage."));
  add("theme-versus-overview", app, theme.evidence, [preferences, units, history], { kind: "new" }, "Theme does not reopen its overview or Units.");
  add("theme-revisit", app, theme.evidence, [preferences, units, theme, history], existing("d1"), "Reuse the specific Theme destination.");
  add("units-versus-theme", app, units.evidence, [preferences, theme, history], { kind: "new" }, "Different settings require distinct mocks.");
  add("theme-other-entry", app, evidence("Quick settings", "Appearance", "Choose the light or dark visual theme of this app."), [preferences, units, theme, history], existing("d1"), "Different labels and entry points can identify one destination.");
  add("appearance-broader", app, evidence("Preferences", "Appearance", "Overview of visual preferences including fonts, density and theme."), [preferences, units, theme], { kind: "new" }, "A broader visual-preferences overview is not the Theme picker.");
  add("theme-generating", app, theme.evidence, [preferences, units, { ...theme, status: "generating" }], existing("d1"), "An in-flight destination already has identity.");
  add("theme-planned", app, theme.evidence, [preferences, units, { ...theme, status: "planned" }], existing("d1"), "A specifically registered destination need not be materialized yet.");
  add("theme-different-owner", app, evidence("Living room display settings", "Theme", "Choose the visual theme of the physical living-room wall display, independently of the app.", "living-room device"), [preferences, theme, units], { kind: "new" }, "Same label but distinct owner and scope.");
  add("settings-cross-entry", app, evidence("History", "Preferences", "App-wide preferences overview: display, units and alerts.", "app-wide", "appbar"), [theme, preferences, units, history], existing("d0"), "Entry screen is not the destination's owner.");
  add("theme-insufficient-context", app, evidence("Controls", "Theme", "Theme", "not specified"), [theme, known("d4", evidence("Wall display", "Theme", "Choose the visual theme of the physical wall display.", "device")), units], { kind: "uncertain" }, "No evidence distinguishes app theme from device theme.");
  const recipeApp = "Recipe page for sourdough bread";
  const recipe = known("d0", evidence("Initial request", "Sourdough bread", "Read the recipe for sourdough bread.", "sourdough bread", "asked"));
  const edit = known("d1", evidence("Sourdough bread", "Edit", "Edit the recipe for sourdough bread.", "sourdough bread"));
  add("recipe-original-from-home", recipeApp, evidence("Home", "Sourdough bread", "Read the recipe for sourdough bread.", "sourdough bread", "item"), [recipe, edit], existing("d0"), "The first requested screen is reusable from a later Home.");
  add("recipe-stage", recipeApp, edit.evidence, [recipe], { kind: "new" }, "Editing and reading the same subject are distinct destinations.");
  add("recipe-different-subject", recipeApp, evidence("Recipes", "Details", "Read the recipe for banana bread.", "banana bread", "item"), [recipe, edit], { kind: "new" }, "Shared detail responsibility is not shared identity.");
  add("recipe-alias", recipeApp, evidence("Favorites", "My daily loaf", "Read the recipe saved under the nickname My daily loaf.", "recipe", "item"), [{ ...recipe, aliases: ["My daily loaf"] }, edit], existing("d0"), "An established alias provides identity evidence absent from the label alone.");
  return cases;
}
