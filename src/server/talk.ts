// When the tool has to say something (docs/chat-and-turns.md).
//
// A message that made or changed something is answered by what it did, and code writes the receipt. The tool only
// speaks when Jev found nothing to do: the message maps to no dial and no choice, it asks for something the grammar
// does not have (where a thing sits belongs to the kind of screen), or it is a question. Jev decided that; Gemini
// words it, and offers two or three things the person might have meant, each a whole instruction that can be sent
// as it stands, so that nothing ever has to work out what "the second one" referred to.
//
// Gemini is told what the tool can change in the words the code already has for it: the ends of each dial, the
// criteria of each choice. Written by hand, that list would drift from what is true. And since Gemini may still
// offer what cannot be done, whoever calls says which instructions lead somewhere, and the rest are dropped.

import { streamGeminiJson } from "./models.js";
import { DIALS, ELEVATION, HUES, PHOTO_LOOK, TYPE } from "./design-mix.js";
import { ARCHETYPES, BLOCKS } from "./mock/plan.js";
import type { Option, TurnKind, TurnRequest } from "../shared/turn.js";

const ends = (key: keyof typeof DIALS) => `from "${DIALS[key].levels[0]}" to "${DIALS[key].levels[4]}"`;
const criteria = (options: Record<string, { criteria: string }>) => Object.values(options).map((o) => `    - ${o.criteria}`).join("\n");

const CAN = `What the tool can change, and nothing else:
- The look of the whole app, at once and for nothing:
  - the accent colour: its hue (${Object.keys(HUES).join(", ")}); how vivid, ${ends("vivid")}; how light, ${ends("light")}
  - a light interface or a dark one
  - backgrounds and greys, ${ends("warmth")}
  - corners, ${ends("round")}
  - whitespace, ${ends("air")}
  - typefaces, one of:
${criteria(TYPE)}
  - how a card is set off from the page, one of:
${criteria(ELEVATION)}
  - content in cards, or flowing on the page without them
  - pictures or none; and how they look, one of:
${criteria(PHOTO_LOOK)}
- The screen that is showing can be made again with a change in mind. That can add or drop a section (the sections are: ${BLOCKS.join(", ")}), lay its items out another way (rows, cards, a grid, a reel), or change what the words say, their length, tone, language or units.
- Another screen can be added to the app (the kinds of screen are: ${Object.keys(ARCHETYPES).join(", ")}).
- A different app can be started.

What it cannot do: move a thing to another place, or change the order sections come in. The order belongs to the kind of screen, as the design systems the components come from prescribe. It cannot change one element's size or colour on its own either; the look is the whole app's.`;

const SYSTEM = `You are the voice of a design tool that makes mock screens of apps. A developer typed a message to it, and the tool could not act on the message. You write what the tool says back.

${CAN}

Rules:
- "text" is one or two short, plain sentences, spoken to the developer as a colleague would. No greeting, no apology, no enthusiasm, no orders. Never say anything was changed: nothing was. When you need to know what they meant, ask it as a question ("Which part feels flat: the colours, the lettering, or how tight it is?").
- "options" are two or three things the developer may have meant, that the tool can do. Each "instruction" is a whole request in the developer's own voice, which changes one thing and would make sense to someone who had not seen this conversation ("Make the accent colour more vivid", not "the first one"). Each "label" is that in two to four words.
- If they asked a question, answer it from what you are given, briefly, and offer options only if something they might want follows from it.`;

const WHY: Record<string, string> = {
  look: "The message is about how the app looks, but it did not say enough for the tool to tell which of the things it can change was meant. Ask which, offering the likeliest as options.",
  arrange: "The message asks to move something or to reorder the screen, which the tool cannot do. Say so in a few words, say why, and offer the nearest things it can do.",
  question: "The message is a question about the design. Answer it from the decisions below, which are the tool's own record of why the screen is as it is.",
};

const SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    options: { type: "array", maxItems: 3, items: { type: "object", properties: { label: { type: "string" }, instruction: { type: "string" } }, required: ["label", "instruction"] } },
  },
  required: ["text", "options"],
};

/** `leads` says whether an instruction, sent as a message, would have the tool do something. */
export async function talk(request: TurnRequest & { look: string; kind: TurnKind }, leads: (instruction: string) => Promise<boolean>): Promise<{ text: string; options: Option[] }> {
  const { message, app, look, showing, kind, answering } = request;
  const prompt = [
    `The app: ${app}`,
    `How it looks now: ${look}`,
    `The screen showing: "${showing.title}"${showing.archetype ? ` (${showing.archetype})` : ""}`,
    ...(kind === "question" && showing.decisions?.length ? [`Decisions behind this screen:\n${showing.decisions.slice(0, 60).map((d) => `- ${d.question}: ${d.answer}`).join("\n")}`] : []),
    ...(answering ? [`Earlier they wrote "${answering.message}", the tool asked "${answering.question}", and this is their answer.`] : []),
    `The developer's message: "${message}"`,
    WHY[kind] ?? WHY.look,
  ].join("\n\n");
  const { text: raw } = await streamGeminiJson({ system: SYSTEM, prompt, schema: SCHEMA });
  const said = JSON.parse(raw) as { text?: string; options?: Option[] };
  const offered = (said.options ?? []).filter((o) => o?.label && o?.instruction && o.instruction.trim().toLowerCase() !== message.trim().toLowerCase()).slice(0, 3);
  const kept = await Promise.all(offered.map(async (option) => ((await leads(option.instruction).catch(() => false)) ? option : null)));
  return { text: String(said.text ?? "").trim() || "I could not tell what to change. Say it another way?", options: kept.filter((o): o is Option => o !== null) };
}
