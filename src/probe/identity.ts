// Read-only Jev benchmark. Deliberately never imports a generation pipeline.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { identityCases } from "./identity-cases.js";
import { resolveIdentity, type IdentityResult, type IdentityStrategy } from "../server/ia/identity.js";
import { askJev, endpoints, JEV_MODEL } from "../server/models.js";

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
export function scoreIdentity(expected: IdentityResult, actual: IdentityResult) {
  const correct = JSON.stringify(expected) === JSON.stringify(actual);
  return { correct, incorrectReuse: actual.kind === "existing" && !correct, duplicate: actual.kind === "new" && expected.kind === "existing", unresolved: actual.kind === "uncertain", prematureNew: actual.kind === "new" && expected.kind === "uncertain" };
}
const quantile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? 0;

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => !/^--repeats=[1-5]$/.test(a))) throw new Error("Usage: npm run probe:identity -- [--repeats=1..5]");
  const repeats = Number(args.find((a) => a.startsWith("--repeats="))?.slice(10) ?? 2);
  if (!endpoints().includes("jev")) throw new Error("Jev is not configured; no endpoint fallback is used.");
  const cases = await identityCases();
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = resolve(".cache/identity", id);
  await mkdir(directory, { recursive: true });
  const sources = {} as Record<string, { sha256: string; text: string }>;
  for (const name of ["src/server/ia/identity.ts", "src/probe/identity-cases.ts", "src/probe/identity.ts", "src/server/mock/link.ts"]) {
    const text = await readFile(name, "utf8"); sources[name] = { sha256: fingerprint(text), text };
  }
  const run: any = { id, endpoint: "jev", model: JEV_MODEL, started: new Date().toISOString(), repeats, concurrency: 3, sources, cases, trials: [], limitations: ["Small development set with authored expected identities, not a held-out benchmark.", "Recorded cases use captured controls; authored contrasts are reported separately.", "Catalogs are supplied per case; this does not yet test automatic catalog growth or browser behavior.", "Latency is per HTTP request with three concurrent workers, not a production click-latency promise.", "No probability thresholds, retries, tie-breaking model calls, or automatic prompt tuning.", "No Gemini calls or app changes."] };
  await writeFile(`${directory}/run.json`, JSON.stringify(run, null, 2));
  const jobs = cases.flatMap((test) => Array.from({ length: repeats }, (_, repeat) => ["forward", "reverse"].flatMap((order) => (["select", "pairs"] as IdentityStrategy[]).map((strategy) => ({ test, repeat, order, strategy }))))).flat();
  let cursor = 0;
  let writes = Promise.resolve();
  const save = () => { const json = JSON.stringify(run, null, 2); writes = writes.then(() => writeFile(`${directory}/run.json`, json)); return writes; };
  console.log(`Identity probe: ${cases.length} cases × ${repeats} repeats × 2 orders × 2 methods = ${jobs.length} requests\n${directory}/run.json`);
  const started = performance.now();
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < jobs.length) {
      const { test, repeat, order, strategy } = jobs[cursor++];
      const input = { ...test.input, catalog: order === "reverse" ? [...test.input.catalog].reverse() : test.input.catalog };
      const trial: any = { case: test.id, provenance: test.provenance, repeat, order, strategy, expected: test.expected };
      try {
        Object.assign(trial, await resolveIdentity(input, strategy, (state, questions) => askJev(state, questions, "jev")));
        trial.score = scoreIdentity(test.expected, trial.result);
      } catch (error) { trial.error = (error as Error).message; }
      run.trials.push(trial);
      const completed = run.trials.length;
      await save();
      if (completed % 20 === 0 || trial.error) console.log(`${completed}/${jobs.length}${trial.error ? ` ERROR ${trial.error}` : ""}`);
    }
  }));
  run.elapsedMs = Math.round(performance.now() - started);
  run.finished = new Date().toISOString();
  const summaries = (["select", "pairs"] as const).map((strategy) => {
    const trials = run.trials.filter((t: any) => t.strategy === strategy), valid = trials.filter((t: any) => !t.error);
    const sum = (key: string) => valid.filter((t: any) => t.score[key]).length;
    let orderFlips = 0, orderComparisons = 0, repeatFlips = 0, repeatComparisons = 0;
    for (const test of cases) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        const pair = valid.filter((t: any) => t.case === test.id && t.repeat === repeat);
        if (pair.length === 2 && test.input.catalog.length > 1) { orderComparisons++; if (JSON.stringify(pair[0].result) !== JSON.stringify(pair[1].result)) orderFlips++; }
      }
      for (const order of ["forward", "reverse"]) {
        const group = valid.filter((t: any) => t.case === test.id && t.order === order);
        if (group.length === repeats && repeats > 1) { repeatComparisons++; if (new Set(group.map((t: any) => JSON.stringify(t.result))).size > 1) repeatFlips++; }
      }
    }
    return { strategy, trials: trials.length, errors: trials.length - valid.length, correct: sum("correct"), incorrectReuse: sum("incorrectReuse"), duplicates: sum("duplicate"), unresolved: sum("unresolved"), prematureNew: sum("prematureNew"), medianMs: Math.round(quantile(valid.map((t: any) => t.ms), .5)), p95Ms: Math.round(quantile(valid.map((t: any) => t.ms), .95)), inputTokens: valid.reduce((n: number, t: any) => n + t.inputTokens, 0), orderFlips, orderComparisons, repeatFlips, repeatComparisons, recorded: { correct: valid.filter((t: any) => t.provenance.startsWith("recorded") && t.score.correct).length, total: valid.filter((t: any) => t.provenance.startsWith("recorded")).length }, authored: { correct: valid.filter((t: any) => !t.provenance.startsWith("recorded") && t.score.correct).length, total: valid.filter((t: any) => !t.provenance.startsWith("recorded")).length } };
  });
  run.summary = summaries;
  await save();
  const failures = run.trials.filter((t: any) => t.error || !t.score.correct).map((t: any) => ({ case: t.case, strategy: t.strategy, order: t.order, repeat: t.repeat, expected: t.expected, actual: t.result, error: t.error }));
  await writeFile(`${directory}/summary.json`, JSON.stringify({ id, summary: summaries, failures, limitations: run.limitations }, null, 2));
  console.log(JSON.stringify({ directory, summary: summaries, failures }, null, 2));
  if (run.trials.some((t: any) => t.error)) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
