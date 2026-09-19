// Probe: can Jev read a change? (docs/chat-and-turns.md)
//
// A chat where every message after the first is an edit needs a message turned into decisions. Asking everything
// again with the message added would let every answer that sat near even odds flip. So the questions here are
// about the change and not the state: for each dial, a Score from "much less" to "much more" with "as it is" in
// the middle; for each choice, a Noul, "does the message ask to change this?"; and first, what kind of turn it is.
//
// What has to hold for that to be worth building on:
//   the kind of turn is read correctly
//   a dial the message names moves the right way, and one it does not name stays where it is
//   "a little", plain and "much" come out in that order
//   a gate opens for its own subject and for nothing else
//
// Labels are one person's judgement, written before the first run. One Jev request per message and app; no Gemini.
//
//   npm run probe:change            summary
//   npm run probe:change -- -v      plus every message's answers

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { askJev, JEV_MODEL, ranked } from "../server/models.js";

const CONTEXT =
  "A developer is making an app with a design tool. `app` describes the app, `design` says how it looks now, and `showing` is the screen in front of them. They have typed `message` to the tool to have something changed.";
const ask = (question: string) => ({ context: CONTEXT, question });

const TURNS = {
  new_app: "The message describes a different app or product from the one in `app`, and asks for that in its place.",
  new_screen: "The message asks for another screen or page of the same app, one that is not the screen showing.",
  look: "How the app looks: colours, light or dark, typefaces, corners, how dense or spacious it is, shadows, how pictures are treated, its mood or style. Nothing about what is on the screen.",
  structure: "What the screen showing is made of: a section, control, picture or component added, removed or swapped, or its items laid out another way.",
  words: "The text or the data on the screen: a name, the wording, how long it is, its tone, its language, units or currency, which example items appear.",
  arrange: "Where something sits: moving one thing to another place on the screen, or changing the order things come in.",
  question: "The message asks a question about the design and does not ask for anything to change.",
};
type Turn = keyof typeof TURNS;

/** Seven levels and not five: with two steps a side, "a little" and the plain word land on the same one. */
const steps = (less: [string, string, string], same: string, more: [string, string, string]) => [...less, same, ...more];

const DIALS = {
  vivid: {
    q: "What does the message ask for, as to how saturated the accent colour is? This is not about photographs, and not about how light or dark anything is.",
    levels: steps(
      ["Much more muted: far greyer and quieter.", "Clearly more muted.", "A touch more muted."],
      "As saturated as it is: the message does not ask for a more or a less saturated accent.",
      ["A touch more vivid.", "Clearly more vivid.", "Much more vivid: as bright and saturated as it can be."],
    ),
  },
  light: {
    q: "What does the message ask for, as to how light or deep the accent colour is?",
    levels: steps(
      ["Much deeper and darker.", "Clearly deeper.", "A touch deeper."],
      "As light as it is: the message does not ask for a lighter or a deeper accent colour.",
      ["A touch lighter.", "Clearly lighter.", "Much lighter: toward a pale pastel."],
    ),
  },
  warmth: {
    q: "What does the message ask for, as to whether backgrounds and greys lean cold or warm?",
    levels: steps(
      ["Much colder: toward steel and blue-grey.", "Clearly cooler.", "A touch cooler."],
      "As they are: the message does not ask for warmer or cooler backgrounds.",
      ["A touch warmer.", "Clearly warmer.", "Much warmer: toward cream, sand and paper."],
    ),
  },
  round: {
    q: "What does the message ask for, as to how rounded corners are?",
    levels: steps(
      ["Much sharper: toward square.", "Clearly sharper.", "A touch sharper."],
      "As rounded as they are: the message does not ask for rounder or sharper corners.",
      ["A touch rounder.", "Clearly rounder.", "Much rounder: toward pills and circles."],
    ),
  },
  air: {
    q: "What does the message ask for, as to how much whitespace the screens have?",
    levels: steps(
      ["Much denser: far more packed onto each screen.", "Clearly more compact.", "A touch more compact."],
      "As roomy as they are: the message does not ask for more or less space.",
      ["A touch roomier.", "Clearly roomier.", "Much airier: far more space around everything."],
    ),
  },
};
/** A dial's answer as a step from −2 (much less) to +2 (much more), whatever the number of levels. */
const step = (score: number) => ((score - 3) * 2) / 3;
type Dial = keyof typeof DIALS;

const GATES = {
  hue: ["Does the message ask for a different accent colour, or object to the one there is?", "It names a colour, or says the present colour is wrong.", "It says nothing about which colour the accent is. Lighter, darker, brighter or duller are not a different colour."],
  dark: ["Does the message ask to switch between a dark interface and a light one?", "It asks for dark mode, night mode, a dark or black background; or for a light or white background.", "It does not ask for the background to go from light to dark or from dark to light."],
  type: ["Does the message ask for different typefaces?", "It names a kind of font, says the lettering feels wrong, or asks for a change of mood or personality (more playful, more serious, more elegant, fancier), which lettering carries.", "It says nothing about fonts or lettering, and asks for no change of mood."],
  elevation: ["Does the message ask to change how cards are set off from the page: shadows, borders or flat?", "It mentions shadows, borders, outlines, flatness or depth.", "It says nothing about shadows, borders or depth."],
  pictures: ["Does the message ask to change whether there are pictures, or how they are treated?", "It asks for pictures or for none, or for them to be black and white, tinted, muted, natural or drawn.", "It says nothing about pictures."],
  cards: ["Does the message ask to change whether content sits in cards?", "It asks for cards, boxes or containers, or for content to flow without them.", "It says nothing about cards or containers."],
} as const;
type Gate = keyof typeof GATES;

function questions(): Questions {
  const out: Questions = { turn: choice(ask("What kind of change does the message ask for?"), TURNS) };
  for (const [key, { q, levels }] of Object.entries(DIALS)) out[key] = score(ask(q), levels as unknown as [string, string, ...string[]]);
  for (const [key, [q, yes, no]] of Object.entries(GATES)) out[key] = noul(ask(q), { true: yes, false: no });
  return out;
}

const APPS = [
  {
    name: "bakery",
    app: "An app for ordering bread and pastries from a neighbourhood bakery for pickup",
    design: "A light interface with an amber accent, warm cream backgrounds, a friendly humanist sans-serif, very rounded corners, roomy spacing, soft shadows under cards, natural photographs.",
    showing: "Today's bakes: a list of breads and pastries with photographs and prices, under a banner about the weekend special.",
  },
  {
    name: "servers",
    app: "A monitoring dashboard for a fleet of servers, for the engineer on call",
    design: "A dark interface with a violet accent, cold steel greys, monospaced headings, barely softened corners, compact spacing, thin borders and no shadows, no pictures.",
    showing: "Fleet overview: four figures at the top (uptime, error rate, latency, open incidents) and a list of servers with their status.",
  },
];

interface Case {
  message: string;
  turn: Turn | Turn[];
  /** The way each named dial should move, and roughly how far: ±1 a little or plainly, ±2 much. Unnamed dials should stay. */
  dials?: Partial<Record<Dial, -2 | -1 | 1 | 2>>;
  gates?: Gate[];
  /** Read and reported, not marked: a person could mean several things. */
  open?: boolean;
}

const CASES: Case[] = [
  // One dial, named outright.
  { message: "Make the accent colour a little lighter", turn: "look", dials: { light: 1 } },
  { message: "Make the accent colour lighter", turn: "look", dials: { light: 1 } },
  { message: "Make the accent colour much, much lighter, almost pastel", turn: "look", dials: { light: 2 } },
  { message: "The accent should be deeper and richer", turn: "look", dials: { light: -1 } },
  { message: "Tone the colours down a bit", turn: "look", dials: { vivid: -1 } },
  { message: "Make the colours really pop", turn: "look", dials: { vivid: 2 } },
  { message: "Slightly rounder buttons please", turn: "look", dials: { round: 1 } },
  { message: "More rounded corners", turn: "look", dials: { round: 1 } },
  { message: "Make everything as round as it can possibly be", turn: "look", dials: { round: 2 } },
  { message: "Sharper corners, it looks like a toy", turn: "look", dials: { round: -1 } },
  { message: "Give it a bit more breathing room", turn: "look", dials: { air: 1 } },
  { message: "It's too spread out, tighten it up", turn: "look", dials: { air: -1 } },
  { message: "Pack way more onto each screen, I want it dense", turn: "look", dials: { air: -2 } },
  { message: "Warmer backgrounds, more like paper", turn: "look", dials: { warmth: 1 } },
  { message: "Make the greys cooler", turn: "look", dials: { warmth: -1 } },
  // One choice, named outright.
  { message: "Switch it to dark mode", turn: "look", gates: ["dark"] },
  { message: "Put it on a white background", turn: "look", gates: ["dark"] },
  { message: "Use a serif font", turn: "look", gates: ["type"] },
  { message: "The font looks childish", turn: "look", gates: ["type"] },
  { message: "Make the accent green", turn: "look", gates: ["hue"] },
  { message: "I don't like that accent colour, try something else", turn: "look", gates: ["hue"] },
  { message: "Drop the shadows and use thin borders", turn: "look", gates: ["elevation"] },
  { message: "No cards, let the content flow like a page", turn: "look", gates: ["cards"] },
  { message: "Make the photos black and white", turn: "look", gates: ["pictures"] },
  // A mood: several things at once.
  { message: "Make it more playful", turn: "look", dials: { round: 1, vivid: 1 }, gates: ["type"] },
  { message: "More serious and corporate", turn: "look", dials: { round: -1, vivid: -1 }, gates: ["type"] },
  { message: "Make it calmer", turn: "look", dials: { vivid: -1 } },
  // What a person could mean several ways.
  { message: "Make it lighter", turn: "look", open: true },
  { message: "Make it more fancy", turn: "look", open: true },
  { message: "Make it pop", turn: "look", open: true },
  { message: "It looks boring", turn: "look", open: true },
  // Not the look at all: every dial should stay and every gate stay shut.
  { message: "Rename the app to Fern", turn: "words" },
  { message: "Make the descriptions shorter", turn: "words" },
  { message: "Show the prices in euros", turn: "words" },
  { message: "Write it all in a friendlier voice", turn: "words" },
  { message: "Add a search bar", turn: "structure" },
  { message: "Remove the banner at the top", turn: "structure" },
  { message: "Show the items in a grid instead", turn: "structure" },
  { message: "Add a chart of the last seven days", turn: "structure" },
  { message: "Add a settings page", turn: "new_screen" },
  { message: "I also need a screen where people sign in", turn: "new_screen" },
  { message: "Now make me a recipe app for students", turn: "new_app" },
  { message: "Actually, I want a podcast player instead", turn: "new_app" },
  { message: "Move the main button to the top left corner", turn: "arrange" },
  { message: "Put the list above everything else", turn: "arrange" },
  { message: "Why is this a list?", turn: "question" },
  { message: "What font is that?", turn: "question" },
];

const verbose = process.argv.includes("-v");
const MOVED = 0.3;

interface Read {
  app: string;
  c: Case;
  turn: Turn;
  turnP: number;
  runnerUp: [string, number];
  deltas: Record<Dial, number>;
  gates: Record<Gate, number>;
  ms: number;
  tokens: number;
}

async function read(app: (typeof APPS)[number], c: Case): Promise<Read> {
  const { name, ...state } = app;
  const { answers, ms, inputTokens } = await askJev({ ...state, message: c.message }, questions());
  const order = ranked(answers.turn);
  return {
    app: name,
    c,
    turn: order[0][0] as Turn,
    turnP: order[0][1],
    runnerUp: order[1],
    deltas: Object.fromEntries(Object.keys(DIALS).map((k) => [k, step(answers[k].score)])) as Record<Dial, number>,
    gates: Object.fromEntries(Object.keys(GATES).map((k) => [k, answers[k].noul])) as Record<Gate, number>,
    ms,
    tokens: inputTokens,
  };
}

const jobs = APPS.flatMap((app) => CASES.map((c) => () => read(app, c)));
const reads: Read[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < jobs.length) {
      const i = next++;
      reads[i] = await jobs[i]();
    }
  }),
);

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const allows = (c: Case, turn: Turn) => (Array.isArray(c.turn) ? c.turn.includes(turn) : c.turn === turn);

console.log(`${JEV_MODEL}: ${reads.length} requests, median ${reads.map((r) => r.ms).sort((a, b) => a - b)[reads.length >> 1].toFixed(0)} ms, ${Math.round(reads.reduce((s, r) => s + r.tokens, 0) / reads.length)} input tokens each\n`);

{
  for (const r of reads) {
    if (!verbose && !r.c.open) continue;
    const moved = (Object.entries(r.deltas) as Array<[Dial, number]>).filter(([, d]) => Math.abs(d) >= MOVED).map(([k, d]) => `${k} ${signed(d)}`);
    const open = (Object.entries(r.gates) as Array<[Gate, number]>).filter(([, p]) => p >= 0.5).map(([k, p]) => `${k} ${p.toFixed(2)}`);
    console.log(`[${r.app}] ${r.c.message}${r.c.open ? "   (open)" : ""}`);
    console.log(`    ${allows(r.c, r.turn) ? " " : "✗"} ${r.turn} ${r.turnP.toFixed(2)}  (then ${r.runnerUp[0]} ${r.runnerUp[1].toFixed(2)})`);
    console.log(`      dials: ${moved.join(", ") || "none moved"}    gates: ${open.join(", ") || "none open"}`);
    if (verbose) console.log(`      all:   ${(Object.entries(r.deltas) as Array<[Dial, number]>).map(([k, d]) => `${k} ${signed(d)}`).join("  ")}`);
  }
  console.log();
}

const marked = reads.filter((r) => !r.c.open);

// 1. The kind of turn.
const turnRight = marked.filter((r) => allows(r.c, r.turn));
console.log(`Kind of turn: ${turnRight.length}/${marked.length} right`);
const byTurn = new Map<string, [number, number]>();
for (const r of marked) {
  const key = Array.isArray(r.c.turn) ? r.c.turn.join("|") : r.c.turn;
  const [right, all] = byTurn.get(key) ?? [0, 0];
  byTurn.set(key, [right + (allows(r.c, r.turn) ? 1 : 0), all + 1]);
}
console.log(`  ${[...byTurn].map(([k, [right, all]]) => `${k} ${right}/${all}`).join("   ")}`);
for (const r of marked.filter((r) => !allows(r.c, r.turn))) console.log(`  ✗ [${r.app}] "${r.c.message}": ${r.turn} ${r.turnP.toFixed(2)}, then ${r.runnerUp[0]} ${r.runnerUp[1].toFixed(2)}`);
const confidence = (rs: Read[]) => (rs.length ? (rs.reduce((s, r) => s + r.turnP, 0) / rs.length).toFixed(2) : "n/a");
console.log(`  confidence when right ${confidence(turnRight)}, when wrong ${confidence(marked.filter((r) => !allows(r.c, r.turn)))}\n`);

// 2. Named dials move the right way; 3. the others stay.
const named: Array<{ r: Read; dial: Dial; want: number; got: number }> = [];
const still: Array<{ r: Read; dial: Dial; got: number }> = [];
for (const r of marked)
  for (const dial of Object.keys(DIALS) as Dial[]) {
    const want = r.c.dials?.[dial];
    if (want) named.push({ r, dial, want, got: r.deltas[dial] });
    else still.push({ r, dial, got: r.deltas[dial] });
  }
const rightWay = named.filter((n) => Math.sign(n.got) === Math.sign(n.want) && Math.abs(n.got) >= MOVED);
console.log(`Named dials that moved the right way by at least ${MOVED}: ${rightWay.length}/${named.length}`);
console.log(`  size of the move, smallest to largest: ${named.map((n) => Math.abs(n.got) * (Math.sign(n.got) === Math.sign(n.want) ? 1 : -1)).sort((a, b) => a - b).map((v) => v.toFixed(2)).join(" ")}`);
for (const n of named.filter((n) => !rightWay.includes(n))) console.log(`  ✗ [${n.r.app}] "${n.r.c.message}": ${n.dial} ${signed(n.got)}, wanted ${n.want > 0 ? "+" : "−"}`);

const drift = still.map((s) => Math.abs(s.got)).sort((a, b) => a - b);
const drifted = still.filter((s) => Math.abs(s.got) >= MOVED);
console.log(`\nUnnamed dials that stayed (moved less than ${MOVED}): ${still.length - drifted.length}/${still.length}`);
console.log(`  drift: mean ${(drift.reduce((s, v) => s + v, 0) / drift.length).toFixed(3)}, median ${drift[drift.length >> 1].toFixed(3)}, 95th ${drift[Math.floor(drift.length * 0.95)].toFixed(3)}, largest ${drift.at(-1)!.toFixed(3)}`);
const look = still.filter((s) => s.r.c.turn === "look");
const other = still.filter((s) => s.r.c.turn !== "look");
const meanAbs = (xs: typeof still) => (xs.reduce((s, x) => s + Math.abs(x.got), 0) / xs.length).toFixed(3);
console.log(`  on messages about the look ${meanAbs(look)}, on messages about something else ${meanAbs(other)}`);
for (const s of drifted.sort((a, b) => Math.abs(b.got) - Math.abs(a.got)).slice(0, 14)) console.log(`  ~ [${s.r.app}] "${s.r.c.message}": ${s.dial} ${signed(s.got)}`);
if (drifted.length > 14) console.log(`  … and ${drifted.length - 14} more`);

// 4. A little, plainly, much.
const LADDERS: Array<[Dial, string[]]> = [
  ["light", ["Make the accent colour a little lighter", "Make the accent colour lighter", "Make the accent colour much, much lighter, almost pastel"]],
  ["round", ["Slightly rounder buttons please", "More rounded corners", "Make everything as round as it can possibly be"]],
  ["air", ["Give it a bit more breathing room", "Pack way more onto each screen, I want it dense"]],
];
console.log("\nA little, plainly, much:");
for (const app of APPS)
  for (const [dial, messages] of LADDERS) {
    const sizes = messages.map((m) => Math.abs(reads.find((r) => r.app === app.name && r.c.message === m)!.deltas[dial]));
    const ordered = sizes.every((v, i) => i === 0 || v > sizes[i - 1]);
    console.log(`  ${ordered ? " " : "✗"} [${app.name}] ${dial}: ${sizes.map((v) => v.toFixed(2)).join(" < ")}`);
  }

// 5. Gates.
let hit = 0, miss = 0, falseOpen = 0, shut = 0;
const wrongGates: string[] = [];
for (const r of marked)
  for (const gate of Object.keys(GATES) as Gate[]) {
    const want = r.c.gates?.includes(gate) ?? false;
    const got = r.gates[gate] >= 0.5;
    if (want && got) hit++;
    else if (want) (miss++, wrongGates.push(`  ✗ shut  [${r.app}] "${r.c.message}": ${gate} ${r.gates[gate].toFixed(2)}`));
    else if (got) (falseOpen++, wrongGates.push(`  ~ open  [${r.app}] "${r.c.message}": ${gate} ${r.gates[gate].toFixed(2)}`));
    else shut++;
  }
console.log(`\nGates: opened when they should ${hit}/${hit + miss}; stayed shut when they should ${shut}/${shut + falseOpen}`);
for (const line of wrongGates) console.log(line);
