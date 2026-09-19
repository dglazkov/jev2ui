// When the developer has no DESIGN.md, Jev mixes one from the brief.
//
// Jev cannot write "#6C3BF5", but a colour in OKLCH is three numbers and Jev
// can rate. A Score is an expected value over an ordered rubric, so it lands
// between the levels: "how vivid?" 2.7 of 4 is a chroma. Hue is a circle, and
// a rubric has two ends, so hue is a Choice among twelve named hues, read as
// the circular mean of the winning cluster of probabilities. Corner radius,
// spacing and type size are dials of the same kind.
//
// The result is written out as an ordinary DESIGN.md and takes the same path
// as a hand-written one. The developer can keep it.

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { askJev, ranked } from "./models.js";
import { contrast } from "./design-md.js";
import type { Decision } from "../shared/events.js";

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
const ask = (question: string) => ({ context: CONTEXT, question });

/** OKLCH hue angles, in order around the circle. */
const HUES: Record<string, { angle: number; criteria: string }> = {
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

const DIALS = {
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

const TYPE: Record<string, { criteria: string; headline: string; body: string; label: string; headlineWeight: number }> = {
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

const ELEVATION = {
  shadow: { criteria: "Soft drop shadows under cards: friendly, tactile, consumer.", prose: "Cards float: each casts a soft, wide drop shadow. There are no borders; the shadow does the work." },
  outline: { criteria: "Flat, with thin borders and hairlines: precise, printed, technical.", prose: "There are no shadows. Edges are drawn with 1px borders in the outline colour." },
  tonal: { criteria: "Flat, with layers told apart only by background color: quiet, minimal.", prose: "There are no shadows and no borders. Layers differ only by background colour." },
};

function questions(): Questions {
  const out: Questions = {
    hue: choice(ask("Which hue suits this product's accent color?"), Object.fromEntries(Object.entries(HUES).map(([k, v]) => [k, v.criteria]))),
    dark: noul(ask("Should this product's interface be dark, with light text on a dark background?"), {
      true: "It is used at night or in dim rooms, it is a media, gaming, developer or monitoring tool, or the brief asks for dark.",
      false: "An everyday app used in daylight: a light background.",
    }),
    type: choice(ask("Which typefaces suit this product?"), Object.fromEntries(Object.entries(TYPE).map(([k, v]) => [k, v.criteria]))),
    elevation: choice(ask("How should this product show that a card sits above the page?"), Object.fromEntries(Object.entries(ELEVATION).map(([k, v]) => [k, v.criteria]))),
    photos: noul(ask("Would photographs belong on this product's screens?"), {
      true: "The product is about things people want to see: places, food, people, products, animals.",
      false: "The product is about data, text, settings or tasks; photos would be decoration.",
    }),
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
  known: { elevation: "shadow" | "outline" | "tonal"; imagery: boolean; icons: boolean; contained: boolean };
  decisions: Decision[];
  ms: number;
  jevInputTokens: number;
}

const mixes = new Map<string, Promise<MixedDesign>>();

/** One Jev request per brief; the design panel and the mock pipeline share it. */
export function mixDesign(brief: string): Promise<MixedDesign> {
  let mixed = mixes.get(brief);
  if (!mixed) {
    mixed = mix(brief);
    mixes.set(brief, mixed);
    mixed.catch(() => mixes.delete(brief));
    if (mixes.size > 50) mixes.delete(mixes.keys().next().value!);
  }
  return mixed;
}

async function mix(brief: string): Promise<MixedDesign> {
  const asked = await askJev({ brief }, questions());
  const a = asked.answers;
  const decisions: Decision[] = [];
  const rate = (key: keyof typeof DIALS, label: string, show: (level: number) => string): number => {
    const level: number = a[key].score;
    decisions.push({ id: key, question: label, answer: `${level.toFixed(2)} of 4 → ${show(level)}`, p: level / 4 });
    return level;
  };
  const yes = (key: string, label: string) => {
    decisions.push({ id: key, question: label, answer: a[key].noul >= 0.5 ? "yes" : "no", p: a[key].noul });
    return a[key].noul >= 0.5;
  };
  const pick = (key: string, label: string) => {
    decisions.push({ id: key, question: label, answer: a[key].choice, p: a[key].probabilities[a[key].choice] });
    return a[key].choice as string;
  };

  const hue = readHue(a.hue);
  decisions.push({ id: "hue", question: "accent hue", answer: `${hue.name} → ${hue.angle.toFixed(0)}°`, p: hue.p });
  const dark = yes("dark", "dark interface?");
  const chroma = dial([0.04, 0.09, 0.15, 0.21, 0.3], rate("vivid", "accent vividness", (l) => `chroma ${dial([0.04, 0.09, 0.15, 0.21, 0.3], l).toFixed(3)}`));
  const lightStops = dark ? [0.6, 0.66, 0.73, 0.8, 0.87] : [0.36, 0.45, 0.55, 0.65, 0.76];
  const lightness = dial(lightStops, rate("light", "accent lightness", (l) => `L ${dial(lightStops, l).toFixed(2)}`));
  const warmth = rate("warmth", "warmth of neutrals", (l) => (Math.abs(l - 2) < 0.4 ? "pure greys" : l > 2 ? "toward cream" : "toward steel"));
  const radius = dial([0, 3, 8, 14, 22], rate("round", "roundness", (l) => `${dial([0, 3, 8, 14, 22], l).toFixed(0)}px`));
  const unit = dial([4, 6, 8, 10, 12], rate("air", "whitespace", (l) => `${dial([4, 6, 8, 10, 12], l).toFixed(0)}px unit`));
  const type = TYPE[pick("type", "typefaces")];
  const elevation = pick("elevation", "how depth is shown") as keyof typeof ELEVATION;
  const photos = yes("photos", "photographs?");
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
  const bodySize = dial([13, 14, 16, 16, 17], a.air.score);
  const pill = radius > 17;
  const yaml = [
    "---",
    "version: alpha",
    "name: Mixed by Jev",
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

  const level = (key: keyof typeof DIALS) => DIALS[key].levels[Math.round(a[key].score)].replace(/\.$/, "");
  const prose = `
## Overview

Mixed by Jev for this brief: "${brief}". Every value above is a rating turned into a number; edit any of them.

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

- ${photos ? "Do use photographs where the subject is something people want to see." : "Don't use photographs; they would be decoration here."}
- Do use icons to mark what a screen is about.
`;

  const known = { elevation, imagery: photos, icons: true, contained: cards };
  return { markdown: yaml.join("\n") + "\n" + prose, known, decisions, ms: Math.round(asked.ms), jevInputTokens: asked.inputTokens };
}
