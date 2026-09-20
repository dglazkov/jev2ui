// IA uses only decision calls. Candidate construction, graph repair and navigation are code.
import { proposedApp } from "./ia-neutral.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CAPTURE, savedPlace } from "./saved-journey.js";
import { firstSeed } from "./ia-seed.js";
import { recordIA } from "./ia-recording.js";
import { mapChanges, resolveAction, validateMap, type MapAction, type Resolution } from "../server/ia/graph.js";
import { candidatesFor, decisionQuestions, validateAnswers, assemble, actionForLink, type Answers } from "../server/ia/decisions.js";
import { askJev, endpoints, JEV_MODEL } from "../server/models.js";
import type { Endpoint } from "../shared/events.js";

const started = performance.now();
const args = process.argv.slice(2);
const whole = args.includes("--whole");
if (args.some((a) => !/^--(whole|saved=.+|endpoint=(jev|gev)|batches=[1-3])$/.test(a))) throw new Error("Usage: npm run probe:ia -- [--saved=path.json] [--endpoint=jev|gev] [--batches=1..3] [--whole]");
const saved = args.find((a) => a.startsWith("--saved="))?.slice(8) ?? "src/probe/fixtures/podcast-settings-return.json";
const endpoint = (args.find((a) => a.startsWith("--endpoint="))?.slice(11) ?? "jev") as Endpoint;
const limit = Number(args.find((a) => a.startsWith("--batches="))?.slice(10) ?? 3);
if (!endpoints().includes(endpoint)) throw new Error(`${endpoint} is not configured`);
const raw = JSON.parse(await readFile(saved, "utf8"));
const capture = CAPTURE.parse(raw);
if (createHash("sha256").update(JSON.stringify(raw.app)).digest("hex") !== capture.provenance.sha256) throw new Error("Capture fingerprint mismatch");
const { seed, first } = firstSeed(capture.app);
const candidates = candidatesFor(seed);
const questions = decisionQuestions(seed, candidates);
const trace = await recordIA({ endpoint, model: JEV_MODEL, provenance: capture.provenance, seed, candidates, firstMock: savedPlace(first) });
const { run } = trace;
if (whole) run.experiment = "whole-app";
console.log(`IA observer: http://127.0.0.1:5174/#${run.id}\nRecording: ${trace.file}`);
try {
  let answers: Answers = {};
  let assembly = assemble(seed, candidates, answers);
  run.revisions.push({ number: 0, map: assembly.map, changes: ["Code enumerated the candidate vocabulary; no destination decisions have been made."], structural: assembly.findings, assembly });
  await trace.event("Candidate construction", "answer", { seed, candidates, method: "Code only. No recursive expansion." });
  let stopReason = "", fingerprint = "";
  for (let batch = 1; batch <= limit; batch++) {
    // Only unresolved/contradictory questions are asked again. Settled answers are held fixed.
    const asked = batch === 1 ? questions : Object.fromEntries(assembly.pending.filter((key) => questions[key]).map((key) => [key, questions[key]]));
    if (!Object.keys(asked).length) { stopReason = "No model question can resolve the remaining structural findings; revise the code/candidate grammar."; break; }
    run.phase = batch === 1 ? "Decide destination relationships" : `Resolve ${Object.keys(asked).length} outstanding decisions`;
    const state = { seed, candidates, ...(batch > 1 ? { proposed_map: assembly.map, conflicts: assembly.findings, settled_answers: Object.fromEntries(Object.entries(answers).filter(([key]) => !asked[key])) } : {}) };
    run.calls.decisions++;
    await trace.event(`Decision batch ${batch}`, "request", { state, questions: asked });
    const result = await askJev(state, asked, endpoint);
    run.calls.ms += result.ms; run.calls.inputTokens += result.inputTokens;
    await trace.event(`Decision batch ${batch}`, "answer", result);
    validateAnswers(result.answers, asked);
    answers = { ...answers, ...result.answers };
    const next = assemble(seed, candidates, answers);
    run.revisions.push({ number: batch, map: next.map, changes: mapChanges(assembly.map, next.map), structural: next.findings,
      critique: { answers: result.answers, questions: asked, findings: [], ms: result.ms },
      assembly: { aliases: next.aliases, pending: next.pending, decisions: next.decisions } });
    assembly = next;
    await trace.save();
    console.log(`Batch ${batch}: ${Object.keys(asked).length} questions, ${Math.round(result.ms)} ms, ${assembly.map.nodes.length} destinations, ${assembly.findings.length} outstanding findings.`);
    if (!assembly.findings.length) { stopReason = "All observed actions resolved; the map is closed under the candidate grammar and consistency checks."; break; }
    const nextFingerprint = JSON.stringify({ map: assembly.map, pending: assembly.pending, choices: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a.choice])) });
    if (nextFingerprint === fingerprint) { stopReason = "Outstanding decisions did not change; stopped without generating more candidates or mocks."; break; }
    fingerprint = nextFingerprint;
    if (batch === limit) stopReason = "Decision batch budget reached; unresolved intent remains explicit.";
  }
  if (whole && !assembly.findings.length) {
    const expanded = await proposedApp(trace, assembly.map);
    assembly = { ...assembly, ...expanded };
    stopReason = expanded.stopReason;
  } else if (whole) stopReason = "First-screen decisions remain unresolved; whole-app expansion did not start.";
  const map = assembly.map;
  const navigationFindings = run.refinementStrategy === "construct-and-critique" ? validateMap(map, seed) : assembly.findings;
  run.phase = "Replay with canonical destination IDs";
  await trace.save();
  // Retrospective harness: translate captured taps to the action IDs that would be attached to
  // rendered links. No semantic model runs during navigation. Unrepresented links stay outside.
  async function replay(scenario: string, from: string, action: { kind: string; label: string }, selected: MapAction | undefined, expected: string, observedMock?: string) {
    const resolution: Resolution = navigationFindings.length
      ? { kind: "outside", reason: "The app map still has unresolved decisions; it is not committed for navigation." }
      : selected ? resolveAction(map, from, selected, run.bindings)
      : { kind: "outside", reason: "This captured action is not represented in the map. Revise the map explicitly." };
    let materialization: string | undefined;
    if (resolution.kind === "materialize" && observedMock) {
      run.bindings[resolution.destination!] = observedMock;
      materialization = `Bound held-out saved mock ${observedMock} for replay. No screen-generation call.`;
    }
    const pass = expected === "blocked:first" ? resolution.kind === "blocked" && resolution.destination === "first"
      : expected === "reuse:first" ? resolution.kind === "reuse" && resolution.mockId === String(first.id)
      : expected === "home" ? resolution.destination === map.home && ["reuse", "materialize"].includes(resolution.kind) : false;
    run.replay.push({ scenario, from, action, resolution, choice: selected?.id ?? "outside", expected, pass, ...(observedMock ? { observedMock } : {}), ...(materialization ? { materialization } : {}) });
    await trace.event(`Replay: ${scenario}`, "answer", { method: "Deterministic lookup", actionId: selected?.id, resolution });
    console.log(`${pass ? "✓" : "✗"} ${scenario}: ${resolution.kind} → ${resolution.destination ?? "unresolved"}${resolution.mockId ? ` (mock ${resolution.mockId})` : ""}`);
    return resolution;
  }
  // Saved screens beyond first enter only now; they were not shown to decision batches.
  const gear = capture.app.screens.find((s) => s.keys.includes(`${first.id}:appbar:settings`));
  if (gear && seed.links.some((l) => l.id === "appbar:settings")) await replay("Settings gear", "first", { kind: "appbar", label: "settings" }, actionForLink(map, "appbar:settings"), "blocked:first", String(gear.id));
  const home = capture.app.screens.find((s) => s.keys.includes(`${first.id}:back:back`));
  if (home) {
    const reached = await replay("Leave Settings for Home", "first", { kind: "back", label: "back" }, actionForLink(map, "back"), "home", String(home.id));
    const duplicate = capture.app.screens.find((s) => s.keys.includes("nav:Settings"));
    // Home emits a direct entry for first. Unknown saved labels are not silently routed to first.
    if (duplicate) {
      const via = (duplicate.request.journey as { via?: { label: string } })?.via;
      const from = reached.destination && ["reuse", "materialize"].includes(reached.kind) ? reached.destination : map.home;
      const selected = map.nodes.find((n) => n.id === from)?.actions.find((a) => a.label === via?.label && a.kind === "navigate");
      await replay("Home → Settings tab", from, { kind: "nav", label: via?.label ?? "" }, selected, "reuse:first", String(duplicate.id));
    }
  }
  run.status = assembly.findings.length || run.replay.some((r) => !r.pass) ? "needs_review" : run.proposalSummary?.resolved ? "resolved" : "stable";
  run.phase = "Finished";
  run.wallMs = performance.now() - started;
  run.summary = { revisions: run.revisions.length, destinations: map.nodes.length, actions: map.nodes.reduce((n, d) => n + d.actions.length, 0), unresolved: assembly.findings.length, replayPassed: run.replay.filter((r) => r.pass).length, replayTotal: run.replay.length, stopReason };
  await trace.event("Finish", "stop", { ...run.summary, calls: run.calls, findings: assembly.findings });
  console.log(`${run.status}: ${stopReason}\n${run.calls.decisions} decision calls; 0 generation calls; 0 navigation calls.`);
} catch (error) {
  run.status = "failed"; run.error = String(error); run.phase = "Failed";
  await trace.event(run.phase, "error", { message: String(error) });
  throw error;
}
