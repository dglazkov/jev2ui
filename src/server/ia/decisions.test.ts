import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatesFor, decisionQuestions, assemble, actionForLink, validateAnswers, type Answers } from "./decisions.js";
import { resolveAction, validateMap, type Seed } from "./graph.js";
import { readFile } from "node:fs/promises";
import { CAPTURE } from "../../probe/saved-journey.js";
import { firstSeed } from "../../probe/ia-seed.js";

const seed: Seed = { brief: "Settings for a podcast app", first: { title: "Settings", archetype: "settings", sections: [{ title: "Playback", controls: [{ label: "Skip forward", control: "value" }, { label: "Continuous playback", control: "switch" }] }] }, links: [
  { id: "back", kind: "back", label: "back" },
  { id: "appbar:settings", kind: "appbar", label: "settings" },
  { id: "row:0:0", kind: "row", label: "Skip forward", subject: "Playback / value" },
  { id: "row:0:1", kind: "in_place", label: "Continuous playback", subject: "Playback / switch" },
] };
const a = (choice: string) => ({ choice, probabilities: { [choice]: .99, unknown: .01 } });
const answers = (): Answers => ({ home: a("home"), route_0: a("home"), route_1: a("first"), route_2: a("d_2"), role_2: a("picker"), relation_2: a("child") });

test("a closed map preserves mock identity across entry points and keeps useful picker navigation", () => {
  const candidates = candidatesFor(seed);
  const result = assemble(seed, candidates, answers());
  assert.deepEqual(result.findings, []);
  assert.equal(result.aliases.d_1, "first");
  const { map } = result;
  const cache: Record<string, string> = { first: "original-mock" };
  assert.equal(resolveAction(map, "first", actionForLink(map, "appbar:settings")!, cache).kind, "blocked");
  assert.equal(resolveAction(map, "first", actionForLink(map, "row:0:0")!, cache).destination, "d_2");
  assert.equal(resolveAction(map, "first", actionForLink(map, "row:0:1")!, cache).kind, "in_place");
  const home = resolveAction(map, "first", actionForLink(map, "back")!, cache);
  assert.equal(home.kind, "materialize");
  cache[home.destination!] = "home-mock";
  const returnLink = map.nodes.find((n) => n.id === "home")!.actions[0];
  for (let i = 0; i < 10; i++) assert.deepEqual(resolveAction(map, "home", returnLink, cache), { kind: "reuse", destination: "first", mockId: "original-mock", reason: "Return the already-bound screen mock." });
  assert.deepEqual(cache, { first: "original-mock", home: "home-mock" });
  assert.equal(resolveAction(map, "home", { ...returnLink, target: "invented" }, cache).kind, "outside");
});

test("a single ambiguous decision schedules only that question; unsupported intent stays explicit", () => {
  const all = decisionQuestions(seed, candidatesFor(seed));
  const undecided = answers(); undecided.home = { choice: "home", probabilities: { home: .55, first: .45 } };
  const first = assemble(seed, candidatesFor(seed), undecided);
  assert.deepEqual(first.pending, ["home"]);
  assert.deepEqual(Object.keys(Object.fromEntries(first.pending.map((id) => [id, all[id]]))), ["home"]);
  const settled = assemble(seed, candidatesFor(seed), { ...undecided, home: a("home") });
  assert.equal(settled.findings.length, 0);
  const missing = assemble(seed, candidatesFor(seed), { ...answers(), route_2: a("outside") });
  assert.ok(missing.pending.includes("route_2"));
  assert.equal(actionForLink(missing.map, "row:0:0")!.kind, "unresolved");
  assert.equal(resolveAction(missing.map, "first", actionForLink(missing.map, "row:0:0")!, { first: "original" }).kind, "outside");
  assert.throws(() => validateAnswers({}, all), /Missing or invalid/);
});

test("structural critique detects missing action coverage, dangling links and navigation self-loops", () => {
  const { map } = assemble(seed, candidatesFor(seed), answers());
  const broken = structuredClone(map);
  broken.nodes[0].actions[0].target = "not_in_the_map";
  broken.nodes[0].actions[1] = { ...broken.nodes[0].actions[1], kind: "navigate", target: "first" };
  broken.nodes[0].actions.pop();
  const details = validateMap(broken, seed).map((f) => f.detail).join("\n");
  assert.match(details, /inside the map/); assert.match(details, /current destination/); assert.match(details, /exactly one/);
});

test("candidate construction sees the identical first screen in both captures, not the later mocks or sample values", async () => {
  const read = async (name: string) => CAPTURE.parse(JSON.parse(await readFile(new URL(`../../probe/fixtures/${name}.json`, import.meta.url), "utf8"))).app;
  const short = firstSeed(await read("podcast-settings")).seed;
  const long = firstSeed(await read("podcast-settings-return")).seed;
  assert.deepEqual(short, long);
  const evidence = JSON.stringify({ seed: long, candidates: candidatesFor(long) });
  assert.ok(!evidence.includes("@example.com"));
  assert.ok(!evidence.includes("Podcast Home"));
  assert.ok(!evidence.includes("Premium"));
  assert.ok(!evidence.includes("Playback Settings"));
  assert.equal(short.links.length, 12);
});
