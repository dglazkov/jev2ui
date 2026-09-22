// Probe: can Jev tell when a screen needs something the kit cannot draw?
//
// The long tail of components (a map, a timer face, a seating plan) is baked at
// run time, not built into the kit, so the only thing the grammar has to know
// is THAT a screen needs one, and the contract it is baked to. Prompts are
// labelled by hand, before running. One Jev request per prompt; no Gemini.
//
//   npm run probe:custom            summary
//   npm run probe:custom -- -v      plus the contract Jev sets for each

import { askJev, JEV_MODEL } from "../server/models.js";
import { IDIOMS } from "../server/idioms.js";
import { questionsOf } from "../server/grammar/read.js";

/** true: the kit cannot draw it. false: it can. null: either reading is fine. */
export const PROMPTS: Array<[string, boolean | null, string?]> = [
  ["Pomodoro timer", true, "watch"],
  ["Pick your seats for a concert at the Royal Albert Hall", true, "pick"],
  ["Find coffee shops near me on a map", true, "pick"],
  ["Piano practice app: play notes on a keyboard", true, "adjust"],
  ["Chess puzzle of the day", true, "adjust"],
  ["Floor plan of my apartment showing which smart lights are on", true, "pick"],
  ["Guitar tuner", true, "watch"],
  ["Live delivery tracking: where is my courier right now", true, "watch"],
  ["Colour picker for a paint app", true, "adjust"],
  ["Stock price chart for AAPL over the last year", true, "read"],
  ["Sleep stages from last night", true, "read"],
  ["Thermostat control for the living room", true, "adjust"],
  ["Choose a table at the restaurant", true, "pick"],
  ["Month calendar of my cycle for a period tracker", true, "pick"],
  ["Compass", true, "watch"],
  ["Find a dog walker: nearby walkers with ratings", null],
  ["Home energy dashboard showing today's usage", null],
  ["Settings screen for a podcast app", false],
  ["Checkout for a sneaker store, with order summary", false],
  ["Sign-up form for a weekend pottery workshop", false],
  ["Recipe page for sourdough bread", false],
  ["Confirm deleting my account", false],
  ["Kubernetes cluster health for on-call engineers", false],
  ["Bedtime story picker for a kids' reading app", false],
  ["Send $50 to Alex", false],
  ["Inbox for a team chat app", false],
  ["Tell me about the Golden Gate Bridge", false],
  ["Pick a movie for family night", false],
  ["Order history for a grocery delivery app", false],
  ["Profile page for a freelance illustrator", false],
];

async function main() {
const verbose = process.argv.includes("-v");
console.log(`Jev: ${JEV_MODEL}\n`);
const all = questionsOf(IDIOMS.kit.graph.grammar);
const questions = Object.fromEntries(Object.entries(all).filter(([id]) => id === "archetype" || id.startsWith("custom") || id === "has_custom"));

let right = 0;
let judged = 0;
for (const [screen, label, use] of PROMPTS) {
  const { answers } = await askJev({ screen }, questions);
  const p: number = answers.has_custom.noul;
  const said = p >= 0.5;
  const ok = label === null ? " " : said === label ? "✓" : "✗";
  if (label !== null) {
    judged++;
    if (said === label) right++;
  }
  const contract = `${answers.custom_use.choice}${use && said ? (use === answers.custom_use.choice ? "" : ` (expected ${use})`) : ""} · ${answers.custom_size.choice} · linked ${answers.custom_linked.noul.toFixed(2)}`;
  console.log(`${ok} ${p.toFixed(2)}  ${screen.padEnd(62)} ${said || verbose ? contract : ""}${verbose ? `  [${answers.archetype.choice}]` : ""}`);
}
console.log(`\n${right}/${judged} agree with the labels`);

}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL((await import("node:path")).resolve(process.argv[1])).href) await main();
