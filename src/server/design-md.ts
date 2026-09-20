// Reading a DESIGN.md (github.com/google-labs-code/design.md): YAML tokens
// plus prose that says what the tokens are for.
//
// Tokens are parsed and resolved by the format's own linter. What the tokens
// cannot say is which colour plays which role: in one file `primary` is the
// accent, in another it is "press ink, used for all headlines and body text".
// That lives in the prose, so Jev reads it, as closed questions whose options
// are the file's own token names. Code keeps the last word: a component token
// or a conventional name (`on-surface`) settles a role without asking, and a
// pick that fails a contrast check is thrown out.

import { createHash } from "node:crypto";
import { lint } from "@google/design.md/linter";
import type { DesignSystemState, ResolvedColor } from "@google/design.md/linter";
import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import { askJev, endpoint, ranked } from "./models.js";
import type { Decision } from "../shared/events.js";
import type { DesignFinding } from "../shared/design.js";

export interface Design {
  id: string;
  name: string;
  markdown: string;
  system: DesignSystemState;
  findings: DesignFinding[];
  /** The Overview prose: brand and voice, handed to the writers. */
  voice: string;
}

export function parseDesign(markdown: string): Design {
  const report = lint(markdown);
  const overview = report.documentSections.find((s) => /^(overview|brand)/i.test(s.heading));
  return {
    id: createHash("sha256").update(markdown).digest("hex").slice(0, 16),
    name: report.designSystem.name ?? "Untitled",
    markdown,
    system: report.designSystem,
    findings: report.findings.map(({ severity, message, path }) => ({ severity, message, ...(path ? { path } : {}) })),
    voice: (overview?.content ?? "").replace(/^##.*\n/, "").trim().slice(0, 900),
  };
}

// --- Colour arithmetic -----------------------------------------------------

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
};
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
export const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `amount` of `a`, the rest `b`. */
export const mix = (a: string, b: string, amount: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount)) as Rgb);
};
const readable = (on: string) => (contrast("#000000", on) >= contrast("#ffffff", on) ? "#000000" : "#ffffff");

// --- What is read ------------------------------------------------------------

export const ROLES = ["page", "card", "text", "muted", "accent", "border"] as const;
export type Role = (typeof ROLES)[number];

/**
 * How pictures are shown. The four treatments of a photograph are paint: the same picture serves them all, so changing
 * one fetches nothing. `illustrated` is another medium: the pictures are drawn, and a screen made with photographs is stale.
 */
export const TREATMENTS = ["natural", "muted", "mono", "duotone", "illustrated"] as const;
export type Treatment = (typeof TREATMENTS)[number];

export interface DesignRead {
  colors: Record<Role | "onAccent", string>;
  elevation: "shadow" | "outline" | "tonal";
  treatment: Treatment;
  /** Structure follows the design too: a newspaper has no pictograms, an instrument panel has no photos. */
  imagery: boolean;
  icons: boolean;
  contained: boolean;
  decisions: Decision[];
  ms: number;
  jevInputTokens: number;
}

const CONTEXT =
  "design_system is a DESIGN.md file: design tokens in YAML, followed by prose that explains how they are used. Answer from what the file says.";
const ask = (question: string) => ({ context: CONTEXT, question });

const ROLE_QUESTIONS: Record<Role, { q: string; none?: string }> = {
  page: { q: "Which color token is the background of the whole page or screen?" },
  card: {
    q: "Which color token is the background of cards, panels or containers that sit on top of the page background?",
    none: "The file names no separate color for cards or panels.",
  },
  text: { q: "Which color token is used for body text?" },
  muted: {
    q: "Which color token is used for secondary text such as captions, helper text and metadata?",
    none: "The file names no color for secondary text.",
  },
  accent: { q: "Which color token is the background color of the primary button or main call to action?" },
  border: {
    q: "Which color token is used for borders, dividers and hairlines?",
    none: "The file names no color for borders or dividers.",
  },
};

const ELEVATION = {
  shadow: "Cards and raised elements cast drop shadows.",
  outline: "There are no shadows. Edges are drawn with borders, outlines, hairlines or rules.",
  tonal: "There are no shadows and no borders. Layers differ only by background color.",
};

const TREATMENT: Record<Treatment, string> = {
  natural: "In their natural colours, or the file does not say.",
  muted: "Softened: desaturated, faded or toned down, so that they sit quietly on the page.",
  mono: "In black and white, greyscale or monochrome.",
  duotone: "Tinted, duotone, or washed in one of the brand's colours.",
  illustrated: "The file asks for illustrations, drawings or artwork in place of photographs.",
};

function questions(colorNames: string[]): Questions {
  const out: Questions = {};
  for (const role of ROLES) {
    const { q, none } = ROLE_QUESTIONS[role];
    const options: Array<[string, string | null]> = colorNames.map((n) => [n, null]);
    if (none) options.push(["none", none]);
    out[`role_${role}`] = choice(ask(q), Object.fromEntries(options));
  }
  out.elevation = choice(ask("How does this design system show that one element sits above another?"), ELEVATION);
  out.imagery = noul(ask("Does this design system allow photographs on a screen?"), {
    true: "Photographs or illustrations are welcome, encouraged, or not mentioned at all.",
    false: "The file says not to use pictures of any kind.",
  });
  out.treatment = choice(ask("How does this design system want pictures to look?"), TREATMENT);
  out.icons = noul(ask("Does this design system allow icons on a screen?"), {
    true: "Icons are welcome, encouraged, or not mentioned at all.",
    false: "The file says not to use icons or pictograms.",
  });
  out.contained = noul(ask("Does this design system put list items and groups of content inside cards or panels?"), {
    true: "Content is grouped into cards, panels, tiles or containers.",
    false: "Content sits directly on the page, separated by whitespace, rules or dividers; the file says not to use cards.",
  });
  return out;
}

/** Roles a conventional token name settles without asking anyone. */
const CONVENTIONAL: Record<Role, string[]> = {
  page: ["background", "surface"],
  card: ["surface-container-lowest", "surface-container-low", "surface-container"],
  text: ["on-background", "on-surface"],
  muted: ["on-surface-variant"],
  accent: [],
  border: ["outline-variant", "outline", "border"],
};

/** A pick is only believed if the result would be legible. */
const GUARDS: Partial<Record<Role, (hex: string, sofar: Partial<Record<Role, string>>) => string | null>> = {
  text: (hex, { page }) => (contrast(hex, page!) >= 4.5 ? null : "too little contrast with the page"),
  muted: (hex, { page }) => (contrast(hex, page!) >= 3 ? null : "too little contrast with the page"),
  card: (hex, { text }) => (contrast(hex, text!) >= 4.5 ? null : "too little contrast with the text"),
  accent: (hex, { page }) => (contrast(hex, page!) >= 1.3 ? null : "indistinguishable from the page"),
};

const JEV_FLOOR = 0.35;

function componentColor(system: DesignSystemState, name: RegExp, property: string): { hex: string; from: string } | undefined {
  for (const [key, def] of system.components) {
    if (!name.test(key)) continue;
    const value = def.properties.get(property);
    if (value && typeof value === "object" && value.type === "color" && (value.a ?? 1) === 1) {
      return { hex: value.hex, from: `components.${key}` };
    }
  }
}

const COMPONENT_SOURCES: Partial<Record<Role, RegExp>> = {
  accent: /^button-primary$/,
  card: /^(card|panel)(-(?!.*(hover|active|pressed)).*)?$/,
};

export function resolveDesign(design: Design, answers: Record<string, any> | null): Omit<DesignRead, "ms" | "jevInputTokens"> {
  const { system } = design;
  const decisions: Decision[] = [];
  const colors: Partial<Record<Role | "onAccent", string>> = {};
  const hexOf = (name: string) => system.colors.get(name)?.hex;

  const fallbacks: Record<Role, () => string> = {
    page: () => hexOf("neutral") ?? "#ffffff",
    text: () => {
      const best = [...system.colors.values()].sort((a, b) => contrast(b.hex, colors.page!) - contrast(a.hex, colors.page!))[0];
      return best && contrast(best.hex, colors.page!) >= 7 ? best.hex : readable(colors.page!);
    },
    card: () => mix(luminance(colors.page!) > 0.5 ? "#ffffff" : colors.text!, colors.page!, luminance(colors.page!) > 0.5 ? 0.6 : 0.06),
    muted: () => mix(colors.text!, colors.page!, 0.62),
    accent: () => hexOf("primary") ?? colors.text!,
    border: () => mix(colors.text!, colors.page!, 0.16),
  };

  // Text is judged against the page and cards against the text, so order matters.
  for (const role of ["page", "text", "card", "muted", "accent", "border"] as const) {
    const label = `${role} colour`;
    const source = COMPONENT_SOURCES[role];
    const fromComponent = source && componentColor(system, source, "backgroundColor");
    if (fromComponent) {
      colors[role] = fromComponent.hex;
      decisions.push({ id: `role_${role}`, question: label, answer: fromComponent.hex, p: 1, note: `from ${fromComponent.from}` });
      continue;
    }
    // Material's "lowest" container is the brightest layer in a light theme and the darkest in a dark one.
    const names = role === "card" && luminance(colors.page!) < 0.2 ? ["surface-container", "surface-container-high"] : CONVENTIONAL[role];
    const conventional = names.find((name) => hexOf(name));
    if (conventional) {
      colors[role] = hexOf(conventional)!;
      decisions.push({ id: `role_${role}`, question: label, answer: `${conventional} ${colors[role]}`, p: 1, note: "settled by the token's name" });
      continue;
    }
    // Jev's ranking, walked until a pick survives its guard.
    let note: string | undefined;
    for (const [name, p] of answers ? ranked(answers[`role_${role}`]) : []) {
      if (p < JEV_FLOOR) break;
      if (name === "none") {
        note = "the prose names none; derived";
        break;
      }
      const problem = GUARDS[role]?.(hexOf(name)!, colors);
      if (problem) {
        note = `Jev read "${name}", but it has ${problem}`;
        continue;
      }
      colors[role] = hexOf(name)!;
      decisions.push({ id: `role_${role}`, question: label, answer: `${name} ${colors[role]}`, p, ...(note ? { note } : {}) });
      break;
    }
    if (!colors[role]) {
      colors[role] = fallbacks[role]();
      decisions.push({ id: `role_${role}`, question: label, answer: colors[role]!, p: 0, note: note ?? "the prose does not say; derived" });
    }
  }

  const onAccent = componentColor(system, /^button-primary$/, "textColor")?.hex;
  colors.onAccent = onAccent && contrast(onAccent, colors.accent!) >= 3 ? onAccent : readable(colors.accent!);

  const yes = (id: string, label: string, otherwise: boolean) => {
    if (!answers) return otherwise;
    const p: number = answers[id].noul;
    decisions.push({ id, question: label, answer: p >= 0.5 ? "yes" : "no", p });
    return p >= 0.5;
  };
  let elevation: DesignRead["elevation"] = "outline";
  if (answers) {
    elevation = answers.elevation.choice;
    decisions.push({ id: "elevation", question: "how depth is shown", answer: elevation, p: answers.elevation.probabilities[elevation] });
  }
  const imagery = yes("imagery", "photographs allowed?", true);
  // Natural colour is what a file that says nothing means, so any other treatment has to be read with confidence.
  let treatment: Treatment = "natural";
  if (answers && imagery) {
    const [top, p] = ranked(answers.treatment)[0] as [Treatment, number];
    treatment = p >= 0.5 ? top : "natural";
    decisions.push({ id: "treatment", question: "how pictures look", answer: treatment, p, ...(treatment !== top ? { note: `Jev leaned to "${top}", not firmly enough` } : {}) });
  }
  return {
    colors: colors as DesignRead["colors"],
    elevation,
    treatment,
    imagery,
    icons: yes("icons", "icons allowed?", true),
    contained: yes("contained", "content grouped in cards?", true),
    decisions,
  };
}

// A design is read once; every mock made with it reuses the reading.
const readings = new Map<string, Promise<DesignRead>>();

export function readDesign(design: Design): Promise<DesignRead> {
  const key = `${endpoint()}:${design.id}`;
  let reading = readings.get(key);
  if (!reading) {
    reading = (async () => {
      const names = [...design.system.colors.keys()];
      const asked = await askJev({ design_system: design.markdown }, questions(names));
      return { ...resolveDesign(design, asked.answers), ms: Math.round(asked.ms), jevInputTokens: asked.inputTokens };
    })();
    readings.set(key, reading);
    reading.catch(() => readings.delete(key));
    if (readings.size > 50) readings.delete(readings.keys().next().value!);
  }
  return reading;
}

/** The decisions that change the component tree rather than its paint. */
export const structureKey = (read: DesignRead) => `${read.imagery}|${read.icons}|${read.contained}|${read.treatment === "illustrated"}`;
