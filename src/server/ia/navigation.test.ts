import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHITECTURE } from "../../shared/architecture.js";
import { withCatalog, withRenderedScreens, connectDestination } from "../../shared/catalog.js";
import { SAVED_APP } from "../../shared/saved.js";
import { resolveNavigation } from "./navigation.js";
import type { DestinationEvidence, AskIdentity } from "./identity.js";
import { createArchitecture, plannedSeed } from "./live.js";
import { WHOLE_CANDIDATES } from "./roles.js";
import { ACTIVITIES } from "./neutral.js";
import { destination, destinationIntent } from "../mock/link.js";
import { identityRequest } from "./identity.js";
import { partPrompt, knownSubjects } from "../mock/screen.js";
const a = (choice: string) => ({ choice, probabilities: { [choice]: 1 } });
const create = async () => withCatalog(await createArchitecture(plannedSeed("Home energy dashboard", { archetype: "dashboard" }), async (stage, _state, qs) => ({ ms: 1, inputTokens: 0, endpoint: "jev", answers: stage === "Jev: plan the app" ? { anchor: a("w_monitor"), activity: a("monitor"), pattern: a("monitor"), ...Object.fromEntries(WHOLE_CANDIDATES.map((c) => [`use_${c.id}`, a(c.id === "w_preferences" ? "separate" : c.id === "w_monitor" ? "first" : "omit")])), ...Object.fromEntries(Object.keys(ACTIVITIES).map((k) => [`first_activity_${k}`, a("omit")])) } : Object.fromEntries(Object.keys(qs).map((k) => [k, a("works")])) }), () => {}));
const requested = (label: string): DestinationEvidence => ({ from: { title: "Preferences", archetype: "settings" }, link: { kind: "row", label, group: "Display", control: "value" }, intent: `Choose ${label}: available options for this one setting` });
const different: AskIdentity = async (_state, qs) => ({ ms: 1, inputTokens: 0, endpoint: "jev", answers: Object.fromEntries(Object.keys(qs).map((k) => [k, a("different")])) });

test("catalog grows separate Theme and Units mocks and preserves their IDs on reuse", async () => {
  const initial = await create();
  const theme = connectDestination(initial, "w_preferences", requested("Theme"), { kind: "new" });
  const units = connectDestination(theme.state, "w_preferences", requested("Units"), { kind: "new" });
  assert.notEqual(theme.destination, units.destination);
  const again = connectDestination(units.state, "first", requested("Theme"), { kind: "existing", destination: theme.destination });
  assert.equal(again.state.map.nodes.length, initial.map.nodes.length + 2);
  assert.equal(again.state.map.nodes.find((n) => n.id === "first")!.actions.some((a) => a.target === theme.destination), true);
  assert.equal(initial.catalog!.some((c) => c.id === theme.destination), false, "undo's old catalog is immutable");
  ARCHITECTURE.parse(again.state);
});

test("observed gear can establish a missing edge to existing Preferences without duplicating it", async () => {
  const state = await create();
  assert.equal(state.map.nodes.find((n) => n.id === "first")!.actions.some((a) => a.target === "w_preferences"), false);
  const result = await resolveNavigation({ state, from: { destination: "first", title: "Energy Dashboard", archetype: "dashboard" }, via: { kind: "appbar", label: "settings" } }, async (input, qs) => {
    assert.equal((input as any).requested.from.title, "Energy Dashboard");
    return { ms: 1, inputTokens: 0, endpoint: "jev", answers: Object.fromEntries(Object.entries(qs).map(([key, q]) => [key, a(JSON.stringify(q).includes("Configure the app") ? "same" : "different")])) };
  });
  assert.ok("state" in result);
  assert.equal(result.destination, "w_preferences");
  assert.equal(result.state.map.nodes.length, state.map.nodes.length);
  assert.deepEqual(result.state.catalog!.find((c) => c.id === "w_preferences")!.evidence, result.requested, "the first observed link replaces the generic proposal's evidence");
  assert.equal(result.state.map.nodes.find((n) => n.id === "w_preferences")!.purpose, result.requested.intent);
  assert.equal(state.catalog!.find((c) => c.id === "w_preferences")!.evidence.from.archetype, "plan", "the original proposal remains available for undo");
});

test("row context reaches resolver and new destinations retain a return to the containing screen", async () => {
  const state = await create();
  const result = await resolveNavigation({ state, from: { destination: "w_preferences", title: "Preferences", archetype: "settings" }, via: { kind: "row", label: "Theme", group: "Display", data: { label: "Theme", control: "value", value: "Dark" } } }, async (input, qs) => {
    assert.equal((input as any).requested.link.group, "Display");
    assert.match((input as any).requested.intent, /Choose Theme/);
    return different(input, qs);
  });
  assert.ok("state" in result);
  assert.equal(result.state.map.nodes.find((n) => n.id === result.destination)!.actions[0].target, "w_preferences");
  assert.equal(result.state.catalog!.find((c) => c.id === result.destination)!.evidence.link.control, "value");
});

test("saved catalog and exact link bindings round trip; dangling link IDs are rejected", async () => {
  const state = await create();
  const app = { version: 3, app: "Energy", architecture: state, design: { choice: "auto", markdown: "", seed: 0 }, screens: [{ id: 1, destination: "first", links: { "appbar:settings": "w_preferences" }, keys: ["start"], title: "Energy", archetype: "dashboard", topLevel: true, dialog: false, messages: [{ version: "v0.9" }], log: [], request: { prompt: "Energy" } }], stack: [1] };
  assert.deepEqual(SAVED_APP.parse(JSON.parse(JSON.stringify(app))).screens[0].links, app.screens[0].links);
  app.screens[0].links["appbar:settings"] = "missing";
  assert.equal(SAVED_APP.safeParse(app).success, false);
});

test("a content row carries its section and subject without assigning a settings page", async () => {
  const state = await create();
  const result = await resolveNavigation({ state, from: { destination: "home", title: "Podcast Hub", archetype: "dashboard" }, via: { kind: "row", label: "Audio Engineering Basics", group: "Recent Episodes", data: { label: "Audio Engineering Basics", detail: "Tech Talks Daily", control: "nav" } } }, async (input, qs) => {
    const evidence = (input as any).requested;
    assert.match(evidence.intent, /Recent Episodes/);
    assert.match(evidence.intent, /Tech Talks Daily/);
    assert.doesNotMatch(evidence.intent, /settings/);
    return different(input, qs);
  });
  assert.ok("state" in result);
  const entry = result.state.catalog!.find((c) => c.id === result.destination)!;
  assert.equal(destinationIntent(entry.evidence), result.requested.intent, "generation and identity receive the same observed meaning");
});

test("legacy row intent is repaired for reuse and regeneration without changing its identity", () => {
  const evidence: DestinationEvidence = { from: { title: "Podcast Hub", archetype: "dashboard" }, link: { kind: "row", label: "Audio Engineering Basics", group: "Recent Episodes", control: "nav", subject: JSON.stringify({ label: "Audio Engineering Basics", detail: "Tech Talks Daily" }) }, intent: "Audio Engineering Basics: a sub-page of settings" };
  const repaired = destinationIntent(evidence);
  assert.match(repaired, /Recent Episodes/);
  assert.match(repaired, /Tech Talks Daily/);
  assert.doesNotMatch(repaired, /settings/);
  const input = { app: "Podcasts", requested: { ...evidence, intent: repaired }, catalog: [{ id: "episode", evidence, status: "made" as const }] };
  const request = identityRequest(input, "pairs");
  assert.doesNotMatch(JSON.stringify(request.questions), /sub-page of settings/);
  assert.equal(input.catalog[0].id, "episode");
  assert.equal(evidence.intent, "Audio Engineering Basics: a sub-page of settings", "reading leaves saved evidence intact");
});

test("explicit setting pickers and destructive actions retain their specific intent", () => {
  const base = { app: "Podcasts", from: { title: "Preferences", archetype: "settings" } };
  assert.match(destination({ ...base, via: { kind: "row", label: "Theme", data: { control: "value", value: "Dark" } } }).screen, /Choose Theme/);
  assert.equal(destination({ ...base, via: { kind: "row", label: "Sign out", data: { control: "danger" } } }).screen, "Confirm: Sign out");
});

test("rendered identity uses the current subject, replays edits, and excludes linked subjects", async () => {
  const before = await create();
  const messages = [
    { version: "v0.9", updateDataModel: { path: "/header", value: { title: "Partial" } } },
    { version: "v0.9", updateDataModel: { path: "/header", value: { title: "Sourdough Bread", subtitle: "Our original loaf" } } },
    { version: "v0.9", updateDataModel: { path: "/facts", value: [{ label: "Hydration", value: "70%" }] } },
    { version: "v0.9", updateDataModel: { path: "/facts/0/value", value: "75%" } },
    { version: "v0.9", updateDataModel: { path: "/list", value: { items: [{ title: "A different bread" }] } } },
    { version: "v0.9", updateDataModel: { path: "/hero", value: { imageUrl: "https://example.com/huge-image" } } },
  ];
  const state = withRenderedScreens(before, [{ destination: "first", title: "Sourdough Bread", archetype: "detail", running: false, messages }]);
  const record = state.catalog!.find((c) => c.id === "first")!;
  assert.equal(record.status, "made");
  assert.match(record.rendered!.content, /75%/);
  assert.doesNotMatch(record.rendered!.content, /Partial|70%|A different bread|huge-image/);
  assert.equal(before.catalog![0].rendered, undefined, "capture does not mutate undo snapshots");
  const roundTrip = ARCHITECTURE.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(roundTrip.catalog![0].rendered, record.rendered);
  const input = { app: "Breads", requested: requested("Sourdough Bread"), catalog: roundTrip.catalog! };
  assert.match(JSON.stringify(identityRequest(input, "pairs").questions), /75%/);
  assert.match(partPrompt("Bread home", "list", null, { voice: "", knownScreens: [record.rendered!] }), /75%/);
  const undone = withRenderedScreens(state, []);
  assert.equal(undone.catalog![0].rendered, undefined, "removed screens leave no phantom subjects");
  assert.equal(undone.catalog![0].status, "planned");
});

test("an incomplete mock can supply observed content without pretending generation finished", async () => {
  const state = withRenderedScreens(await create(), [{ destination: "first", title: "Recipe", archetype: "detail", running: true, messages: [{ version: "v0.9", updateDataModel: { path: "/prose", value: { text: "x".repeat(10000) } } }] }]);
  assert.equal(state.catalog![0].status, "generating");
  assert.equal(state.catalog![0].rendered!.content.length, 4000);
  ARCHITECTURE.parse(state);
});

test("collections inherit made subjects without mistaking the app home for a content item", async () => {
  const state = withRenderedScreens(await create(), [
    { destination: "first", title: "Sourdough Bread", archetype: "detail", running: false, messages: [{ version: "v0.9", updateDataModel: { path: "/header", value: { title: "Sourdough Bread" } } }] },
    { destination: "home", title: "Bakery Studio", archetype: "feed", running: false, messages: [{ version: "v0.9", updateDataModel: { path: "/header", value: { title: "Bakery Studio" } } }] },
  ]);
  assert.deepEqual(knownSubjects(state.catalog, "w_collection")?.map((s) => s.title), ["Sourdough Bread"]);
  assert.equal(state.catalog!.find((c) => c.id === "home")!.rendered!.title, "Bakery Studio", "home remains available to the identity resolver");
  assert.deepEqual(knownSubjects(state.catalog, "first"), [], "the current subject is not supplied as a sibling");
});
