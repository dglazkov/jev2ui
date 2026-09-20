// When the developer has no DESIGN.md, Jev mixes one from the brief.
//
// Jev cannot write "#6C3BF5", but a colour in OKLCH is three numbers and Jev
// can rate. A Score is an expected value over an ordered rubric, so it lands
// between the levels: "how vivid?" 2.7 of 4 is a chroma. Hue is a circle, and
// a rubric has two ends, so hue is a Choice among twelve named hues, read as
// the circular mean of the winning cluster of probabilities. Corner radius,
// spacing and type size are dials of the same kind.
//
// A remix is a draw from the same answers. Jev returns a distribution with every
// answer, so instead of the expected score and the likeliest choice, a remix
// samples them: every remix is a design Jev finds plausible for the brief, and
// none costs another request.
//
// The result is written out as an ordinary DESIGN.md and takes the same path
// as a hand-written one. The developer can keep it.

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { askJev, endpoint, ranked } from "./models.js";
import { contrast, type Treatment } from "./design-md.js";
import { named, type Decision } from "../shared/events.js";
import type { PaintChange, Pins } from "../shared/turn.js";

// --- OKLCH -------------------------------------------------------------------

function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** Hex for an OKLCH colour. Chroma is reduced until the colour fits in sRGB, which keeps hue and lightness honest. */
export function oklch(l: number, c: number, h: number): string {
  let linear = oklchToLinear(l, c, h);
  while (c > 0 && linear.some((v) => v < -0.0005 || v > 1.0005)) linear = oklchToLinear(l, (c -= 0.004), h);
  const encode = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  };
  return `#${linear.map((v) => encode(v).toString(16).padStart(2, "0")).join("")}`;
}

// --- The dials -----------------------------------------------------------------

const CONTEXT =
  "brief describes an app, or one screen of an app. A visual style is being chosen that suits the product and the people who use it. If the brief asks for a style or color outright, follow it.";
type Ask = (question: string) => { context: string; question: string };
const defaultAsk: Ask = (question) => ({ context: CONTEXT, question });

/** OKLCH hue angles, in order around the circle. */
export const HUES: Record<string, { angle: number; criteria: string }> = {
  red: { angle: 27, criteria: "Red: urgency, appetite, passion, alerts, sales." },
  orange: { angle: 55, criteria: "Orange: energy, warmth, play, pets, construction." },
  amber: { angle: 78, criteria: "Amber and gold: honey, craft, premium warmth, beer, bakeries." },
  yellow: { angle: 100, criteria: "Yellow: sunshine, optimism, caution, taxis." },
  lime: { angle: 125, criteria: "Lime: zest, freshness, youth, sport." },
  green: { angle: 148, criteria: "Green: nature, health, money, growth, gardening." },
  teal: { angle: 185, criteria: "Teal: calm, clinical, wellness, balance." },
  cyan: { angle: 215, criteria: "Cyan: water, sky, clarity, swimming, cloud technology." },
  blue: { angle: 255, criteria: "Blue: trust, finance, productivity, corporate, communication." },
  indigo: { angle: 277, criteria: "Indigo: night, depth, focus, premium technology." },
  violet: { angle: 303, criteria: "Violet and purple: creativity, magic, music, luxury." },
  pink: { angle: 350, criteria: "Pink and magenta: fun, beauty, romance, sweets." },
};

export const DIALS = {
  vivid: {
    q: "How vivid should this product's accent color be?",
    levels: [
      "Almost grey: dusty, muted, restrained.",
      "Soft and subdued.",
      "Clear and confident, like a typical brand color.",
      "Bright and saturated.",
      "Neon: as vivid as a screen can show.",
    ],
  },
  light: {
    q: "How light or dark should this product's accent color be?",
    levels: ["Very deep, like navy, oxblood or forest.", "Deep.", "A mid-tone.", "Light.", "A pale pastel."],
  },
  warmth: {
    q: "Should this product's backgrounds and greys lean cold or warm?",
    levels: [
      "Cold: blue-tinted steel greys.",
      "Slightly cool.",
      "Neutral: pure white and pure greys.",
      "Slightly warm.",
      "Warm: cream, sand and paper tones.",
    ],
  },
  round: {
    q: "How rounded should the corners of buttons, cards and inputs be?",
    levels: [
      "Square: sharp, engineered, printed.",
      "Barely softened.",
      "Moderately rounded.",
      "Very rounded and friendly.",
      "Pills and circles everywhere: bubbly, toy-like.",
    ],
  },
  air: {
    q: "How much whitespace should this product's screens have?",
    levels: [
      "Packed: as much data per screen as possible, like a trading terminal.",
      "Compact.",
      "Regular.",
      "Roomy.",
      "Airy: one idea at a time with lots of space, like a luxury or wellness brand.",
    ],
  },
} as const;

export const TYPE: Record<string, { criteria: string; headline: string; body: string; label: string; headlineWeight: number }> = {
  neutral: { criteria: "A neutral sans-serif: utilitarian product UI that stays out of the way.", headline: "Inter", body: "Inter", label: "Inter", headlineWeight: 700 },
  geometric: { criteria: "A geometric grotesk: modern, technical, startup.", headline: "Space Grotesk", body: "Inter", label: "Space Grotesk", headlineWeight: 600 },
  humanist: { criteria: "A warm humanist sans-serif: approachable everyday consumer apps.", headline: "Plus Jakarta Sans", body: "Plus Jakarta Sans", label: "Plus Jakarta Sans", headlineWeight: 700 },
  rounded: { criteria: "Round, chunky letters: playful, casual, for children or treats.", headline: "Fredoka", body: "Nunito", label: "Nunito", headlineWeight: 600 },
  editorial: { criteria: "A high-contrast serif with a reading serif: news, literature, long-form.", headline: "Playfair Display", body: "Source Serif 4", label: "IBM Plex Mono", headlineWeight: 700 },
  elegant: { criteria: "A fine, light display serif: luxury, fashion, hospitality, weddings.", headline: "Cormorant Garamond", body: "Jost", label: "Jost", headlineWeight: 600 },
  mono: { criteria: "Monospaced headings and labels: developer tools, terminals, instruments, data.", headline: "JetBrains Mono", body: "Inter", label: "JetBrains Mono", headlineWeight: 600 },
  slab: { criteria: "A sturdy slab serif: outdoors, tools, industry, heritage.", headline: "Roboto Slab", body: "Roboto", label: "Roboto", headlineWeight: 700 },
  condensed: { criteria: "Tall condensed capitals: sport, fitness, events, bold and loud.", headline: "Oswald", body: "Barlow", label: "Barlow", headlineWeight: 600 },
};

export const ELEVATION = {
  shadow: { criteria: "Soft drop shadows under cards: friendly, tactile, consumer.", prose: "Cards float: each casts a soft, wide drop shadow. There are no borders; the shadow does the work." },
  outline: { criteria: "Flat, with thin borders and hairlines: precise, printed, technical.", prose: "There are no shadows. Edges are drawn with 1px borders in the outline colour." },
  tonal: { criteria: "Flat, with layers told apart only by background color: quiet, minimal.", prose: "There are no shadows and no borders. Layers differ only by background colour." },
};

/** Asked about the product and not about photography: what the pictures are for decides how far a brand may bend them. */
export const PHOTO_LOOK: Record<Treatment, { criteria: string; prose: string }> = {
  natural: {
    criteria: "True colour: the pictures are what people choose by. Food, places to stay, products, homes, animals, anything bought by its look.",
    prose: "Show photographs in their natural colours; people choose by them.",
  },
  muted: {
    criteria: "Softened and a little faded: a calm, minimal or premium product whose pictures should sit quietly. Wellness, journaling, interiors, reading, finance.",
    prose: "Show photographs softened: desaturated a little, so that they sit quietly on the page.",
  },
  mono: {
    criteria: "Black and white: news, literature, archives, heritage, serious editorial.",
    prose: "Show photographs in black and white.",
  },
  duotone: {
    criteria: "Washed in the brand's colour: the pictures are atmosphere and not merchandise. Music, events, sport, nightlife, technology, communities.",
    prose: "Show photographs as duotones, washed in the primary colour.",
  },
  illustrated: {
    criteria: "Drawn and not photographed: the product is for children, or what it shows is imagined and no camera could capture it. Stories, characters, fairy tales, games, fantasy, dreams, lessons for the young.",
    prose: "Use illustrations, never photographs: warm and hand-drawn, as in a picture book.",
  },
};

/** The questions of a mix; `only` names the ones wanted, and `ask` sets them in another context (change.ts asks some of them again). */
export function mixQuestions(only?: string[], ask: Ask = defaultAsk): Questions {
  const all = questions(ask);
  return only ? Object.fromEntries(Object.entries(all).filter(([key]) => only.includes(key))) : all;
}

function questions(ask: Ask): Questions {
  const out: Questions = {
    hue: choice(ask("Which hue suits this product's accent color?"), Object.fromEntries(Object.entries(HUES).map(([k, v]) => [k, v.criteria]))),
    dark: noul(ask("Should this product's interface be dark, with light text on a dark background?"), {
      true: "It is used at night or in dim rooms, it is a media, gaming, developer or monitoring tool, or the brief asks for dark.",
      false: "An everyday app used in daylight: a light background.",
    }),
    type: choice(ask("Which typefaces suit this product?"), Object.fromEntries(Object.entries(TYPE).map(([k, v]) => [k, v.criteria]))),
    elevation: choice(ask("How should this product show that a card sits above the page?"), Object.fromEntries(Object.entries(ELEVATION).map(([k, v]) => [k, v.criteria]))),
    photos: noul(ask("Would pictures, photographed or drawn, belong anywhere in this product? A brief about its settings, login or checkout identifies an entry screen, not an app-wide ban on imagery. Respect an explicit request for no imagery."), {
      true: "The product has visual content or subjects: media artwork, places, food, products, animals, activities, events, people who are chosen or followed, stories, characters or games, even if its starting screen needs no pictures.",
      false: "The product as a whole is only figures, code, documents, system administration or infrastructure with nothing visual to show, or the brief explicitly rules out imagery throughout the app.",
    }),
    photo_look: choice(ask("If this product's screens show pictures, how should they look?"), Object.fromEntries(Object.entries(PHOTO_LOOK).map(([k, v]) => [k, v.criteria]))),
    cards: noul(ask("Should this product group content into cards?"), {
      true: "Yes: separate objects, each in its own container.",
      false: "No: content flows on the page like a document, separated by whitespace and rules.",
    }),
  };
  for (const [key, { q, levels }] of Object.entries(DIALS)) out[key] = score(ask(q), levels as unknown as [string, string, ...string[]]);
  return out;
}

/** Circular mean of the winning hue and its neighbours on the wheel, weighted by probability. */
function readHue(answer: any): { angle: number; name: string; p: number } {
  const names = Object.keys(HUES);
  const [top, p] = ranked(answer)[0];
  const i = names.indexOf(top);
  let x = 0;
  let y = 0;
  for (const name of [names.at(i - 1)!, top, names[(i + 1) % names.length]]) {
    const weight: number = answer.probabilities[name];
    x += weight * Math.cos((HUES[name].angle * Math.PI) / 180);
    y += weight * Math.sin((HUES[name].angle * Math.PI) / 180);
  }
  return { angle: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, name: top, p };
}

/** Piecewise-linear reading of a dial: `stops[i]` is the value at rubric level i. */
const dial = (stops: number[], level: number) => {
  const i = Math.min(stops.length - 2, Math.max(0, Math.floor(level)));
  return stops[i] + (stops[i + 1] - stops[i]) * Math.min(1, Math.max(0, level - i));
};

export interface MixedDesign {
  markdown: string;
  /** What the prose of the mixed file says, known without reading it back. */
  known: { elevation: "shadow" | "outline" | "tonal"; treatment: Treatment; imagery: boolean; icons: boolean; contained: boolean };
  decisions: Decision[];
  /** Where every choice stands, by the names `Pins` uses. */
  chosen: Required<Pins>;
  /** How it looks, in a sentence: what Jev is told when it reads a request to change it. */
  summary: string;
  ms: number;
  jevInputTokens: number;
}

const asked = new Map<string, ReturnType<typeof askJev>>();

/** One Jev request per brief and endpoint, however many times it is remixed; the design panel and the mock pipeline share it. */
export async function mixDesign(brief: string, seed = 0, change: PaintChange = {}): Promise<MixedDesign> {
  const key = `${endpoint()}:${brief}`;
  let answers = asked.get(key);
  if (!answers) {
    answers = askJev({ brief }, questions(defaultAsk));
    asked.set(key, answers);
    answers.catch(() => asked.delete(key));
    if (asked.size > 50) asked.delete(asked.keys().next().value!);
  }
  return build(brief, await answers, seed, change);
}

/** Small seeded generator (mulberry32), so a remix can be named by its seed and made again. */
function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A draw from a distribution, flattened a little so that a confident Jev still leaves room to explore. */
function draw(probabilities: Record<string, number>, rng: () => number, temperature = 1.7): string {
  const weighted = Object.entries(probabilities).map(([key, p]) => [key, Math.max(p, 1e-4) ** (1 / temperature)] as const);
  let at = rng() * weighted.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of weighted) if ((at -= w) <= 0) return key;
  return weighted.at(-1)![0];
}

function build(brief: string, asked: Awaited<ReturnType<typeof askJev>>, seed: number, change: PaintChange): MixedDesign {
  const rng = seed ? random(seed) : null;
  const a = asked.answers;
  const pins = change.pins ?? {};
  const theirs = { note: "asked for" };
  const decisions: Decision[] = [];
  const levels = {} as Record<keyof typeof DIALS, number>;
  const rate = (key: keyof typeof DIALS, label: string, show: (level: number) => string): number => {
    // The expected score; or, for a remix, a level drawn from the distribution and nudged off the rubric's grid.
    const jevs: number = rng ? Math.min(4, Math.max(0, Number(draw(a[key].probabilities, rng)) + (rng() - 0.5) * 0.9)) : a[key].score;
    const moved = change.dials?.[key] ?? 0;
    const level = Math.min(4, Math.max(0, jevs + moved));
    levels[key] = level;
    const note = [rng ? `drawn; Jev's expectation is ${a[key].score.toFixed(2)}` : "", moved ? `moved ${moved > 0 ? "+" : ""}${moved.toFixed(2)} on request, from ${jevs.toFixed(2)}` : ""].filter(Boolean).join("; ");
    decisions.push({ id: key, question: label, answer: `${level.toFixed(2)} of 4 → ${show(level)}`, p: level / 4, ...(note ? { note } : {}) });
    return level;
  };
  const yes = (key: "photos" | "cards", label: string) => {
    const pinned = pins[key];
    const answer = pinned ?? a[key].noul >= 0.5;
    decisions.push({ id: key, question: label, answer: answer ? "yes" : "no", p: pinned === undefined ? a[key].noul : 1, ...(pinned === undefined ? {} : theirs) });
    return answer;
  };
  const pick = (key: "type" | "elevation", label: string) => {
    const pinned = pins[key];
    if (pinned !== undefined && pinned in a[key].probabilities) return decisions.push({ id: key, question: label, answer: pinned, p: 1, ...theirs }), pinned;
    const chosen = rng ? draw(a[key].probabilities, rng) : (a[key].choice as string);
    decisions.push({ id: key, question: label, answer: chosen, p: a[key].probabilities[chosen], ...(rng && chosen !== a[key].choice ? { note: `drawn; Jev's first choice is ${a[key].choice}` } : {}) });
    return chosen;
  };

  // Hue is where a remix shows most, so it is drawn flattest of all, then moved a little around the wheel.
  const drawn = rng ? draw(a.hue.probabilities, rng, 2.6) : null;
  const hue = pins.hue && HUES[pins.hue] ? { name: pins.hue, angle: HUES[pins.hue].angle, p: 1 } : drawn ? { name: drawn, angle: (HUES[drawn].angle + (rng!() - 0.5) * 24 + 360) % 360, p: a.hue.probabilities[drawn] as number } : readHue(a.hue);
  decisions.push({ id: "hue", question: "accent hue", answer: `${hue.name} → ${hue.angle.toFixed(0)}°`, p: hue.p, ...(pins.hue === hue.name ? theirs : drawn && drawn !== a.hue.choice ? { note: `drawn; Jev's first choice is ${a.hue.choice}` } : {}) });
  // Light or dark is a coin weighted by Jev's answer; what the screens contain is not remixed, only how they look.
  const dark = pins.dark ?? (rng ? rng() < a.dark.noul : a.dark.noul >= 0.5);
  decisions.push({ id: "dark", question: "dark interface?", answer: dark ? "yes" : "no", p: pins.dark === undefined ? a.dark.noul : 1, ...(pins.dark !== undefined ? theirs : rng && dark !== a.dark.noul >= 0.5 ? { note: "drawn against the odds" } : {}) });
  const chroma = dial([0.04, 0.09, 0.15, 0.21, 0.3], rate("vivid", "accent vividness", (l) => `chroma ${dial([0.04, 0.09, 0.15, 0.21, 0.3], l).toFixed(3)}`));
  const lightStops = dark ? [0.6, 0.66, 0.73, 0.8, 0.87] : [0.36, 0.45, 0.55, 0.65, 0.76];
  const lightness = dial(lightStops, rate("light", "accent lightness", (l) => `L ${dial(lightStops, l).toFixed(2)}`));
  const warmth = rate("warmth", "warmth of neutrals", (l) => (Math.abs(l - 2) < 0.4 ? "pure grays" : l > 2 ? "toward cream" : "toward steel"));
  const radius = dial([0, 3, 8, 14, 22], rate("round", "roundness", (l) => `${dial([0, 3, 8, 14, 22], l).toFixed(0)}px`));
  const unit = dial([4, 6, 8, 10, 12], rate("air", "whitespace", (l) => `${dial([4, 6, 8, 10, 12], l).toFixed(0)}px unit`));
  const typeName = pick("type", "typefaces");
  const type = TYPE[typeName];
  const elevation = pick("elevation", "how depth is shown") as keyof typeof ELEVATION;
  const photos = yes("photos", "pictures?");
  // Drawn or photographed is what the screens contain, and that is not remixed; among photographs, the treatment is paint and is.
  let treatment: Treatment = "natural";
  if (photos && pins.photo_look && pins.photo_look in PHOTO_LOOK) {
    treatment = pins.photo_look as Treatment;
    decisions.push({ id: "photo_look", question: "how pictures look", answer: treatment, p: 1, ...theirs });
  } else if (photos && (a.photo_look.choice === "illustrated" || !rng)) {
    treatment = a.photo_look.choice;
    decisions.push({ id: "photo_look", question: "how pictures look", answer: treatment, p: a.photo_look.probabilities[treatment] });
  } else if (photos) {
    const { illustrated, ...treatments } = a.photo_look.probabilities as Record<Treatment, number>;
    treatment = draw(treatments, rng!) as Treatment;
    decisions.push({ id: "photo_look", question: "how pictures look", answer: treatment, p: treatments[treatment as keyof typeof treatments], ...(treatment !== a.photo_look.choice ? { note: `drawn; Jev's first choice is ${a.photo_look.choice}` } : {}) });
  }
  const cards = yes("cards", "content in cards?");

  // Neutrals carry a trace of cream or steel, in proportion to how far the warmth dial is from the middle.
  const neutralHue = warmth >= 2 ? 80 : 255;
  const tint = Math.abs(warmth - 2) / 2;
  const grey = (l: number, c: number) => oklch(l, c * tint, neutralHue);
  const primary = oklch(lightness, chroma, hue.angle);
  const ink = grey(0.22, 0.025);
  const paper = grey(0.985, 0.012);
  const colors = dark
    ? {
        primary,
        "on-primary": contrast(grey(0.16, 0.02), primary) >= 4.5 ? grey(0.16, 0.02) : "#ffffff",
        secondary: oklch(lightness, chroma * 0.6, (hue.angle + 40) % 360),
        surface: grey(0.17, 0.02),
        "surface-container": grey(0.22, 0.022),
        "on-surface": grey(0.93, 0.012),
        "on-surface-variant": grey(0.7, 0.02),
        "outline-variant": grey(0.32, 0.022),
        error: oklch(0.7, 0.19, 25),
      }
    : {
        primary,
        "on-primary": contrast("#ffffff", primary) >= 4.5 ? "#ffffff" : ink,
        secondary: oklch(lightness, chroma * 0.6, (hue.angle + 40) % 360),
        surface: grey(0.975 - 0.012 * tint, 0.016),
        "surface-container": tint > 0.2 ? paper : "#ffffff",
        "on-surface": ink,
        "on-surface-variant": grey(0.5, 0.025),
        "outline-variant": grey(0.89, 0.018),
        error: oklch(0.55, 0.21, 27),
      };

  const px = (v: number) => `${Math.round(v)}px`;
  const bodySize = dial([13, 14, 16, 16, 17], levels.air);
  const pill = radius > 17;
  const yaml = [
    "---",
    "version: alpha",
    `name: ${named(asked.endpoint)} design${seed ? ` (remix ${seed % 1000})` : ""}`,
    `description: ${JSON.stringify(brief.slice(0, 140))}`,
    "colors:",
    ...Object.entries(colors).map(([k, v]) => `  ${k}: "${v}"`),
    "typography:",
    ...[
      ["headline-lg", type.headline, bodySize * 1.9, type.headlineWeight, 1.15],
      ["headline-md", type.headline, bodySize * 1.5, type.headlineWeight, 1.2],
      ["body-md", type.body, bodySize, 400, 1.5],
      ["label-md", type.label, bodySize * 0.82, 600, 1.2],
    ].flatMap(([name, family, size, weight, line]) => [
      `  ${name}:`,
      `    fontFamily: ${family}`,
      `    fontSize: ${px(size as number)}`,
      `    fontWeight: ${weight}`,
      `    lineHeight: ${line}`,
    ]),
    "rounded:",
    `  sm: ${px(radius / 2)}`,
    `  md: ${px(radius)}`,
    `  lg: ${px(radius * 1.5)}`,
    "  full: 9999px",
    "spacing:",
    `  xs: ${px(unit / 2)}`,
    `  sm: ${px(unit)}`,
    `  md: ${px(unit * 2)}`,
    `  lg: ${px(unit * 3.5)}`,
    `  xl: ${px(unit * 6)}`,
    "components:",
    "  button-primary:",
    '    backgroundColor: "{colors.primary}"',
    '    textColor: "{colors.on-primary}"',
    '    typography: "{typography.label-md}"',
    `    rounded: "{rounded.${pill ? "full" : "md"}}"`,
    `    padding: ${px(unit * 1.5)}`,
    "  card:",
    '    backgroundColor: "{colors.surface-container}"',
    '    rounded: "{rounded.lg}"',
    '    padding: "{spacing.md}"',
    "  input-field:",
    `    backgroundColor: "{colors.${dark ? "surface" : "surface-container"}}"`,
    '    textColor: "{colors.on-surface}"',
    '    rounded: "{rounded.md}"',
    `    padding: ${px(unit * 1.25)}`,
    "---",
  ];

  const level = (key: keyof typeof DIALS) => DIALS[key].levels[Math.round(levels[key])].replace(/\.$/, "");
  const prose = `
## Overview

Generated by ${named(asked.endpoint)} for this description: "${brief}". Every value above is a rating turned into a number; edit any of them.

- Accent: ${hue.name}. ${level("vivid")}. ${level("light")}.
- Neutrals: ${level("warmth")}.
- Corners: ${level("round")}.
- Whitespace: ${level("air")}.

## Colors

- **Primary (${colors.primary}):** The accent. Primary buttons, links and selected states.
- **Surface (${colors.surface}):** The background of every screen.
- **Surface container (${colors["surface-container"]}):** Cards and panels.
- **On surface (${colors["on-surface"]}):** Text.
- **On surface variant (${colors["on-surface-variant"]}):** Captions and metadata.
- **Outline variant (${colors["outline-variant"]}):** Borders and dividers.

## Typography

${type.headline} for headlines${type.body === type.headline ? " and body text" : `, ${type.body} for body text`}. ${type.criteria}

## Layout

${cards ? "Content is grouped into cards, each one a separate object." : "Content sits directly on the page like a document, separated by whitespace and hairline rules. Do not use cards."}

## Elevation & Depth

${ELEVATION[elevation].prose}

## Shapes

${level("round")}. The base radius is ${px(radius)}${pill ? "; buttons are full pills" : ""}.

## Do's and Don'ts

- ${photos ? `Do use pictures where the subject is something people want to see. ${PHOTO_LOOK[treatment].prose}` : "Don't use photographs or illustrations; they would be decoration here."}
- Do use icons to mark what a screen is about.
`;

  const known = { elevation, treatment, imagery: photos, icons: true, contained: cards };
  const chosen = { hue: hue.name, dark, type: typeName, elevation, photos, photo_look: treatment, cards };
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  const summary = [
    `A ${dark ? "dark" : "light"} interface with ${/^[aeiou]/.test(hue.name) ? "an" : "a"} ${hue.name} accent (${lower(level("vivid"))}; ${lower(level("light"))})`,
    `neutrals: ${lower(level("warmth"))}`,
    `typefaces: ${lower(type.criteria.replace(/\.$/, ""))}`,
    `corners: ${lower(level("round"))}`,
    `whitespace: ${lower(level("air"))}`,
    lower(ELEVATION[elevation].criteria.replace(/\.$/, "")),
    cards ? "content in cards" : "no cards",
    photos ? `pictures: ${treatment}` : "no pictures",
  ].join("; ") + ".";
  return { markdown: yaml.join("\n") + "\n" + prose, known, decisions, chosen, summary, ms: Math.round(asked.ms), jevInputTokens: asked.inputTokens };
}
