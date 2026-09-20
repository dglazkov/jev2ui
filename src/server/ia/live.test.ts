import { test } from "node:test";
import assert from "node:assert/strict";
import { createArchitecture, plannedSeed, reviseArchitecture, type AskArchitecture } from "./live.js";
import { ACTIVITIES } from "./neutral.js";
import { WHOLE_CANDIDATES } from "./roles.js";
import { bindControls, controlsFor } from "./controls.js";
import { ARCHITECTURE, rebaseRoutes, routeAction, boundScreens } from "../../shared/architecture.js";
import { SAVED_APP } from "../../shared/saved.js";
import type { A2uiMessage } from "../../shared/events.js";

const answer = (choice: string) => ({ choice, probabilities: { [choice]: 1 } });
const choices = () => ({ anchor: answer("w_preferences"), activity: answer("configure"), pattern: answer("configure"),
  ...Object.fromEntries(WHOLE_CANDIDATES.map((c) => [`use_${c.id}`, answer(c.id === "w_preferences" ? "first" : c.id === "w_collection" ? "separate" : "omit")])),
  ...Object.fromEntries(Object.keys(ACTIVITIES).map((key) => [`first_activity_${key}`, answer("omit")])) });
const ask: AskArchitecture = async (stage, _state, questions) => ({ answers: stage === "Jev: plan the app" ? choices() : Object.fromEntries(Object.keys(questions).map((id) => [id, answer("works")])), ms: 1, inputTokens: 0, endpoint: "jev" });
const seed = () => plannedSeed("Settings for a podcast app", { archetype: "settings" });
const create = () => createArchitecture(seed(), ask, () => {});

test("known map routes open before generated controls are bound, but never during map review", async () => {
  const state = await create();
  assert.equal(routeAction(state, "first", undefined, "back")?.target, "home");
  assert.equal(routeAction(state, "home", undefined, "nav:first")?.target, "first");
  assert.equal(routeAction(state, "home", undefined, "appbar:settings")?.target, "first");
  assert.equal(routeAction(state, "home", undefined, "nav:home")?.kind, "remove");
  assert.equal(routeAction(state, "home", undefined, "nav:missing"), undefined);
  assert.equal(routeAction(state, "home", undefined, "item:/list/items/0"), undefined);
  assert.equal(routeAction({ ...state, status: "reviewing" }, "first", undefined, "back"), undefined);
});

test("construction emits a valid draft before bounded Jev review, with no writing dependency", async () => {
  const seen: string[] = [], calls: string[] = [];
  const state = await createArchitecture(seed(), async (...args) => { calls.push(args[0]); return ask(...args); }, (state) => { ARCHITECTURE.parse(state); seen.push(state.status); });
  assert.deepEqual(seen, ["reviewing", "ready"]);
  assert.equal(calls.length, 2);
  assert.equal(state.aliases.w_preferences, "first");
  assert.equal(state.revision, 1);
});

test("review failure preserves a structurally closed map and reports uncertainty", async () => {
  const state = await createArchitecture(seed(), async (...args) => { if (args[0] !== "Jev: plan the app") throw new Error("offline"); return ask(...args); }, () => {});
  assert.equal(state.status, "review");
  assert.ok(state.findings.some((f) => f.id === "review-failed"));
  ARCHITECTURE.parse(state);
});

test("an edit keeps unrelated decisions, retains the original binding, and adds a finite destination", async () => {
  const old = await create();
  const changed = await reviseArchitecture(old, "Add a help page", "first", ["first"], async (stage, state, questions) => {
    if (stage !== "Jev: revise the app map") return ask(stage, state, questions);
    return { answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answer(id === "destination" ? "w_help" : id === "use_w_help" ? "separate" : "keep")])), ms: 1, inputTokens: 0, endpoint: "jev" };
  });
  assert.equal(changed.destination, "w_help");
  assert.equal(changed.state.revision, 2);
  assert.equal(changed.state.aliases.w_preferences, "first");
  assert.equal(changed.state.answers.activity.choice, old.answers.activity.choice);
  assert.ok(!old.map.nodes.some((n) => n.id === "w_help"));
  assert.equal(changed.state.notes[0].destination, "w_help");
});

const messages: A2uiMessage[] = [
  { version: "v0.9", updateComponents: { surfaceId: "main", components: [{ id: "bar", component: "AppBar", leading: "back", actions: [] }] } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/groups", value: [{ rows: [{ label: "Offline", control: "switch" }, { label: "Premium account", control: "nav" }] }] } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/groups/0/rows/1/label", value: "Manage subscription" } },
];

test("binding uses final rendered controls, resolves back without interpretation and marks unsupported routes", async () => {
  assert.equal(controlsFor(messages).find((c) => c.source === "row:/groups/0/rows/1")?.label, "Manage subscription");
  const state = await create();
  let calls = 0;
  const routes = await bindControls(state, "first", messages, async (_stage, _state, questions) => {
    calls++; return { answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answer("outside")])), ms: 1, inputTokens: 0, endpoint: "jev" };
  });
  assert.equal(calls, 1);
  assert.equal(routeAction(state, "first", routes, "back")?.target, "home");
  assert.equal(routeAction(state, "first", routes, "row:/groups/0/rows/0")?.kind, "in_place");
  assert.equal(routeAction(state, "first", routes, "row:/groups/0/rows/1"), undefined);
  assert.equal(routes.findings.length, 1);
  const after = structuredClone(state); after.revision++;
  assert.equal(routeAction(after, "first", routes, "back"), undefined);
  const rebased = rebaseRoutes(state, after, "first", routes);
  assert.equal(routeAction(after, "first", rebased, "back")?.target, "home");
  after.map.nodes.find((n) => n.id === "first")!.actions = [];
  assert.equal(rebaseRoutes(state, after, "first", routes)?.controls.back.kind, "outside");
});

test("a resolved link reuses its canonical screen despite different labels and legacy subject hints", async () => {
  const state = await create();
  const original = { id: 1, destination: "first", title: "Original screen" };
  const home = state.map.nodes.find((n) => n.id === "home")!;
  const action = home.actions.find((a) => a.target === "first")!;
  const routes = { revision: state.revision, controls: { "item:/list/items/0": { label: "A different generated link label", kind: "action" as const, action: action.id, subject: true } }, findings: [] };
  const target = routeAction(state, "home", routes, "item:/list/items/0")?.target;
  assert.equal(boundScreens([original]).get(target!), original);
  assert.equal(boundScreens([{ ...original, subject: "old generated subject" }]).get(target!)?.id, original.id);
});

test("saved map and routes round trip, old snapshots stay readable, duplicate destinations are rejected", async () => {
  const architecture = await create();
  const screen = { id: 1, keys: ["start"], title: "Settings", archetype: "settings", topLevel: false, dialog: false, messages, log: [], request: { prompt: seed().brief } };
  const legacy = { version: 2, app: seed().brief, design: { choice: "auto", markdown: "", seed: 0 }, screens: [screen], stack: [1] };
  assert.equal(SAVED_APP.parse(legacy).architecture, undefined);
  const saved = { ...legacy, version: 3, architecture, screens: [{ ...screen, destination: "first" }] };
  assert.deepEqual(SAVED_APP.parse(JSON.parse(JSON.stringify(saved))).architecture, architecture);
  assert.equal(SAVED_APP.safeParse({ ...saved, screens: [saved.screens[0], { ...saved.screens[0], id: 2, keys: ["second"] }] }).success, false);
});

test("unchanged content can be rebound to a new map action without a content writer", async () => {
  const state = await create();
  const { bindObservedControls } = await import("./controls.js");
  const revised = structuredClone(state); revised.revision++;
  const node = revised.map.nodes.find((n) => n.id === "first")!;
  node.actions.push({ id: "browse", label: "Browse podcasts", kind: "navigate", target: "w_collection", sourceLink: null });
  const observed = [{ source: "action:/actions/0", kind: "action", label: "Browse podcasts" }];
  let requests = 0;
  const routes = await bindObservedControls(revised, "first", observed, async (_stage, _state, questions) => {
    requests++;
    assert.deepEqual(Object.keys(questions), ["c0"]);
    return { answers: { c0: answer(`a${node.actions.length - 1}`) }, inputTokens: 0, ms: 1, endpoint: "jev" };
  });
  assert.equal(requests, 1);
  assert.equal(routeAction(revised, "first", routes, observed[0].source)?.target, "w_collection");
  assert.deepEqual(routes.observed, observed);
});
