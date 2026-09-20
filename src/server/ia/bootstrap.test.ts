import { test } from "node:test";
import assert from "node:assert/strict";
import { initialArchitecture, initialNavigationQuestions } from "./bootstrap.js";
import { architectureNav, ARCHITECTURE } from "../../shared/architecture.js";
import { connectDestination } from "../../shared/catalog.js";
import type { ScreenPlan } from "../mock/plan.js";

const answer = (choice: string) => ({ choice, probabilities: { [choice]: 1 } });
function initial(overrides: Record<string, string> = {}, topLevel = false) {
  const answers = Object.fromEntries(Object.keys(initialNavigationQuestions()).map((id) => [id, answer(overrides[id] ?? (id === "nav_home" ? "separate" : "omit"))]));
  // Screen-plan noul answers share the same response; navigation must only store its own choices.
  return initialArchitecture("Settings screen for a podcast app", { archetype: "settings", topLevel } as ScreenPlan, { ...answers, has_groups: { noul: 1 } } as any);
}

test("initial navigation is immediately ready and reuses the requested preferences screen", () => {
  const state = initial({ nav_w_preferences: "first", nav_w_collection: "separate" });
  assert.equal(state.status, "ready");
  assert.deepEqual(state.findings, []);
  assert.equal(state.aliases.w_preferences, "first");
  assert.deepEqual(state.map.nodes.map((n) => n.id), ["first", "home", "w_collection"]);
  assert.equal(state.catalog!.length, 3);
  assert.equal(state.answers.has_groups, undefined);
  assert.equal(state.map.nodes[0].actions.find((a) => a.kind === "back")!.target, "home");
  assert.deepEqual(architectureNav(state, "w_collection").items.map((n) => n.destination), ["home", "first", "w_collection"]);
  assert.equal(architectureNav(state, "w_collection").active, 2);
});

test("a requested home reuses first without creating a second home or self-navigation", () => {
  const state = initial({ nav_home: "first", nav_w_monitor: "first", nav_w_preferences: "separate" }, true);
  assert.equal(state.map.home, "first");
  assert.ok(!state.map.nodes.some((n) => n.id === "home"));
  assert.deepEqual(state.navigation, ["first", "w_preferences"]);
  assert.ok(state.map.nodes.every((n) => n.actions.every((a) => a.target !== n.id)));
  assert.equal(architectureNav(state, "first").items[0].icon, "home");
  ARCHITECTURE.parse(state);
});

test("discovering a detail expands the map without adding it to main navigation", () => {
  const state = initial({ nav_w_collection: "separate" });
  const next = connectDestination(state, "home", { from: { title: "Podcasts", archetype: "feed" }, link: { kind: "item", label: "Audio Engineering Basics" }, intent: "Details of Audio Engineering Basics" }, { kind: "new" });
  assert.equal(next.state.map.nodes.length, state.map.nodes.length + 1);
  assert.deepEqual(next.state.navigation, state.navigation);
  assert.deepEqual(architectureNav(next.state, "home"), architectureNav(state, "home"));
  assert.equal(next.state.catalog!.find((c) => c.id === next.destination)!.evidence.link.label, "Audio Engineering Basics");
});

test("initial navigation stays bounded and rejects dangling saved navigation", () => {
  const overrides = Object.fromEntries(Object.keys(initialNavigationQuestions()).map((id) => [id, "separate"]));
  const state = initial(overrides, true);
  assert.equal(state.navigation!.length, 5);
  ARCHITECTURE.parse(state);
  assert.equal(ARCHITECTURE.safeParse({ ...state, navigation: ["missing"] }).success, false);
});
