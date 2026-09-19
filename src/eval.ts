// Runs prompts through both pipelines and prints a comparison table.
//   npm run eval                      all built-in prompts, both modes
//   npm run eval -- "a prompt" -v     one prompt, with decisions and messages

import { runHybrid } from "./server/hybrid.js";
import { runBaseline } from "./server/baseline.js";
import { GEMINI_MODEL, JEV_MODEL } from "./server/models.js";
import type { PipelineEvent, RunStats } from "./shared/events.js";

const PROMPTS = [
  "Sign-up form for a weekend pottery workshop",
  "Find me three Italian restaurants near downtown Seattle for tonight",
  "How do I make sourdough starter from scratch?",
  "Confirm deleting my account and all of its data",
  "Show a summary of my electricity usage this month",
  "Tell me about the Golden Gate Bridge",
  "Settings for notification preferences in a chat app",
  "Pick a movie for family night",
];

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const custom = args.filter((a) => !a.startsWith("-"));
const prompts = custom.length ? custom : PROMPTS;

async function consume(events: AsyncGenerator<PipelineEvent>): Promise<{ stats?: RunStats; problems: string[] }> {
  let stats: RunStats | undefined;
  const problems: string[] = [];
  for await (const event of events) {
    if (event.type === "done") stats = event.stats;
    if (event.type === "invalid") problems.push(...event.errors);
    if (event.type === "error") problems.push(`ERROR: ${event.message}`);
    if (!verbose) continue;
    if (event.type === "trace") {
      console.log(`  [${event.at}ms] ${event.stage} (${event.ms}ms)`);
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
  for (const [mode, run] of [["hybrid", runHybrid], ["baseline", runBaseline]] as const) {
    if (verbose) console.log(`\n=== ${mode}: ${prompt}`);
    const { stats, problems } = await consume(run(prompt));
    rows.push({
      prompt: prompt.length > 38 ? `${prompt.slice(0, 37)}…` : prompt,
      mode,
      "first UI ms": stats?.firstComponentsMs ?? "-",
      "total ms": stats?.totalMs ?? "-",
      valid: stats?.valid ? "yes" : "NO",
      "gemini out tok": stats?.geminiOutputTokens ?? "-",
      "jev in tok": stats?.jevInputTokens ?? "-",
    });
    for (const p of problems.slice(0, 5)) console.log(`  ! ${mode} | ${prompt} | ${p}`);
  }
}
console.table(rows);
