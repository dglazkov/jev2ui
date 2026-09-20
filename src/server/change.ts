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
import { askJev, endpoint, ranked } from "./models.js";
import { mixDesign, mixQuestions } from "./design-mix.js";
import { loadDesign } from "./design-source.js";
import { talk } from "./talk.js";
import { ARCHETYPES, type Block } from "./mock/plan.js";
import type { Decision } from "../shared/events.js";
import { addChange, receiptOf, type DialName, type PaintChange, type Pins, type ScreenAbout, type TurnKind, type TurnRequest, type TurnResponse } from "../shared/turn.js";

const CONTEXT =
  "A developer is making an app with a design tool. `app` describes the app, `design` says how it looks now, `showing` is the screen in front of them, and `other_screens` are the other screens the app already has. They have typed `message` to the tool to have something changed. If `question_asked` is present, the tool had asked that about `earlier_message`, and `message` is their answer: read the two together.";
const ask = (question: string) => ({ context: CONTEXT, question });

export const TURNS: Record<TurnKind, string> = {
  new_app: "The message describes a different app or product from the one in `app`, and asks for that in its place.",
  new_screen: "The message asks for a screen or page the app does not have yet: it is neither `showing` nor one of `other_screens`. Moving part of a screen onto a screen of its own is this too: it asks for a screen that does not exist yet. Changing a screen the app already has is not this.",
  look: "How the app looks: colours, light or dark, typefaces, corners, how dense or spacious it is, shadows, how pictures are treated, its mood or style. Nothing about what is on the screen.",
  structure: "What the screen showing is made of: a section, control, picture or component added, removed or swapped, or its items laid out another way.",
  words: "The text or the data on the screen: a name, the wording, how long it is, its tone, its language, units or currency, which example items appear.",
  arrange: "Where something sits on the same screen: moving one thing up, down or to a corner, or changing the order things come in. Moving something onto a separate screen is not this.",
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

/** Each block, as a person would speak of it: they do not know the grammar's names. */
export const BLOCK_WORDS: Record<Block, string> = {
  banner: "a notice at the top of the screen about something that needs attention: a warning, an alert, an offer, an announcement",
  hero: "the large picture that leads the screen",
  filters: "the search field and the filter chips for narrowing down what is shown",
  custom: "a special component drawn for this app: a chart, a graph, a map, a calendar, a timer, a player, a floor plan",
  stats: "the headline numbers: figures, counters, key metrics",
  list: "the list or grid of items",
  groups: "the grouped rows of settings or options",
  facts: "the label-and-value details: a summary, totals, a price breakdown, specifications",
  prose: "the paragraphs of text: a description, an explanation",
  steps: "the numbered steps or instructions",
  form: "the fields the person fills in: an address, shipping, payment or card details, a sign-up, a booking",
  actions: "the buttons that act on the whole screen, usually at the bottom: the call to action, such as \"Buy now\", \"Book\", \"Continue\"",
};

const SCREEN_CONTEXT =
  "A developer is making an app with a design tool. `screen` is one screen of it, and `has` lists the parts that screen has now. They have typed `message` to the tool to have something changed. The message may be about this screen, about another screen, or about how the whole app looks.";
const askScreen = (question: string) => ({ context: SCREEN_CONTEXT, question });

/**
 * What the message asks of a screen's parts: for every block its kind of screen allows, whether to add it, remove
 * it or leave it; and for every part it has, whether the message is about what that part says.
 */
export function screenQuestions(allowed: Block[], has: string[]): Questions {
  const out: Questions = {};
  for (const block of allowed)
    out[`block_${block}`] = choice(askScreen(`One possible part of this screen is ${BLOCK_WORDS[block]}. What does the message ask for, as to that part?`), {
      add: "The message asks for this part, and the screen does not have it yet.",
      remove: "The message asks for this part to be taken off this screen: removed, hidden, or moved to a screen of its own.",
      keep: "The message does not ask to add or to remove this part. It says nothing of it, or is only about its wording or its look.",
    });
  for (const part of has)
    out[`says_${part}`] = noul(askScreen(`Does the message ask to change what is written in ${part === "header" ? "the screen's title and subtitle" : BLOCK_WORDS[part as Block]}: its wording, length, tone, language, units, or which examples it shows?`), {
      true: "Yes: the message is about the words or data of that part, or about the words of the whole screen.",
      false: "No: the message is about something else, or about adding or removing parts, or about the look.",
    });
  return out;
}

/** What the grammar calls a block, in a word or two, for a receipt. */
export const BLOCK_NAMES: Record<Block, string> = { banner: "notice", hero: "lead picture", filters: "search and filters", custom: "custom component", stats: "headline numbers", list: "list", groups: "grouped rows", facts: "details", prose: "text", steps: "steps", form: "form", actions: "buttons" };

export function changeQuestions(others: ScreenAbout[] = []): Questions {
  const out: Questions = { turn: choice(ask("What kind of change does the message ask for?"), TURNS) };
  // "This screen" is the one showing. A message may also name another by its title or by what it is.
  if (others.length)
    out.about = choice(ask("Which screen is the message about? Go by the screen's title first: a message that uses the words of a title means that screen."), {
      showing: "The screen in front of them (`showing`): the message says \"this screen\" or \"here\", or uses the words of its title, or names no screen at all.",
      ...Object.fromEntries(others.slice(0, 12).map((screen) => [`s${screen.id}`, `The screen titled "${screen.title}"${screen.archetype ? ` (a ${screen.archetype} screen)` : ""}, which is not the one showing. The message uses the words of its title, or plainly describes it.`])),
    });
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
  /** The id of the screen the message names, if it is not the one showing. */
  about?: number;
  decisions: Decision[];
  inputTokens: number;
}

export async function readChange(state: Record<string, unknown>, others: ScreenAbout[] = []): Promise<ChangeRead> {
  const { answers, inputTokens } = await askJev(state, changeQuestions(others));
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
  let about: number | undefined;
  if (answers.about && answers.about.choice !== "showing" && answers.about.probabilities[answers.about.choice] >= 0.6) {
    about = Number(String(answers.about.choice).slice(1));
    decisions.push({ id: "about", question: "which screen?", answer: others.find((screen) => screen.id === about)?.title ?? String(about), p: answers.about.probabilities[answers.about.choice], note: "not the one showing" });
  }
  return { kind: kind as TurnKind, kindP, dials, gates, ...(about !== undefined ? { about } : {}), decisions, inputTokens };
}

/** What a message asks of one screen's parts. Nothing, for a screen whose parts the browser does not know. */
async function readScreen(screen: ScreenAbout, message: string): Promise<{ add: Block[]; remove: Block[]; rewrite: string[]; decisions: Decision[] }> {
  const shape = ARCHETYPES[screen.archetype];
  if (!shape || !screen.blocks) return { add: [], remove: [], rewrite: [], decisions: [] };
  const has = screen.blocks.filter((block): block is Block => shape.order.includes(block as Block));
  // A lead picture and a custom component have no words of their own to write again.
  const parts = ["header", ...has.filter((block) => block !== "hero" && block !== "custom")];
  const { answers } = await askJev({ screen: `"${screen.title}", a ${screen.archetype} screen`, has: has.map((block) => BLOCK_WORDS[block]), message }, screenQuestions(shape.order, parts));
  const decisions: Decision[] = [];
  const add: Block[] = [];
  const remove: Block[] = [];
  for (const block of shape.order) {
    const [[asked, p]] = ranked(answers[`block_${block}`]);
    if (asked === "keep" || p < 0.5 || (asked === "add") === has.includes(block)) continue;
    // What makes it this kind of screen stays: a feed without a list is not a feed.
    const must = asked === "remove" && shape.requires?.includes(block);
    decisions.push({ id: `block:${block}`, question: `${BLOCK_NAMES[block]}?`, answer: must ? "stays" : asked, p, ...(must ? { note: `asked to go, but a ${screen.archetype} screen always has one` } : {}) });
    if (!must) (asked === "add" ? add : remove).push(block);
  }
  const rewrite = parts.filter((part) => answers[`says_${part}`].noul >= 0.5 && !remove.includes(part as Block));
  for (const part of rewrite) decisions.push({ id: `says:${part}`, question: `${part === "header" ? "title" : BLOCK_NAMES[part as Block]}: other words?`, answer: "asked for", p: answers[`says_${part}`].noul });
  return { add, remove, rewrite, decisions };
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
  const others = request.others ?? [];
  const [read, ofShowing] = await Promise.all([
    readChange(
      {
        app,
        design: look,
        showing: `"${showing.title}", ${showing.archetype ? `a ${showing.archetype} screen` : "a screen"} of the app`,
        other_screens: others.map((screen) => `"${screen.title}"`),
        message,
        ...(answering ? { earlier_message: answering.message, question_asked: answering.question } : {}),
      },
      others,
    ),
    readScreen(showing, message),
  ]);
  const target = others.find((screen) => screen.id === read.about) ?? showing;
  // A message that names a screen the app has is about that screen, whatever else Jev made of it: it does not ask for another.
  if (read.kind === "new_screen" && target !== showing) read.kind = "structure";
  const of = target === showing ? ofShowing : await readScreen(target, message);
  const decisions = [...read.decisions, ...(read.kind === "new_app" || read.kind === "question" ? [] : of.decisions)];
  const done = (rest: Pick<TurnResponse, "act"> & Partial<TurnResponse>): TurnResponse => ({ kind: read.kind, decisions, ms: Math.round(performance.now() - start), endpoint: endpoint(), ...rest });

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

  const line = (block: string, from: string, to: string) => ({ what: block === "header" ? "title" : BLOCK_NAMES[block as Block], from, to });
  const screen = {
    id: target.id,
    add: of.add,
    remove: of.remove,
    rewrite: of.rewrite,
    lines: [...of.add.map((block) => line(block, "not there", "added")), ...of.remove.map((block) => line(block, "there", "removed")), ...(read.kind === "words" ? of.rewrite.map((part) => line(part, "as it was", "written again")) : [])],
  };
  const reshaped = of.add.length > 0 || of.remove.length > 0;

  if (read.kind === "new_app") return done({ act: "app" });
  // "Move the payment form to a screen of its own" is two things: the new screen, and this one without the form.
  if (read.kind === "new_screen") return done({ act: "screen", design, ...(of.remove.length ? { screen: { ...screen, add: [], rewrite: [], lines: screen.lines.filter((l) => l.to === "removed") } } : {}) });
  // Parts added or taken away are done to the letter, whatever else Jev made of the message.
  if (read.kind !== "question" && reshaped) return done({ act: "remake", design, screen: { ...screen, rewrite: [] } });
  // Words: only the parts the message is about are written again. If Jev could not tell which, all of them are.
  if (read.kind === "words") return done({ act: "remake", design, screen: of.rewrite.length ? screen : { ...screen, blunt: true } });
  // A change to what the screen is made of that named no part ("show them as a grid"): made again with the message in mind. Unless it was the look after all ("no cards").
  if (read.kind === "structure" && !design) return done({ act: "remake", screen: { ...screen, blunt: true } });
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
