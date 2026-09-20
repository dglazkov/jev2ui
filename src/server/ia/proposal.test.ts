import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeApp, concreteJourneys, journeyQuestions, reviewProposal, repairProposal, scopeExclusions, proposalScopeQuestions } from "./proposal.js";
import { validateMap, resolveAction, type Seed, type AppMap } from "./graph.js";
const seed: Seed = { brief: "Podcast app settings", first: { title: "Settings", archetype: "settings", sections: [] }, links: [{ id: "gear", kind: "appbar", label: "Settings" }, { id: "back", kind: "back", label: "Back" }] };
const base: AppMap = { boundary: "Test", home: "home", nodes: [
  { id: "first", label: "Settings", purpose: "Original settings", actions: [
    { id: "gear", label: "Settings", kind: "remove", target: null, sourceLink: "gear" },
    { id: "back", label: "Back", kind: "back", target: "home", sourceLink: "back" },
  ] },
  { id: "home", label: "Home", purpose: "Home", actions: [{ id: "settings", label: "Settings", kind: "navigate", target: "first", sourceLink: null }] },
] };
const a = (choice: string, p = .99) => ({ choice, probabilities: { [choice]: p, unknown: 1 - p } });
const judgments = (map: AppMap, excluded = new Set<string>()) => Object.fromEntries(Object.keys(journeyQuestions(map, concreteJourneys(map, excluded), [...excluded])).map((key) => [key, a("works")]));

test("one complete proposed IA has executable tasks and returns before any critique", () => {
  const map = proposeApp(base);
  assert.deepEqual(validateMap(map, seed), []);
  assert.ok(concreteJourneys(map).every((j) => j.path && j.returnPath && j.activityAvailable));
  assert.ok(map.nodes.every((n) => n.actions.every((a) => a.kind !== "unresolved")));
  assert.deepEqual(map.nodes[0], base.nodes[0]);
  const settings = map.nodes.find((n) => n.id === "w_profile")!.actions.find((a) => a.target === "first")!;
  assert.equal(resolveAction(map, "w_profile", settings, { first: "original-mock" }).mockId, "original-mock");
  assert.deepEqual(concreteJourneys(map).find((j) => j.id === "saved")!.path, ["home", "w_library", "w_item", "w_active"]);
});

test("scope and critique choose a possible design without the previous confidence veto", () => {
  const scope = Object.fromEntries(Object.keys(proposalScopeQuestions()).map((key) => [key, a("include", .51)]));
  scope.scope_create = a("omit", .51);
  const excluded = scopeExclusions(scope);
  const scoped = repairProposal(proposeApp(base), { journeys: [], findings: [], repairs: [] }, excluded, new Set(["first", "home"]));
  assert.ok(!scoped.map.nodes.some((n) => n.id === "w_create"));
  assert.deepEqual(validateMap(scoped.map, seed), []);
  const answers = judgments(scoped.map, excluded); answers.journey_saved = a("works", .51);
  const review = reviewProposal(scoped.map, concreteJourneys(scoped.map, excluded), answers, seed);
  assert.deepEqual(review.findings, []);
  assert.deepEqual(review.repairs, []);
  assert.equal(review.journeys.find((j) => j.id === "saved")!.p, .51);
});

test("critique repairs a concrete task and prunes extra scope without deleting shared destinations", () => {
  const map = proposeApp(base), before = concreteJourneys(map), answers = judgments(map);
  answers.journey_saved = a("shortcut"); answers.journey_create = a("unnecessary"); answers.journey_discover = a("unnecessary");
  const review = reviewProposal(map, before, answers, seed);
  const repaired = repairProposal(map, review, new Set(), new Set(["first", "home"]));
  assert.ok(repaired.excluded.has("discover"));
  assert.ok(!repaired.map.nodes.some((n) => n.id === "w_browse"));
  assert.ok(!repaired.map.nodes.some((n) => n.id === "w_create"));
  assert.ok(repaired.map.nodes.some((n) => n.id === "w_item"));
  assert.deepEqual(validateMap(repaired.map, seed), []);
  const after = concreteJourneys(repaired.map, repaired.excluded);
  assert.deepEqual(after.find((j) => j.id === "saved")!.path, ["home", "w_library", "w_active"]);
  assert.equal(after.find((j) => j.id === "saved")!.repair, undefined);
  assert.deepEqual(reviewProposal(repaired.map, after, judgments(repaired.map, repaired.excluded), seed).findings, []);
  assert.deepEqual(map.nodes[0], base.nodes[0]);
});

test("a model approval cannot hide a broken local activity or return; unknown remains a review note, not a dangling link", () => {
  const map = proposeApp(base);
  map.nodes.find((n) => n.id === "w_active")!.actions = [];
  const review = reviewProposal(map, concreteJourneys(map), judgments(map), seed);
  assert.ok(review.findings.some((f) => f.id === "journey:saved"));
  const closed = proposeApp(base), answers = judgments(closed); answers.coverage = a("unknown");
  const unknown = reviewProposal(closed, concreteJourneys(closed), answers, seed);
  assert.deepEqual(validateMap(closed, seed), []);
  assert.equal(unknown.findings[0].id, "coverage");
  assert.equal(closed.nodes.flatMap((n) => n.actions).filter((a) => a.kind === "unresolved").length, 0);
});
