import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { PROMPTS } from "./custom.js";
import { askJev, JEV_MODEL, endpoints } from "../server/models.js";
import { SCREEN } from "../server/mock/graph.js";
import { questionsOf } from "../server/grammar/read.js";
import { recordIA } from "./ia-recording.js";
import { proposedApp as contentApp } from "./ia-proposal.js";
import { proposedApp as neutralApp } from "./ia-neutral.js";
import { validateMap, type AppMap, type Seed } from "../server/ia/graph.js";
import type { Endpoint } from "../shared/events.js";

const args = process.argv.slice(2);
if (args.some((a) => !/^--(variant=(baseline|neutral|neutral-v[0-9]+)|suite=[\w-]+|endpoint=(jev|gev))$/.test(a))) throw new Error("Usage: probe:ia:samples -- --variant=baseline|neutral [--suite=id] [--endpoint=jev|gev]");
const variant = args.find((a) => a.startsWith("--variant="))?.slice(10) ?? "baseline";
const suiteId = args.find((a) => a.startsWith("--suite="))?.slice(8) ?? new Date().toISOString().replace(/[:.]/g, "-");
const endpoint = (args.find((a) => a.startsWith("--endpoint="))?.slice(11) ?? "jev") as Endpoint;
if (!endpoints().includes(endpoint)) throw new Error(`${endpoint} not configured`);
const directory = resolve(".cache/ia-suites", suiteId); await mkdir(directory, { recursive: true });
const file = resolve(directory, "report.json");
const suite: any = await readFile(file, "utf8").then(JSON.parse).catch((e) => { if (e.code !== "ENOENT") throw e; return { id: suiteId, started: new Date().toISOString(), source: "src/probe/custom.ts", rows: PROMPTS.map(([prompt], index) => ({ index, prompt })), variants: {} }; });
if (suite.rows.length !== PROMPTS.length || suite.rows.some((r: any, i: number) => r.prompt !== PROMPTS[i][0])) throw new Error("Prompt corpus changed; start a new suite.");
if (suite.variants[variant]) throw new Error(`Variant ${variant} already exists in ${suiteId}; refusing to overwrite results.`);
let saving = Promise.resolve();
const save = () => { const json = JSON.stringify(suite, null, 2); saving = saving.then(async () => { await writeFile(`${file}.tmp`, json); await rename(`${file}.tmp`, file); }); return saving; };
const sources = ["src/probe/custom.ts", "src/probe/ia-proposal.ts", "src/server/ia/proposal.ts", "src/server/ia/whole.ts", "src/server/ia/roles.ts", "src/server/ia/neutral.ts", "src/probe/ia-neutral.ts"];
const hashes: Record<string, string> = {};
for (const source of sources) { const text = await readFile(source, "utf8"); hashes[source] = createHash("sha256").update(text).digest("hex"); await writeFile(resolve(directory, `${variant}-${source.replaceAll("/", "_")}`), text); }
suite.variants[variant] = { status: "running", started: new Date().toISOString(), endpoint, hashes, generationCalls: 0 };
await save(); console.log(`Suite ${suiteId} · ${variant} · ${PROMPTS.length} prompts\nObserver: http://127.0.0.1:5174/samples#${suiteId}`);
const all = questionsOf(SCREEN);
const planQs = Object.fromEntries(Object.entries(all).filter(([id]) => ["archetype", "has_custom", "custom_use"].includes(id)));
async function sample(index: number) {
  const row = suite.rows[index], start = performance.now();
  const seed: Seed = { brief: row.prompt, first: { title: row.prompt, archetype: "planned", sections: [] }, links: [] };
  const trace = await recordIA({ endpoint, model: JEV_MODEL, provenance: { url: "", capturedAt: suite.started, sha256: hashes["src/probe/custom.ts"] }, seed, candidates: [], firstMock: { id: "planned-first", title: row.prompt, shows: "Prompt-only first-screen plan. No rendered mock, content generation or Firestore capture." } });
  const { run } = trace; run.experiment = "whole-app";
  run.sample = { index, variant, suiteId, seedMode: "prompt-plan" };
  row[variant] = { status: "running", runId: run.id }; await save();
  try {
    let plan: any;
    if (variant !== "baseline") {
      if (!row.baseline?.seedPlan) throw new Error("Baseline seed plan is missing; run baseline first.");
      plan = structuredClone(row.baseline.seedPlan);
      await trace.event("Reuse baseline first-screen plan", "answer", { plan, method: "Identical input to both vocabularies; no model call." });
    } else {
      run.calls.decisions++; await trace.event("Plan first-screen responsibility", "request", { state: { screen: row.prompt }, questions: planQs });
      const result = await askJev({ screen: row.prompt }, planQs, endpoint);
      run.calls.ms += result.ms; run.calls.inputTokens += result.inputTokens;
      await trace.event("Plan first-screen responsibility", "answer", result); plan = result.answers;
    }
    const archetype = plan.archetype.choice, custom = plan.has_custom.noul >= .55;
    const operation = custom ? ({ watch: "Observe live state", pick: "Choose an option", adjust: "Adjust or interact", read: "Inspect information" } as Record<string, string>)[plan.custom_use.choice] ?? "Interact with the subject"
      : ({ feed: "Select an item", dashboard: "Inspect status", detail: "Inspect information", guide: "Follow instructions", settings: "Change preferences", form: "Submit details", checkout: "Commit transaction", result: "Acknowledge result", confirm: "Confirm action" } as Record<string, string>)[archetype] ?? "Interact with the subject";
    seed.first.archetype = archetype;
    seed.first.sections = [{ title: "Proposed primary responsibility", controls: [{ label: operation, control: custom ? plan.custom_use.choice : archetype }] }];
    seed.links = [{ id: "primary", label: operation, kind: "in_place" }, { id: "back", label: "Back", kind: "back" }];
    const base: AppMap = { boundary: "Prompt-only planned anchor, not an observed or generated mock. Home and a return are explicit design assumptions.", home: "home", nodes: [
      { id: "first", label: row.prompt, purpose: `The requested ${archetype} responsibility: ${row.prompt}. Main activity: ${operation}.`, actions: [
        { id: "primary", label: operation, kind: ["form", "checkout", "confirm"].includes(archetype) && !custom ? "complete" : "in_place", target: null, sourceLink: "primary" },
        { id: "back", label: "Back", kind: "back", target: "home", sourceLink: "back" },
      ] },
      { id: "home", label: "Home", purpose: "Entry to this proposed app", actions: [{ id: "open_first", label: row.prompt, kind: "navigate", target: "first", sourceLink: null }] },
    ] };
    run.revisions.push({ number: 0, label: "Identical prompt-based first-screen plan", map: base, changes: ["This is a planned screen responsibility, not rendered UI. No fake data or baseline custom-component labels enter IA decisions."], structural: validateMap(base, seed) });
    const result = await (variant !== "baseline" ? neutralApp : contentApp)(trace, base);
    run.status = result.findings.length ? "needs_review" : "resolved"; run.phase = "Finished"; run.wallMs = performance.now() - start;
    run.summary = { revisions: run.revisions.length, destinations: result.map.nodes.length, actions: result.map.nodes.reduce((s, n) => s + n.actions.length, 0), unresolved: result.findings.length, replayPassed: 0, replayTotal: 0, stopReason: result.stopReason };
    await trace.event("Finish sample", "stop", { ...run.summary, proposal: run.proposalSummary });
    row[variant] = { status: run.status, runId: run.id, seedPlan: plan, seed, resolved: !result.findings.length, reviewed: run.proposalSummary?.reviewed, destinations: result.map.nodes.length, calls: run.calls, wallMs: run.wallMs, findings: run.proposalSummary?.remainingReviewFindings, excluded: run.proposalSummary?.excludedTasks,
      journeys: run.revisions.at(-1)?.proposal?.journeys.map((j) => ({ id: j.id, task: j.task, verdict: j.verdict })), nodes: result.map.nodes.map((n) => ({ id: n.id, label: n.label })) };
    console.log(`[${index + 1}/${PROMPTS.length}] ${row.prompt}: ${row[variant].resolved ? "closed" : "OPEN"}, review ${row[variant].reviewed ? "passed" : "findings"}, ${result.map.nodes.length} destinations, ${Math.round(run.wallMs)} ms`);
  } catch (error) {
    run.status = "failed"; run.phase = "Failed"; run.error = String(error); await trace.event("Sample failure", "error", { error: String(error) });
    row[variant] = { status: "failed", runId: run.id, error: String(error) }; console.log(`[${index + 1}] FAILED ${row.prompt}: ${error}`);
  }
  await save();
}
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while (cursor < PROMPTS.length) await sample(cursor++); }));
const rows = suite.rows.map((r: any) => r[variant]);
suite.variants[variant] = { ...suite.variants[variant], status: "complete", finished: new Date().toISOString(), total: rows.length, resolved: rows.filter((r: any) => r.resolved).length, reviewed: rows.filter((r: any) => r.reviewed).length, failed: rows.filter((r: any) => r.status === "failed").length, calls: rows.reduce((s: number, r: any) => s + (r.calls?.decisions ?? 0), 0), ms: rows.reduce((s: number, r: any) => s + (r.calls?.ms ?? 0), 0) };
await save(); console.log(JSON.stringify(suite.variants[variant], null, 2));
