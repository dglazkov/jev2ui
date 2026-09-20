import { test } from "node:test";
import assert from "node:assert/strict";
import { prune, connect, expansionDraft, supportedChoice, connectionQuestions } from "./whole.js";
import { validateMap, resolveAction, type AppMap, type Seed } from "./graph.js";
const a = (choice: string) => ({ choice, probabilities: { [choice]: .99, unknown: .01 } });
const seed: Seed = { brief: "A content app", first: { title: "Settings", archetype: "settings", sections: [] }, links: [{ id: "gear", kind: "appbar", label: "Settings" }] };
const base: AppMap = { boundary: "Test", home: "home", nodes: [
  { id: "first", label: "Settings", purpose: "Settings overview", actions: [{ id: "gear", label: "Settings", kind: "remove", target: null, sourceLink: "gear" }] },
  { id: "home", label: "Home", purpose: "Starting point", actions: [{ id: "settings", label: "Settings", kind: "navigate", target: "first", sourceLink: null }] },
] };

test("whole-app expansion prunes a finite vocabulary and closes a multi-step journey without replacing the mock", () => {
  const draft = expansionDraft(base);
  const ids = draft.nodes.filter((n) => n.id.startsWith("w_")).map((n) => n.id);
  const trimmed = prune(draft, Object.fromEntries(ids.map((id) => [`scope_${id}`, a(["w_library", "w_item", "w_active"].includes(id) ? "keep" : "omit")])), ids);
  assert.equal(trimmed.map.nodes.length, 5);
  const idsToConnect = ["w_library", "w_item", "w_active"];
  const answers = Object.fromEntries(Object.keys(connectionQuestions(trimmed.map, idsToConnect)).map((key) => [key, a(key.startsWith("edge_") ? "omit" : "view")]));
  Object.assign(answers, {
    edge_home_w_library: a("include"), edge_w_library_home: a("include"),
    edge_w_library_w_item: a("include"), edge_w_library_w_active: a("include"),
    edge_w_item_w_library: a("include"), edge_w_item_w_active: a("include"),
    edge_w_active_w_item: a("include"), local_w_active: a("consume"),
  });
  const { map, findings } = connect(trimmed.map, idsToConnect, answers);
  assert.deepEqual(findings, []); assert.deepEqual(validateMap(map, seed), []);
  const home = map.nodes.find((n) => n.id === "home")!;
  assert.equal(resolveAction(map, "home", home.actions[0], { first: "original" }).mockId, "original");
  const library = map.nodes.find((n) => n.id === "w_library")!;
  assert.equal(library.actions.filter((a) => a.kind === "navigate" && a.target === "w_item").length, 1);
  assert.deepEqual(library.actions.filter((a) => a.kind === "navigate").map((a) => a.target).sort(), ["home", "w_active", "w_item"]);
  assert.deepEqual(base.nodes[1].actions.map((a) => a.target), ["first"]);
});

test("identity merges redirect incoming links, remove self loops and preserve the first anchor", () => {
  const map: AppMap = structuredClone(base);
  map.nodes.push({ id: "w_profile", label: "Duplicate settings", purpose: "same responsibility", actions: [] });
  map.nodes[0].actions.push({ id: "duplicate", label: "Gear", kind: "navigate", target: "w_profile", sourceLink: null });
  map.nodes[1].actions.push({ id: "profile", label: "Profile", kind: "navigate", target: "w_profile", sourceLink: null });
  const result = prune(map, { scope_w_profile: a("first") }, ["w_profile"]);
  assert.deepEqual(validateMap(result.map, seed), []);
  assert.equal(result.map.nodes[0].actions.at(-1)!.kind, "remove");
  assert.equal(result.map.nodes[1].actions.at(-1)!.target, "first");
  assert.throws(() => prune(map, { scope_first: a("omit") }, ["first"]), /anchor/);
});

test("uncertainty and contradictory pruning stay visible; observed intent is never silently dropped", () => {
  const map = expansionDraft(base);
  map.nodes[0].actions[0] = { ...map.nodes[0].actions[0], kind: "navigate", target: "w_item" };
  const result = prune(map, { scope_w_item: a("omit"), scope_w_library: a("w_item"), scope_w_profile: { choice: "omit", probabilities: { omit: .6, keep: .4 } } }, ["w_item", "w_library", "w_profile"]);
  assert.equal(result.map.nodes[0].actions[0].kind, "unresolved");
  assert.ok(result.findings.some((f) => f.id === "scope_w_library"));
  assert.ok(result.findings.some((f) => f.id === "scope_w_profile"));
  assert.ok(result.map.nodes.some((n) => n.id === "w_profile"));
  assert.equal(supportedChoice({ choice: "keep", probabilities: { keep: .66, omit: .6 } }), undefined);
});


test("independent links distinguish unresolved from omitted and do not imply a reverse link", () => {
  const draft = expansionDraft(base);
  const ids = ["w_library", "w_item", "w_active"];
  draft.nodes = draft.nodes.filter((n) => !n.id.startsWith("w_") || ids.includes(n.id));
  const questions = connectionQuestions(draft, ids);
  assert.ok(!Object.keys(questions).some((key) => key.startsWith("next_") || key.startsWith("entry_")));
  const answers = Object.fromEntries(Object.keys(questions).map((key) => [key, a(key.startsWith("edge_") ? "omit" : "view")]));
  Object.assign(answers, { edge_w_library_w_item: a("include"), edge_w_library_w_active: { choice: "include", probabilities: { include: .55, omit: .45 } } });
  const unresolved = connect(draft, ids, answers);
  assert.equal(unresolved.links.find((l) => l.id === "edge_w_library_w_active")!.status, "unresolved");
  assert.equal(unresolved.links.find((l) => l.id === "edge_w_item_w_library")!.status, "omit");
  assert.deepEqual(unresolved.findings.map((f) => f.id), ["edge_w_library_w_active"]);
  assert.equal(unresolved.map.nodes.find((n) => n.id === "w_item")!.actions.length, 0);
  const settled = connect(draft, ids, { ...answers, edge_w_library_w_active: a("include") });
  assert.deepEqual(settled.findings, []);
  assert.equal(settled.map.nodes.find((n) => n.id === "w_library")!.actions.length, 2);
  assert.equal(new Set(settled.map.nodes.find((n) => n.id === "w_library")!.actions.map((a) => a.id)).size, 2);
  assert.equal(settled.map.nodes[0].actions.length, base.nodes[0].actions.length);
});
