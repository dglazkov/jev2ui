// Runs prompts through all pipelines and prints a comparison table.
//   npm run eval                      all built-in prompts, all modes
//   npm run eval -- "a prompt" -v     one prompt, with decisions and messages

import { runJobs } from "./server/jobs.js";
import { runHybrid } from "./server/hybrid.js";
import { runBaseline } from "./server/baseline.js";
import { GEMINI_MODEL, JEV_MODEL, geminiRequestTimes } from "./server/models.js";
import type { PipelineEvent, RunStats } from "./shared/events.js";

const PROMPTS = [
  "Delete my account and all of its data",
  "What happens to my data if I delete my account?",
  "Am I going to be surprised by my electricity bill this month?",
  "Send $50 to Alex",
  "My car won't start, what do I do?",
  "Sign-up form for a weekend pottery workshop",
  "Find me three Italian restaurants near downtown Seattle for tonight",
  "How do I make sourdough starter from scratch?",
  "Tell me about the Golden Gate Bridge",
  "Settings for notification preferences in a chat app",
  "Pick a movie for family night",
];

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const custom = args.filter((a) => !a.startsWith("-"));
const prompts = custom.length ? custom : PROMPTS;

// A hybrid run makes one Gemini request per section. Set GEMINI_RPM (free tier: 15) to pace under a quota.
const RPM = Number(process.env.GEMINI_RPM ?? Infinity);
const WORST_CASE_REQUESTS = 8;

/** Waits until a run's worst case fits in the quota window, so throttling never pollutes the timings. */
async function pace() {
  while (true) {
    const recent = geminiRequestTimes.filter((t) => Date.now() - t < 61_000);
    if (recent.length + WORST_CASE_REQUESTS <= RPM) return;
    await new Promise((resolve) => setTimeout(resolve, 61_000 - (Date.now() - recent[0])));
  }
}

async function consume(events: AsyncGenerator<PipelineEvent>): Promise<{ stats?: RunStats; problems: string[] }> {
  let stats: RunStats | undefined;
  const problems: string[] = [];
  for await (const event of events) {
    if (event.type === "done") stats = event.stats;
    if (event.type === "invalid") problems.push(...event.errors);
    if (event.type === "error") problems.push(`ERROR: ${event.message}`);
    if (!verbose) continue;
    if (event.type === "trace") {
      console.log(`  [${event.at}ms] ${event.stage} (${event.ms}ms${event.detail ? `, ${event.detail}` : ""})`);
      for (const d of event.decisions ?? []) {
        console.log(`      ${d.question.padEnd(34)} ${d.answer.padEnd(14)} p=${d.p.toFixed(2)}${d.note ? `  (${d.note})` : ""}`);
      }
    }
    if (event.type === "a2ui") console.log(`  [${event.at}ms] ${JSON.stringify(event.message).slice(0, 400)}`);
  }
  return { stats, problems };
}

console.log(`Gemini: ${GEMINI_MODEL}   Jev: ${JEV_MODEL}\n`);
const rows: Array<Record<string, unknown>> = [];
for (const prompt of prompts) {
  for (const [mode, run] of [["jobs", runJobs], ["hybrid", runHybrid], ["baseline", runBaseline]] as const) {
    await pace();
    if (verbose) console.log(`\n=== ${mode}: ${prompt}`);
    const { stats, problems } = await consume(run(prompt));
    rows.push({
      prompt: prompt.length > 38 ? `${prompt.slice(0, 37)}…` : prompt,
      mode,
      "first UI ms": stats?.firstComponentsMs ?? "-",
      "first text ms": stats?.firstContentMs ?? "-",
      "total ms": stats?.totalMs ?? "-",
      valid: stats?.valid ? "yes" : "NO",
      "gemini out tok": stats?.geminiOutputTokens ?? "-",
      "jev in tok": stats?.jevInputTokens ?? "-",
    });
    for (const p of problems.slice(0, 5)) console.log(`  ! ${mode} | ${prompt} | ${p}`);
  }
}
console.table(rows);
