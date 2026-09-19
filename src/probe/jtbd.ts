// Probe: can Jev see the job a person is hiring a screen to do?
//
// Every question is about the person and their situation, never about the
// screen. Prompts come in minimal pairs: same topic, different job. If Jev's
// job profiles separate the pairs (and match hand labels), a job -> UI mapping
// has something solid to stand on. One Jev request per prompt; no Gemini, no UI.
//
//   npm run probe:jtbd            summary tables
//   npm run probe:jtbd -- -v      plus the full profile of every prompt

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { askJev, JEV_MODEL } from "../server/models.js";

const CONTEXT = "A person sent user_request to an assistant. Judge the person's situation, not the wording.";
const ask = (question: string) => ({ context: CONTEXT, question });

// Options are first-person job statements: matching a request to one is a single semantic hop.
const CHOICES = {
  stage: {
    q: "Where is the person in getting what they want?",
    options: {
      // A reworded pair ("I don't know what the options are yet" / "a small number of options to weigh") was
      // tried and was worse: "My car won't start, what do I do?" became exploring.
      exploring: "I don't have a particular thing in mind yet. Show me what is out there.",
      comparing: "I have a few candidates in mind and want to weigh them against each other.",
      deciding: "I am about to say yes or no to one specific thing, and want to be sure first.",
      committing: "I have decided. Let me give the details or the go-ahead and make it happen.",
      doing: "I am in the middle of a hands-on task and need guidance while I do it.",
      checking: "Something already happened or is under way. I want to see how it stands.",
    },
  },
  done: {
    q: "What is true for the person when this goes well?",
    options: {
      know: "I understand something I did not understand before.",
      picked: "I have settled on one option out of several.",
      handed_over: "I have given my details or my go-ahead, and the thing is now in motion.",
      finished_task: "I have completed a hands-on task out in the real world.",
      reassured: "I have stopped worrying about something.",
      configured: "Something now behaves the way I want it to.",
    },
  },
  // v1 asked "who holds the information that matters", which Jev read literally: my spending is *my* information.
  flow: {
    q: "Once the assistant responds, what will the person mostly be doing?",
    options: {
      system_to_person: "Reading or looking at what the assistant shows me.",
      person_to_system: "Typing, picking or toggling things myself.",
      both: "Reading first, then entering or confirming something.",
    },
  },
  // v1 asked "how many things is the person dealing with": someone shopping for a laptop wants *one* laptop.
  cardinality: {
    q: "How many separate items would the assistant need to show the person?",
    options: {
      one: "A single item: one record, one answer, one thing.",
      few: "Two to five comparable options, side by side.",
      many: "A longer list to browse or narrow down.",
      none: "No items: an explanation, a procedure or a control.",
    },
  },
} as const;

const SCORES = {
  stakes: {
    q: "How hard would it be for the person to undo what happens next?",
    levels: [
      "Nothing to undo. They are only looking.",
      "Easily undone or changed later.",
      "Costly to undo: money, time or a commitment to others is involved.",
      "Cannot be undone.",
    ],
  },
  attention: {
    q: "How much attention does the person want to spend on the answer?",
    levels: [
      "A glance: one or two numbers or words.",
      "A scan: skim a short list or a few facts.",
      "A read: a few paragraphs.",
      "A study: careful, extended attention.",
    ],
  },
  urgency: {
    q: "How soon does the person need this resolved?",
    levels: ["No time pressure.", "Within a day or so.", "Right now."],
  },
} as const;

const NOULS = {
  habitual: "Is this something the person has probably done many times before?",
  anx_cost: "Is the person likely worried about how much this will cost?",
  anx_commitment: "Is the person likely worried about being locked into something?",
  anx_loss: "Is the person likely worried about losing something they cannot get back?",
  anx_mistake: "Is the person likely worried about doing it wrong?",
  anx_safety: "Is the person likely worried about their safety, health or security?",
  by_price: "If the person is choosing among options, will price matter to the choice?",
  by_quality: "If the person is choosing among options, will ratings or quality matter to the choice?",
  by_location: "If the person is choosing among options, will distance or location matter to the choice?",
  by_time: "If the person is choosing among options, will date, time or availability matter to the choice?",
  by_looks: "If the person is choosing among options, will appearance matter to the choice?",
} as const;

type ChoiceKey = keyof typeof CHOICES;
type Labels = { [K in ChoiceKey]: keyof (typeof CHOICES)[K]["options"] } & { highStakes: boolean };

function questions(): Questions {
  const out: Questions = {};
  for (const [key, { q, options }] of Object.entries(CHOICES)) out[key] = choice(ask(q), options);
  for (const [key, { q, levels }] of Object.entries(SCORES)) out[key] = score(ask(q), levels as unknown as [string, string, ...string[]]);
  for (const [key, q] of Object.entries(NOULS)) out[key] = noul(ask(q));
  return out;
}

// Minimal pairs: same topic, different job. Labels are one person's judgement, written before running.
const L = (stage: Labels["stage"], done: Labels["done"], flow: Labels["flow"], cardinality: Labels["cardinality"], highStakes = false): Labels =>
  ({ stage, done, flow, cardinality, highStakes });

const PAIRS: Array<{ topic: string; a: [string, Labels]; b: [string, Labels] }> = [
  { topic: "restaurants",
    a: ["Find me three Italian restaurants near downtown Seattle for tonight", L("comparing", "picked", "system_to_person", "few")],
    b: ["What's good to eat in Seattle?", L("exploring", "know", "system_to_person", "many")] },
  { topic: "electricity",
    a: ["Am I going to be surprised by my electricity bill this month?", L("checking", "reassured", "system_to_person", "one")],
    b: ["Why has my electricity usage been so high lately?", L("checking", "know", "system_to_person", "none")] },
  { topic: "flights",
    a: ["Book the 7am flight to Denver tomorrow for me", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["Where could I fly for a long weekend in October?", L("exploring", "know", "system_to_person", "many")] },
  { topic: "account deletion",
    a: ["Delete my account and all of its data", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["What happens to my data if I delete my account?", L("deciding", "know", "system_to_person", "one")] },
  { topic: "laptops",
    a: ["Compare the MacBook Air and the Dell XPS 13", L("comparing", "picked", "system_to_person", "few")],
    b: ["I need a new laptop, what's out there?", L("exploring", "know", "system_to_person", "many")] },
  { topic: "sourdough",
    a: ["How do I make sourdough starter from scratch?", L("doing", "finished_task", "system_to_person", "none")],
    b: ["My sourdough starter smells like acetone, is it dead?", L("checking", "reassured", "system_to_person", "one")] },
  { topic: "notifications",
    a: ["Turn off all notifications except direct messages", L("committing", "configured", "person_to_system", "none")],
    b: ["Show me my notification settings", L("checking", "configured", "both", "none")] },
  { topic: "pottery",
    a: ["Sign me up for the Saturday pottery workshop", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["Are there any pottery workshops around here?", L("exploring", "know", "system_to_person", "many")] },
  { topic: "orders",
    a: ["Where is my package?", L("checking", "reassured", "system_to_person", "one")],
    b: ["I need to return the shoes I ordered", L("committing", "handed_over", "both", "one")] },
  { topic: "dermatology",
    a: ["Book a dermatologist appointment for next week", L("committing", "handed_over", "both", "few", true)],
    b: ["Should I see a doctor about this mole?", L("deciding", "reassured", "both", "one")] },
  { topic: "money",
    a: ["Send $50 to Alex", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["How much did I spend on eating out last month?", L("checking", "know", "system_to_person", "none")] },
  { topic: "movies",
    a: ["Pick a movie for family night", L("comparing", "picked", "system_to_person", "few")],
    b: ["Is The Incredibles okay for a five-year-old?", L("deciding", "reassured", "system_to_person", "one")] },
  { topic: "travel",
    a: ["Cancel my hotel reservation in Lisbon", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["Show me my upcoming trips", L("checking", "know", "system_to_person", "few")] },
  { topic: "golden gate",
    a: ["Tell me about the Golden Gate Bridge", L("exploring", "know", "system_to_person", "one")],
    b: ["How do I get to the Golden Gate Bridge from Union Square right now?", L("doing", "finished_task", "system_to_person", "none")] },
  { topic: "security",
    a: ["Reset my password", L("committing", "configured", "person_to_system", "one")],
    b: ["I got a weird login email. Was my account hacked?", L("checking", "reassured", "system_to_person", "one")] },
  { topic: "subscription",
    a: ["Upgrade me to the annual plan", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["Which plan is right for a team of five?", L("comparing", "picked", "both", "few")] },
  { topic: "running",
    a: ["Log today's run: 5k in 27 minutes", L("committing", "handed_over", "person_to_system", "one")],
    b: ["How is my running going this month?", L("checking", "know", "system_to_person", "none")] },
  { topic: "calendar",
    a: ["Schedule a 30 minute call with Priya next week", L("committing", "handed_over", "both", "few")],
    b: ["What's on my calendar tomorrow?", L("checking", "know", "system_to_person", "few")] },
  { topic: "insurance",
    a: ["File a claim for my cracked phone screen", L("committing", "handed_over", "person_to_system", "one", true)],
    b: ["Is a cracked screen covered by my plan?", L("deciding", "know", "system_to_person", "one")] },
  { topic: "car",
    a: ["My car won't start, what do I do?", L("doing", "finished_task", "both", "one")],
    b: ["When is my car due for service?", L("checking", "know", "system_to_person", "one")] },
];

type Profile = Record<string, any>;

/** How differently two profiles answer one question, 0..1. */
function separation(key: string, a: Profile, b: Profile): number {
  if (key in CHOICES) {
    // Total variation distance between the two probability distributions.
    const options = Object.keys(a[key].probabilities);
    return options.reduce((sum, o) => sum + Math.abs(a[key].probabilities[o] - b[key].probabilities[o]), 0) / 2;
  }
  if (key in SCORES) {
    const top = SCORES[key as keyof typeof SCORES].levels.length - 1;
    return Math.abs(a[key].score - b[key].score) / top;
  }
  return Math.abs(a[key].noul - b[key].noul);
}

function brief(p: Profile): string {
  const c = (k: ChoiceKey) => `${p[k].choice}(${p[k].probabilities[p[k].choice].toFixed(2)})`;
  const yes = Object.keys(NOULS).filter((k) => p[k].noul >= 0.6).join(",");
  return `${c("stage")} → ${c("done")} | ${c("flow")} | ${c("cardinality")} | stakes ${p.stakes.score.toFixed(1)} attention ${p.attention.score.toFixed(1)} urgency ${p.urgency.score.toFixed(1)} | ${yes || "-"}`;
}

async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return out;
}

const verbose = process.argv.includes("-v");
const prompts = PAIRS.flatMap((pair) => [pair.a, pair.b]);
const qs = questions();
let tokens = 0;
const latencies: number[] = [];
const profiles = await inBatches(prompts, 5, async ([prompt]) => {
  const result = await askJev({ user_request: prompt }, qs);
  tokens += result.inputTokens;
  latencies.push(result.ms);
  return result.answers as Profile;
});

console.log(`Jev: ${JEV_MODEL} · ${prompts.length} prompts · ${Object.keys(qs).length} questions each · ${tokens} input tokens · median ${Math.round(latencies.sort((x, y) => x - y)[latencies.length >> 1])} ms\n`);

// 1. Do the profiles pull minimal pairs apart, and on which questions?
console.log("== Pairs: same topic, different job ==");
const keys = Object.keys(qs);
const separatedBy: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
let unseparated = 0;
PAIRS.forEach((pair, i) => {
  const [a, b] = [profiles[2 * i], profiles[2 * i + 1]];
  const strong = keys.map((k) => [k, separation(k, a, b)] as const).filter(([, d]) => d >= 0.5).sort((x, y) => y[1] - x[1]);
  strong.forEach(([k]) => separatedBy[k]++);
  if (strong.length === 0) unseparated++;
  console.log(`\n${pair.topic}`);
  console.log(`  A ${pair.a[0]}\n      ${brief(a)}`);
  console.log(`  B ${pair.b[0]}\n      ${brief(b)}`);
  console.log(`  differs on: ${strong.map(([k, d]) => `${k} ${d.toFixed(2)}`).join(", ") || "NOTHING ≥ 0.5"}`);
});

console.log(`\n== Which questions do the separating? (pairs out of ${PAIRS.length} with separation ≥ 0.5) ==`);
console.table(Object.fromEntries(Object.entries(separatedBy).sort((x, y) => y[1] - x[1])));
console.log(`Pairs not separated by any question: ${unseparated}`);

// 2. Does Jev see what a person sees? Agreement with the hand labels, and how confidence tracks it.
console.log("\n== Agreement with hand labels ==");
const agreement: Record<string, string> = {};
const misses: string[] = [];
// flow and cardinality were reworded after the labels were written, so only stage and done are scored.
for (const key of ["stage", "done"] as ChoiceKey[]) {
  let right = 0;
  let confRight = 0;
  let confWrong = 0;
  prompts.forEach(([prompt, labels], i) => {
    const answer = profiles[i][key];
    if (answer.choice === labels[key]) {
      right++;
      confRight += answer.confidence;
    } else {
      confWrong += answer.confidence;
      misses.push(`${key.padEnd(11)} expected ${String(labels[key]).padEnd(16)} got ${`${answer.choice}(${answer.probabilities[answer.choice].toFixed(2)})`.padEnd(24)} ${prompt}`);
    }
  });
  const wrong = prompts.length - right;
  agreement[key] = `${right}/${prompts.length}  mean confidence when agreeing ${(confRight / Math.max(right, 1)).toFixed(2)}, when not ${(confWrong / Math.max(wrong, 1)).toFixed(2)}`;
}
const stakesRight = prompts.filter(([, labels], i) => profiles[i].stakes.score >= 1.5 === labels.highStakes).length;
agreement.highStakes = `${stakesRight}/${prompts.length}  (stakes score ≥ 1.5)`;
console.table(agreement);
console.log("Disagreements:");
misses.forEach((m) => console.log(`  ${m}`));

if (verbose) {
  console.log("\n== Full profiles ==");
  prompts.forEach(([prompt], i) => {
    console.log(`\n${prompt}`);
    for (const k of keys) {
      const ans = profiles[i][k];
      const shown = ans.type === "noul" ? ans.noul.toFixed(2) : ans.type === "score" ? `${ans.score.toFixed(2)} (conf ${ans.confidence.toFixed(2)})` : JSON.stringify(ans.probabilities);
      console.log(`  ${k.padEnd(15)} ${shown}`);
    }
  });
}
