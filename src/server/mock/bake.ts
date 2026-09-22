// Baking: the one place where a model writes code.
//
// The kit covers what most screens are made of. The rest is a long tail (a map,
// a timer face, a seating plan, a chessboard) that no catalog will ever finish,
// so none of it is in this repo. When Jev says a screen needs something drawn
// specially for it, the tree ships with an empty slot, and a stronger Gemini
// model bakes what goes in it, to a contract:
//
//   Jev     that there is one, what the person does with it, the box it gets,
//           whether it draws the list's own items (plan.ts)
//   Gemini  a `render(root, state, kit)` function, the schema of the data it
//           draws, that data for this screen, and a card saying when to use it
//   code    checks the source (it parses, paints with the design's variables
//           only, reaches for no network), and sends it as `defineComponent`;
//           the browser runs it in a sandboxed frame (src/web/kit/sandbox.ts)
//
// A baked component joins the app's shelf. On the next screen that needs
// something custom, the cards on the shelf are the options of a Choice, so Jev
// can say "the same map" and only the data is written, by the small model.
// That is what keeps one app's map the same map on every screen.
//
// The shelf is the browser's, like the rest of the session (shared/journey.ts):
// `defineComponent` carries a component whole, the browser sends back the ones
// its screens define, and nothing is kept here. So a shelf outlasts this
// process, no two people share one, and an app that is saved and opened by
// somebody else brings its components with it. What comes back has been out of
// our hands, so it is checked like a fresh bake (`shelfFrom`), and a component
// is named by a hash of what it is: an id cannot be claimed, only earned.

import { createHash } from "node:crypto";
import { choice } from "@typesafe-ai/sdk";
import { BAKED, type Baked } from "../../shared/kit.js";
import { BAKER_MODEL, bakeGeminiJson, streamGeminiJson } from "../models.js";
import type { Run } from "../run.js";
import { fill } from "../grammar/fill.js";
import { idiom } from "../idioms.js";
import type { ScreenPlan } from "./plan.js";
import type { Setting } from "./screen.js";

/** More than an app has use for; a shelf is sent with every tap. */
const LARGEST_SHELF = 12;

/** What a component is, as its name: the same source and schema are the same component, whoever baked it and wherever it has been. */
const idOf = (source: string, dataSchema: unknown) => createHash("sha256").update(source).update("\0").update(JSON.stringify(dataSchema)).digest("hex").slice(0, 16);

/** The components a browser sent that are what they say they are and would pass as fresh bakes. The rest are dropped, in silence: the screen bakes its own. */
export function shelfFrom(sent: unknown): Baked[] {
  if (!Array.isArray(sent)) return [];
  const shelf = new Map<string, Baked>();
  for (const one of sent.slice(-LARGEST_SHELF)) {
    const parsed = BAKED.safeParse(one);
    if (parsed.success && parsed.data.id === idOf(parsed.data.source, parsed.data.dataSchema) && !lint(parsed.data.source).length) shelf.set(parsed.data.id, parsed.data);
  }
  return [...shelf.values()];
}

/** The models this file calls, where a test can stand in for them. */
export const calls = { bake: bakeGeminiJson, write: streamGeminiJson };

const SYSTEM = `You build one custom UI component for a mock-up of an app screen.
The rest of the screen (top bar, lists, figures, text, buttons) is already built from a component kit. You build only the one thing that kit cannot draw, and it must look like it belongs to the same screen.

You return JSON: name, card, dataSchema, data, source.

## source
Plain JavaScript for a browser: no modules, no imports, no JSX, no TypeScript, no libraries. It defines one function:

  function render(root, state, kit) { ... }

- \`root\` is an empty <div> that fills your box exactly (width and height 100%). The box has a fixed aspect ratio, given below. It is about 360px wide on a phone and can be three times that on a desktop, so size everything relative to the box: an inline <svg> with a viewBox and width/height 100% is the usual answer. Nothing outside the box is visible and it does not scroll, so budget the height before you draw: everything you add (a row of chips above, a legend, the controls below) comes out of the same box, and the main figure gets what is left, not the full width. Lay the box out as a flex column in which the figure is the one part that shrinks (flex: 1 1 0; min-height: 0) and the rest keeps its natural height. Leave no large empty areas.
- \`render\` is called at the start, again whenever \`state\` changes, and again when the box is resized. Each time, rebuild the content of \`root\` from scratch. Keep whatever must survive a redraw (what is selected, whether a timer is running, interval handles) in variables declared outside \`render\`, and never start a second interval.
- \`state.data\` is the JSON your dataSchema describes. It can be undefined for a moment while the screen loads: then draw the component empty, never throw.
- \`state.items\` is given only when the brief says the component draws the screen's list items: the array of those items (it grows while the screen loads).
- \`kit.select(value)\`: tells the screen what the person has currently chosen or set (a small JSON value, e.g. {"seats":["F12","F13"],"total":"$180"}). The screen's own buttons act on it.
- \`kit.open(label, data)\`: the person opened a part that has a page of its own; the app goes to that page. Only for such parts. Never for selecting, toggling or starting something.
- \`kit.openItem(item)\`: the same, for one of \`state.items\`.
- The screen's buttons cannot reach into your component. Any control it needs in order to work (start and pause, zoom, a legend) is yours to draw, inside the box.
- A mock should feel alive. Timers run, seats toggle, dials turn, pins show a callout. Use pointer events, setInterval and requestAnimationFrame freely.
- Generate bulk in code. Hundreds of seats, streets or candles come from loops and a small seeded pseudo-random function, never from \`data\`.
- Put text that comes from data into the page with textContent, not innerHTML.
- Not available: network, fetch, images or fonts by URL, localStorage, cookies, alert, prompt.

## paint
A design system paints the screen through CSS variables, and the same component must work under any of them, light or dark. So colour comes ONLY from these variables. Never write a colour literal: no #hex, no rgb() or hsl(), no named colours. For tints and overlays use color-mix, e.g. color-mix(in oklab, var(--k-accent) 25%, transparent). \`currentColor\`, \`transparent\` and \`none\` are fine. In SVG set colours through style (style="fill:var(--k-accent)"), not through fill= attributes.

  --k-page         the screen's background        --k-card      surface of cards and panels
  --k-text         main text and ink              --k-muted     secondary text, quiet lines
  --k-accent       the one accent, for fills      --k-on-accent text on an accent fill
  --k-ink          the accent as ink: accent-coloured text, strokes and outlines
  --k-accent-soft  a pale accent wash             --k-border    hairlines and outlines
  --k-success, --k-warning, --k-danger            states (free / almost gone / taken or failing)
  --k-radius-sm, --k-radius-md, --k-radius-card, --k-radius-button, --k-radius-chip   corner radii: reuse them, they are the design's character
  --k-space-xs, --k-space-sm, --k-space-md, --k-space-lg                                spacing

Your box is transparent and sits on --k-page. Text inherits the design's font; use these classes for type, on HTML or SVG text: \`k-text\` plus one of \`k-display\`, \`k-headline\`, \`k-title\`, \`k-body\`, \`k-label\`, \`k-caption\`, and \`k-tone-muted\` for secondary text. In SVG, set text colour with style="fill:var(--k-text)".
The kit's own pieces are available as classes, and using them is what makes the component belong: \`<button class="k-button k-primary">\` (or k-secondary, k-text; add k-small), \`<span class="k-badge k-on-success">\` (k-on-warning, k-on-danger, k-on-accent, k-on-neutral), \`<span class="k-chip">\` (add k-checked when chosen), and icons as \`<span class="k-icon material-symbols-outlined">timer</span>\` (any Material Symbols name).
Take the component's character from the brand described in the brief: heavy or hairline strokes, round or square ends, playful or austere. A timer for a newspaper and a timer for a sweet shop are not the same timer.

## dataSchema and data
\`dataSchema\` is a JSON Schema (as JSON text) for the content the component shows: the names, labels, figures and states that belong to this app, which another writer will fill in when the component is reused on another screen. Use only: type, properties, required, items, enum, description. The top level is an object. Keep it small: under 1500 characters of data. Everything that does not vary between uses belongs in the code.
\`data\` (as JSON text) is that content for this screen: specific, plausible, never placeholders.

## name and card
\`name\`: two or three words, e.g. "Seating plan". \`card\`: one sentence saying when a screen needs this component, stated as a fact about the screen and general enough to apply to another screen of the same app, e.g. "The person chooses seats in a venue with a stage."`;

const RESPONSE = {
  type: "object",
  properties: {
    name: { type: "string" },
    card: { type: "string" },
    dataSchema: { type: "string", description: "A JSON Schema, as JSON text." },
    data: { type: "string", description: "JSON text matching dataSchema." },
    source: { type: "string", description: "JavaScript defining function render(root, state, kit)." },
  },
  required: ["name", "card", "dataSchema", "data", "source"],
  propertyOrdering: ["name", "card", "dataSchema", "data", "source"],
};

const NAMED = "white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver|gold|navy|teal|brown";
const RULES: Array<[RegExp, string]> = [
  [/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b(?![\w-])/i, "a #hex colour; use the --k-* variables and color-mix"],
  [/\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\s*\(/i, "a colour function; use the --k-* variables and color-mix"],
  [new RegExp(`(?:fill|stroke|color|background|background-color|border-color|stop-color)\\s*[:=]\\s*["'\`]?\\s*(?:${NAMED})\\b`, "i"), "a named colour; use the --k-* variables"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|localStorage|sessionStorage)\b|document\.cookie|\bimport\s*\(/, "something the sandbox does not have (network or storage)"],
  [/https?:\/\/(?!www\.w3\.org\/)/, "a URL; nothing can be loaded from the network"],
];

/** What is wrong with a baked source, in words the baker can act on. Empty when it may be sent. */
export function lint(source: string): string[] {
  const problems: string[] = [];
  if (!/function\s+render\s*\(/.test(source)) problems.push("it does not define `function render(root, state, kit)`");
  if (source.length > 60_000) problems.push("it is longer than 60,000 characters");
  try {
    // Compiled, never called: this only finds syntax errors.
    new Function(source);
  } catch (error) {
    problems.push(`it does not parse: ${(error as Error).message}`);
  }
  for (const [pattern, problem] of RULES) {
    const found = source.match(pattern);
    if (found) problems.push(`it contains ${problem} (found \`${found[0].trim()}\`)`);
  }
  return problems;
}

function brief(screen: string, plan: ScreenPlan, setting: Setting): string {
  const { graph } = idiom();
  const contract = plan.custom!;
  const ratio = graph.ratioOf(contract.size);
  const others = plan.blocks.filter((b) => b !== "custom");
  return [
    setting.app ? `The app, as first described: ${setting.app}` : "",
    `The screen: ${screen}`,
    setting.reachedBy ? `The person got to this screen by ${setting.reachedBy}.` : "",
    setting.about ? `What the previous screen showed about this, which the data must agree with:\n${JSON.stringify(setting.about)}` : "",
    `It is a ${plan.archetype} screen. Around your component the kit already draws: a top bar with the title${others.length ? `, ${others.join(", ")}` : ""}. Do not repeat them.`,
    `What the person does with your component: ${graph.toldOf("custom_use", contract.use)}`,
    `Your box: aspect ratio ${ratio} (width:height) on a phone. On a wide screen it is wider than that, never taller, so centre what you draw.`,
    contract.linked
      ? `The component draws the same items the screen lists, so the two agree: read them from state.items, place or plot each one, and call kit.openItem(item) when one is opened. Each item matches this schema:\n${JSON.stringify(graph.itemSchema(plan))}\nItems carry no coordinates: derive a stable position for each from a hash of its title.`
      : "",
    setting.architecture ?? "",
    setting.voice ? `The brand, for the component's character only (its metaphors are not the subject):\n${setting.voice}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function bakeNew(run: Run, screen: string, plan: ScreenPlan, setting: Setting): Promise<{ baked: Baked; data: unknown } | undefined> {
  const prompt = brief(screen, plan, setting);
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const generated = await calls.bake({ system: SYSTEM, prompt: prompt + feedback, schema: RESPONSE });
    run.stats.geminiInputTokens += generated.inputTokens;
    run.stats.geminiOutputTokens += generated.outputTokens;
    let problems: string[];
    let reply: any;
    try {
      reply = JSON.parse(generated.text);
      problems = lint(String(reply.source ?? ""));
      for (const key of ["dataSchema", "data"]) {
        try {
          reply[key] = JSON.parse(reply[key]);
        } catch {
          problems.push(`\`${key}\` is not JSON text`);
        }
      }
      if (!problems.length && (typeof reply.dataSchema !== "object" || reply.dataSchema === null || Array.isArray(reply.dataSchema))) problems.push("`dataSchema` is not a JSON Schema object");
    } catch {
      problems = ["the reply was not the JSON asked for"];
    }
    run.trace({
      stage: `Gemini: generate ${reply?.name ? `component "${reply.name}"` : "a component"}${attempt > 1 ? " again" : ""}`,
      ms: generated.ms,
      detail: problems.length ? `rejected: ${problems.join("; ")}` : `${BAKER_MODEL}; ${String(reply.source).length} characters of source. ${reply.card}`,
      tokens: { input: generated.inputTokens, output: generated.outputTokens },
    });
    if (!problems.length) {
      const baked: Baked = { id: idOf(String(reply.source), reply.dataSchema), name: String(reply.name).slice(0, 80), card: String(reply.card).slice(0, 400), source: String(reply.source), dataSchema: reply.dataSchema, contract: plan.custom! };
      return { baked, data: reply.data };
    }
    feedback = `\n\nYour previous attempt was rejected because ${problems.join("; and ")}. Write it again, whole, without that.`;
  }
  return undefined;
}

/** The small model fills a component that is already on the shelf, as it fills any other part of a screen. */
async function writeData(run: Run, screen: string, baked: Baked, setting: Setting): Promise<unknown> {
  const generated = await calls.write({
    system: "You write the sample content shown inside one component of a mock-up of an app screen, as JSON matching the schema. Specific, plausible names, figures and states, never placeholders. Keep every string short.",
    prompt: [
      setting.app ? `The app, as first described: ${setting.app}` : "",
      setting.reachedBy ? `The person got to this screen by ${setting.reachedBy}.` : "",
      setting.about ? `What the previous screen showed about this, which you must agree with:\n${JSON.stringify(setting.about)}` : "",
      setting.architecture ?? "",
      `Screen description: ${screen}`,
      `Write the content of its "${baked.name}" component. ${baked.card}`,
    ]
      .filter(Boolean)
      .join("\n"),
    schema: { type: "object", properties: { data: baked.dataSchema }, required: ["data"] },
  });
  run.stats.geminiInputTokens += generated.inputTokens;
  run.stats.geminiOutputTokens += generated.outputTokens;
  run.trace({ stage: `Gemini: write "${baked.name}"`, ms: generated.ms, tokens: { input: generated.inputTokens, output: generated.outputTokens } });
  return JSON.parse(generated.text).data;
}

/** Which component on the app's shelf this screen needs, if any. One Choice; its options are the cards Gemini wrote. */
async function fromShelf(run: Run, screen: string, plan: ScreenPlan, shelf: Baked[]): Promise<Baked | undefined> {
  // A component that draws the list's items needs a list to draw, and one that does not would ignore it.
  const candidates = shelf.filter((b) => b.contract.linked === plan.custom!.linked);
  if (!candidates.length) return undefined;
  const question = choice(
    { context: "A developer describes one screen of an app in `screen`. The screen needs something drawn specially for it.", question: "Which of these is the thing this screen needs?" },
    // Named by their place on the shelf: an id is a hash, and a hash is noise to whoever reads the options.
    { ...Object.fromEntries(candidates.map((b, i) => [`c${i + 1}`, `${b.name}. ${b.card}`])), none: "None of these: this screen needs something else." },
  );
  const asked = await run.askJev("Jev: reuse a custom component", { screen }, { component: question });
  const answer = asked.answers.component;
  const found = candidates.find((_, i) => `c${i + 1}` === answer.choice);
  run.trace({
    stage: asked.stage,
    ms: asked.ms,
    decisions: [{ id: "component", question: "already baked for this app?", answer: found?.name ?? "no, bake one", p: answer.probabilities[answer.choice] }],
    tokens: { input: asked.inputTokens, output: 0 },
  });
  return found;
}

export interface Filling {
  baked: Baked;
  data: unknown;
}

/**
 * The places a custom part can come from, each by the name a graph file calls it (grammar/kit.md, Sources). Each comes
 * back empty when it has nothing: no component on the shelf that Jev will take, no bake that passed its checks.
 */
export const CUSTOM_SOURCES = {
  /** Off the app's shelf, if Jev says one of them is the thing; then only its data is written. */
  async shelf(run: Run, screen: string, plan: ScreenPlan, setting: Setting, shelf: Baked[]): Promise<Filling | undefined> {
    const reused = shelf.length ? await fromShelf(run, screen, plan, shelf) : undefined;
    if (!reused) return undefined;
    const data = await writeData(run, screen, reused, setting).catch(() => undefined);
    if (data !== undefined) return { baked: reused, data };
    run.trace({ stage: `“${reused.name}” doesn't match its schema. Generating a new component.`, ms: 0 });
    return undefined;
  },
  baked: (run: Run, screen: string, plan: ScreenPlan, setting: Setting): Promise<Filling | undefined> => bakeNew(run, screen, plan, setting),
};

/** What reaches the screen: the component whole and its data, or, when nothing could be had, word that the slot is to close. */
export function sendCustom(run: Run, surfaceId: string, filling: Filling | undefined, path = "/custom") {
  // The slot closes up and the rest of the screen stands: every other block was valid before this one was tried.
  if (!filling) return void run.send({ updateDataModel: { surfaceId, path, value: { failed: true } } });
  // Whole, even when it came off the shelf: a screen's messages say everything about it, and the browser's shelf is read from them.
  run.send({ defineComponent: { surfaceId, ...filling.baked } });
  run.send({ updateDataModel: { surfaceId, path, value: { use: filling.baked.id, name: filling.baked.name, data: filling.data } } });
}

/**
 * Fills the custom slot of a screen whose tree has already been sent. `shelf` is what the app has baked so far, as
 * the browser tells it. `fresh` bakes a new component even if the shelf has one that fits: the developer asked for
 * this screen to be made again.
 */
export async function bakeCustom(run: Run, surfaceId: string, screen: string, plan: ScreenPlan, setting: Setting, shelf: Baked[], fresh = false): Promise<void> {
  // The order is the file's: `filled from shelf else baked else closed` under the custom part of grammar/screen.md.
  const { graph } = idiom();
  const filled = await fill<Filling | "closed">(
    graph.chainOf("custom"),
    { shelf: () => CUSTOM_SOURCES.shelf(run, screen, plan, setting, shelf), baked: () => CUSTOM_SOURCES.baked(run, screen, plan, setting), closed: async () => "closed" as const },
    graph.sources,
    { fresh },
  );
  sendCustom(run, surfaceId, !filled || filled.value === "closed" ? undefined : filled.value);
}
