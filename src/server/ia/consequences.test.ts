import { test } from "node:test";
import assert from "node:assert/strict";
import { applyConsequences, linkEvidence, supportedPath, recheckOptional, mapIssues } from "./consequences.js";
import type { AppMap } from "./graph.js";
import type { LinkDecision } from "./whole.js";
const a = (choice: string) => ({ choice, probabilities: { [choice]: .99, unknown: .01 } });
const edge = (to: string) => ({ id: `to_${to}`, label: to, kind: "navigate" as const, target: to, sourceLink: null });
const base = (): AppMap => ({ boundary: "Test", home: "home", nodes: [
  { id: "first", label: "Settings", purpose: "Settings", actions: [] },
  { id: "home", label: "Home", purpose: "Home", actions: [edge("first")] },
  { id: "w_library", label: "Library", purpose: "Library", actions: [edge("w_item")] },
  { id: "w_item", label: "Item", purpose: "Item", actions: [edge("w_active")] },
  { id: "w_active", label: "Playback", purpose: "Playback", actions: [] },
] });
const unresolved = (from: string, to: string): LinkDecision => ({ id: `edge_${from}_${to}`, from, to, status: "unresolved", choice: "include", p: .5 });

test("task consequences add required entry, defer a supported shortcut and omit irrelevant links independently", () => {
  const map = base(), links = [unresolved("home", "w_library"), unresolved("w_library", "w_active"), unresolved("w_active", "first")];
  const evidence = linkEvidence(map, links, []);
  assert.deepEqual(evidence[0].newlyReachableFromHome.sort(), ["w_active", "w_item", "w_library"]);
  assert.deepEqual(evidence[1].alternative, ["w_library", "w_item", "w_active"]);
  const result = applyConsequences(map, links, evidence, { impact_edge_home_w_library: a("required"), impact_edge_w_library_w_active: a("optional"), impact_edge_w_active_first: a("unnecessary") });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.links.map((l) => l.status), ["navigate", "optional", "omit"]);
  assert.deepEqual(supportedPath(result.map, "home", "w_active"), ["home", "w_library", "w_item", "w_active"]);
  assert.equal(result.map.nodes.find((n) => n.id === "w_library")!.actions.length, 1);
  assert.deepEqual(mapIssues(result.map, result.findings, result.links).map((i) => i.category), ["optional"]);
  assert.deepEqual(result.map.nodes[0], map.nodes[0]);
  assert.equal(map.nodes[1].actions.length, 1);
});

test("an optional judgment cannot manufacture its supporting route from simultaneous decisions", () => {
  const map = base(); map.nodes.find((n) => n.id === "w_item")!.actions = [];
  const links = [unresolved("w_item", "w_active"), unresolved("w_library", "w_active")];
  const result = applyConsequences(map, links, linkEvidence(map, links, []), { impact_edge_w_item_w_active: a("required"), impact_edge_w_library_w_active: a("optional") });
  assert.ok(supportedPath(result.map, "w_library", "w_active"));
  assert.equal(result.links[1].status, "unresolved");
  assert.match(result.findings[0].detail, /no supported alternative/);
});

test("uncertain and responsibility answers stay explicit, while computed paths alone do not settle intent", () => {
  const map = base(), links = [unresolved("w_library", "w_active"), unresolved("home", "w_library")];
  const scope = [{ id: "scope_w_library", severity: "uncertain" as const, detail: "Unsettled Library" }];
  const evidence = linkEvidence(map, links, scope);
  assert.deepEqual(evidence[0].unsettledEndpoints, ["w_library"]);
  const result = applyConsequences(map, links, evidence, { impact_edge_w_library_w_active: { choice: "optional", probabilities: { optional: .6, required: .4 } }, impact_edge_home_w_library: a("responsibility") });
  assert.deepEqual(result.links.map((l) => l.status), ["unresolved", "unresolved"]);
  assert.deepEqual(mapIssues(map, result.findings, result.links).map((i) => i.category), ["unassessed", "responsibility"]);
  assert.equal(supportedPath(map, "home", "w_active"), null);
});

test("pruning that breaks an alternative reopens the shortcut decision", () => {
  const map = base(), links = [unresolved("w_library", "w_active")];
  const result = applyConsequences(map, links, linkEvidence(map, links, []), { impact_edge_w_library_w_active: a("optional") });
  assert.equal(recheckOptional(result.map, result.links)[0].status, "optional");
  result.map.nodes.find((n) => n.id === "w_item")!.actions = [];
  const checked = recheckOptional(result.map, result.links);
  assert.equal(checked[0].status, "unresolved");
  assert.match(checked[0].assessment!.reason!, /no longer exists/);
});
