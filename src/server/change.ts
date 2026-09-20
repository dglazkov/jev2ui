// What a message asks to have changed (docs/chat-and-turns.md).
//
// After the first message, every message to the tool is about something that is already there. Asking Jev all of
// its questions again with the message added would let every answer that sat near even odds flip, and the app
// being adjusted would become another app. So Jev is asked about the change and not the state:
//
//   kind     what sort of thing is being asked for: another app, another screen, the look, what the screen is
//            made of, its words, where things sit, or nothing (a question)
//   dials    for each dial of the mix, a Score from "much less" to "much more" with "as it is" in the middle. The
//            expected score is a signed step, so "a touch lighter" and "much lighter" differ in size, and a dial
//            the message does not mention stays where it is
//   gates    for each choice of the mix, a Noul: does the message ask to change this? Only those that open are
//            asked again, as the mix asked them, with the message beside the brief
//
// One request, and a second only if a gate opened. The dials and gates are asked whatever the kind turns out to
// be: Jev calls "no cards" a change to what the screen is made of, and the cards gate opens all the same. What was
// found when this was probed is in docs/change-probe.md; the wording below is what that probe arrived at.

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { askJev, ranked } from "./models.js";
import { mixDesign, mixQuestions } from "./design-mix.js";
import { loadDesign } from "./design-source.js";
import { talk } from "./talk.js";
import type { Decision } from "../shared/events.js";
import { addChange, receiptOf, type DialName, type PaintChange, type Pins, type TurnKind, type TurnRequest, type TurnResponse } from "../shared/turn.js";

const CONTEXT =
  "A developer is making an app with a design tool. `app` describes the app, `design` says how it looks now, and `showing` is the screen in front of them. They have typed `message` to the tool to have something changed. If `question_asked` is present, the tool had asked that about `earlier_message`, and `message` is their answer: read the two together.";
const ask = (question: string) => ({ context: CONTEXT, question });

export const TURNS: Record<TurnKind, string> = {
  new_app: "The message describes a different app or product from the one in `app`, and asks for that in its place.",
  new_screen: "The message asks for another screen or page of the same app, one that is not the screen showing.",
  look: "How the app looks: colours, light or dark, typefaces, corners, how dense or spacious it is, shadows, how pictures are treated, its mood or style. Nothing about what is on the screen.",
  structure: "What the screen showing is made of: a section, control, picture or component added, removed or swapped, or its items laid out another way.",
  words: "The text or the data on the screen: a name, the wording, how long it is, its tone, its language, units or currency, which example items appear.",
  arrange: "Where something sits: moving one thing to another place on the screen, or changing the order things come in.",
  question: "The message asks a question about the design and does not ask for anything to change.",
};

/** Seven levels and not five: with two steps a side, "a little" and the plain word land on the same one. */
const steps = (less: [string, string, string], same: string, more: [string, string, string]) => [...less, same, ...more];

export const CHANGE_DIALS: Record<DialName, { label: string; q: string; levels: string[] }> = {
  vivid: {
    label: "accent vividness",
    q: "What does the message ask for, as to how saturated the accent colour is? This is not about photographs, and not about how light or dark anything is.",
    levels: steps(
      ["Much more muted: far greyer and quieter.", "Clearly more muted.", "A touch more muted."],
      "As saturated as it is: the message does not ask for a more or a less saturated accent.",
      ["A touch more vivid.", "Clearly more vivid.", "Much more vivid: as bright and saturated as it can be."],
    ),
  },
  light: {
    label: "accent lightness",
    q: "What does the message ask for, as to how light or deep the accent colour is?",
    levels: steps(
      ["Much deeper and darker.", "Clearly deeper.", "A touch deeper."],
      "As light as it is: the message does not ask for a lighter or a deeper accent colour.",
      ["A touch lighter.", "Clearly lighter.", "Much lighter: toward a pale pastel."],
    ),
  },
  warmth: {
    label: "warmth of neutrals",
    q: "What does the message ask for, as to whether backgrounds and greys lean cold or warm?",
    levels: steps(
      ["Much colder: toward steel and blue-grey.", "Clearly cooler.", "A touch cooler."],
      "As they are: the message does not ask for warmer or cooler backgrounds.",
      ["A touch warmer.", "Clearly warmer.", "Much warmer: toward cream, sand and paper."],
    ),
  },
  round: {
    label: "roundness",
    q: "What does the message ask for, as to how rounded corners are?",
    levels: steps(
      ["Much sharper: toward square.", "Clearly sharper.", "A touch sharper."],
      "As rounded as they are: the message does not ask for rounder or sharper corners.",
      ["A touch rounder.", "Clearly rounder.", "Much rounder: toward pills and circles."],
    ),
  },
  air: {
    label: "whitespace",
    q: "What does the message ask for, as to how much whitespace the screens have?",
    levels: steps(
      ["Much denser: far more packed onto each screen.", "Clearly more compact.", "A touch more compact."],
      "As roomy as they are: the message does not ask for more or less space.",
      ["A touch roomier.", "Clearly roomier.", "Much airier: far more space around everything."],
    ),
  },
};

/** A dial's answer as a step from −2 (much less) to +2 (much more). A step is a level of the mix's own rubric. */
export const step = (answer: { score: number }) => ((answer.score - 3) * 2) / 3;
/** Below this a dial has not been asked to move. Messages that are not about the look move one by 0.01 on average. */
export const MOVED = 0.3;

/** Each gate, and the questions of the mix that are asked again when it opens. */
export const GATES = {
  hue: { again: ["hue"], label: "another accent colour?", q: "Does the message ask for a different accent colour, or object to the one there is?", yes: "It names a colour, or says the present colour is wrong.", no: "It says nothing about which colour the accent is. Lighter, darker, brighter or duller are not a different colour." },
  dark: { again: ["dark"], label: "light or dark?", q: "Does the message ask to switch between a dark interface and a light one?", yes: "It asks for dark mode, night mode, a dark or black background; or for a light or white background.", no: "It does not ask for the background to go from light to dark or from dark to light." },
  type: { again: ["type"], label: "other typefaces?", q: "Does the message ask for different typefaces?", yes: "It names a kind of font, says the lettering feels wrong, or asks for a change of mood or personality (more playful, more serious, more elegant, fancier), which lettering carries.", no: "It says nothing about fonts or lettering, and asks for no change of mood." },
  elevation: { again: ["elevation"], label: "another way of showing depth?", q: "Does the message ask to change how cards are set off from the page: shadows, borders or flat?", yes: "It mentions shadows, borders, outlines, flatness or depth.", no: "It says nothing about shadows, borders or depth." },
  pictures: { again: ["photos", "photo_look"], label: "pictures, or how they look?", q: "Does the message ask to change whether there are pictures, or how they are treated?", yes: "It asks for pictures or for none, or for them to be black and white, tinted, muted, natural or drawn.", no: "It says nothing about pictures." },
  cards: { again: ["cards"], label: "cards or none?", q: "Does the message ask to change whether content sits in cards?", yes: "It asks for cards, boxes or containers, or for content to flow without them.", no: "It says nothing about cards or containers." },
} as const;
export type Gate = keyof typeof GATES;

export function changeQuestions(): Questions {
  const out: Questions = { turn: choice(ask("What kind of change does the message ask for?"), TURNS) };
  for (const [key, { q, levels }] of Object.entries(CHANGE_DIALS)) out[key] = score(ask(q), levels as [string, string, ...string[]]);
  for (const [key, { q, yes, no }] of Object.entries(GATES)) out[key] = noul(ask(q), { true: yes, false: no });
  return out;
}

/** What one Jev request makes of a message. */
export interface ChangeRead {
  kind: TurnKind;
  kindP: number;
  dials: Partial<Record<DialName, number>>;
  gates: Gate[];
  decisions: Decision[];
  inputTokens: number;
}

export async function readChange(state: Record<string, unknown>): Promise<ChangeRead> {
  const { answers, inputTokens } = await askJev(state, changeQuestions());
  const order = ranked(answers.turn);
  const [second, secondP] = order[1];
  // Making a screen spends a run, and answering a question spends next to nothing: a message that may well be a question is taken as one.
  const [kind, kindP] = order[0][0] !== "look" && answers.turn.probabilities.question >= 0.3 ? (["question", answers.turn.probabilities.question] as const) : order[0];
  const decisions: Decision[] = [{ id: "turn", question: "what kind of change?", answer: kind, p: kindP, ...(kind !== order[0][0] ? { note: `${order[0][0]} came first, ${order[0][1].toFixed(2)}; asking costs less than making` } : secondP > 0.2 ? { note: `then ${second}, ${secondP.toFixed(2)}` } : {}) }];
  const dials: ChangeRead["dials"] = {};
  for (const [key, { label, levels }] of Object.entries(CHANGE_DIALS) as Array<[DialName, (typeof CHANGE_DIALS)[DialName]]>) {
    const by = step(answers[key]);
    if (Math.abs(by) < MOVED) continue;
    dials[key] = Math.round(by * 100) / 100;
    decisions.push({ id: key, question: label, answer: `${by > 0 ? "+" : ""}${by.toFixed(2)}: ${levels[Math.round(answers[key].score)].replace(/[.:].*$/, "").toLowerCase()}`, p: Math.min(1, Math.abs(by) / 2) });
  }
  const gates = (Object.keys(GATES) as Gate[]).filter((gate) => answers[gate].noul >= 0.5);
  for (const gate of gates) decisions.push({ id: `gate:${gate}`, question: GATES[gate].label, answer: "asked for", p: answers[gate].noul });
  return { kind: kind as TurnKind, kindP, dials, gates, decisions, inputTokens };
}

const AGAIN =
  "brief describes an app, and `look` says how it looks now. The developer has asked for a change, in `message`. Answer for how the product should look once that change is made: where the message says what it wants, follow it; where it does not, choose what suits the product and the message's mood.";

/** Asks again the choices whose gates opened, with the message beside the brief. A choice that comes back as it was gives way to the next likeliest: the person asked for another. */
async function askAgain(brief: string, look: string, message: string, gates: Gate[], now: Required<Pins>): Promise<{ pins: Pins; decisions: Decision[] }> {
  const keys = gates.flatMap((gate) => GATES[gate].again as readonly string[]);
  const { answers } = await askJev({ brief, look, message }, mixQuestions(keys, (question) => ({ context: AGAIN, question })));
  const pins: Record<string, string | boolean> = {};
  const decisions: Decision[] = [];
  for (const key of keys) {
    const answer = answers[key];
    if (typeof answer.noul === "number") {
      pins[key] = answer.noul >= 0.5;
      decisions.push({ id: `again:${key}`, question: `${key}, asked again`, answer: pins[key] ? "yes" : "no", p: answer.noul });
      continue;
    }
    const order = ranked(answer);
    const [name, p] = order[0][0] === now[key as keyof Pins] && order[1] ? order[1] : order[0];
    pins[key] = name;
    decisions.push({ id: `again:${key}`, question: `${key}, asked again`, answer: name, p, ...(name !== order[0][0] ? { note: `${order[0][0]} is what it has; the next likeliest` } : {}) });
  }
  // How pictures look says nothing where there are none.
  if (pins.photos === false) delete pins.photo_look;
  return { pins: pins as Pins, decisions };
}

/** What to do about a message typed to an app that is already there. */
export async function readTurn(request: TurnRequest): Promise<TurnResponse> {
  const start = performance.now();
  const { message, app, showing, answering } = request;
  const mix = "brief" in request.design ? request.design : null;
  const before = mix ? await mixDesign(mix.brief, mix.seed, mix.change) : null;
  const look = before?.summary ?? "It is painted by the developer's own DESIGN.md file.";
  const read = await readChange({
    app,
    design: look,
    showing: `"${showing.title}", ${showing.archetype ? `a ${showing.archetype} screen` : "a screen"} of the app`,
    message,
    ...(answering ? { earlier_message: answering.message, question_asked: answering.question } : {}),
  });
  const decisions = [...read.decisions];
  const done = (rest: Pick<TurnResponse, "act"> & Partial<TurnResponse>): TurnResponse => ({ kind: read.kind, decisions, ms: Math.round(performance.now() - start), ...rest });

  // The look is listened to whatever else the message asks for.
  let design: TurnResponse["design"];
  const asksForPaint = Object.keys(read.dials).length > 0 || read.gates.length > 0;
  if (mix && before && asksForPaint && read.kind !== "new_app" && read.kind !== "question") {
    const again = read.gates.length ? await askAgain(mix.brief, look, message, read.gates, before.chosen) : { pins: {}, decisions: [] };
    decisions.push(...again.decisions);
    const delta: PaintChange = { dials: read.dials, pins: again.pins };
    const change = addChange(mix.change, delta);
    const { report, mixed } = await loadDesign({ brief: mix.brief, seed: mix.seed, change }).loaded;
    const lines = receiptOf(before.decisions, report.decisions);
    if (lines.length) design = { delta, change, receipt: lines, report, markdown: mixed! };
  }

  if (read.kind === "new_app") return done({ act: "app" });
  if (read.kind === "new_screen") return done({ act: "screen", design });
  if (read.kind === "structure" || read.kind === "words") return done({ act: "remake", design });
  if (design) return done({ act: "paint", design });
  if (read.kind === "look" && !mix) return done({ act: "talk", text: "The look comes from your own DESIGN.md, and I only change a design that Jev mixed. Edit the file, or switch to Jev's mix and ask again.", options: [] });
  if (read.kind === "look" && asksForPaint) return done({ act: "talk", text: "Nothing moved: what you asked for is already as far as it goes.", options: [] });
  // An instruction leads somewhere if Jev, asked the same way, finds something for it to do.
  const leads = async (instruction: string) => {
    const would = await readChange({ app, design: look, showing: `"${showing.title}"`, message: instruction });
    if (would.kind === "arrange" || would.kind === "question") return false;
    return would.kind !== "look" || (Boolean(mix) && (Object.keys(would.dials).length > 0 || would.gates.length > 0));
  };
  return done({ act: "talk", ...(await talk({ ...request, look, kind: read.kind }, leads)) });
}
