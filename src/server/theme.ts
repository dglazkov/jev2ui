// From a DESIGN.md to paint: the `--k-*` variables the kit's stylesheet reads
// (src/web/kit/kit.css). Tokens give the values; the reading (design-md.ts)
// says which colour goes where. The kit's text roles are the DESIGN.md
// typography scale, so a typography token carries over whole: family, size,
// weight, line height and letter spacing.

import type { DesignSystemState, ResolvedDimension, ResolvedTypography } from "@google/design.md/linter";
import { contrast, luminance, mix, type Design, type DesignRead } from "./design-md.js";
import { TEXT_ROLES } from "../shared/kit.js";
import type { Theme } from "../shared/design.js";

const ROOT_PX = 16;
const toPx = (d: ResolvedDimension | undefined): number | undefined =>
  d === undefined ? undefined : d.unit === "rem" || d.unit === "em" ? d.value * ROOT_PX : d.value;
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** First token whose name is in `names`, else the first whose name matches `pattern`. */
function find<T>(tokens: Map<string, T>, names: string[], pattern?: RegExp): T | undefined {
  for (const name of names) if (tokens.has(name)) return tokens.get(name);
  if (pattern) for (const [name, value] of tokens) if (pattern.test(name)) return value;
}

function component(system: DesignSystemState, pattern: RegExp) {
  for (const [name, def] of system.components) if (pattern.test(name)) return def.properties;
}

const dimension = (value: unknown): number | undefined =>
  value && typeof value === "object" && (value as any).type === "dimension" ? toPx(value as ResolvedDimension) : undefined;
const color = (value: unknown): string | undefined =>
  value && typeof value === "object" && (value as any).type === "color" && ((value as any).a ?? 1) === 1 ? (value as any).hex : undefined;

const GENERIC = /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|ui-[a-z-]+|inherit)$/i;
// The name goes into a style attribute; keep it to what a font name can contain.
const familyName = (family: string | undefined) => family?.split(",")[0].replace(/[^\w .-]/g, "").trim();
function fontStack(family: string | undefined): string | undefined {
  const name = familyName(family);
  if (!name) return undefined;
  if (GENERIC.test(name)) return name;
  const fallback = /mono|code/i.test(name) ? "ui-monospace, monospace" : /serif|playfair|garamond|georgia|times|slab/i.test(name) && !/sans/i.test(name) ? "Georgia, serif" : "system-ui, sans-serif";
  return `"${name}", ${fallback}`;
}

type Role = (typeof TEXT_ROLES)[number];

/** Which typography token plays each of the kit's text roles, by the names design systems actually use. */
const ROLE_TOKENS: Record<Role, { names: string[]; pattern?: RegExp }> = {
  display: { names: ["display", "headline-display", "display-lg", "headline-xl", "headline-lg", "h1"], pattern: /display|^h1$/i },
  headline: { names: ["headline-md", "headline-lg", "headline", "h2", "h1", "title-lg"], pattern: /headline|heading|^h\d$/i },
  title: { names: ["title-md", "title-lg", "title", "title-sm", "headline-sm", "h3", "h4"], pattern: /title|subhead/i },
  body: { names: ["body-md", "body", "body-lg", "body-sm"], pattern: /body|paragraph|text/i },
  label: { names: ["label-md", "label", "label-lg", "label-sm", "label-caps"], pattern: /label|button|overline/i },
  caption: { names: ["body-sm", "caption", "label-sm"], pattern: /caption|small|meta/i },
};

export function buildTheme(design: Design, read: DesignRead): Theme {
  const { system } = design;
  const c = read.colors;
  const dark = luminance(c.page) < 0.2;
  const vars: Record<string, string> = {};

  // --- Colour ---------------------------------------------------------------
  const hex = (name: string) => system.colors.get(name)?.hex;
  const secondary = component(system, /^button-secondary$/);
  const input = component(system, /^(input|text-?field)/);
  const accentSoft = mix(c.accent, c.page, dark ? 0.2 : 0.13);
  // Status colours must read on the page; a token that does not is nudged toward the text colour.
  const legible = (tone: string) => (contrast(tone, c.page) >= 3 ? tone : mix(tone, c.text, 0.6));
  Object.assign(vars, {
    "--k-page": c.page,
    "--k-card": c.card,
    "--k-text": c.text,
    "--k-muted": c.muted,
    "--k-accent": c.accent,
    "--k-on-accent": c.onAccent,
    // Accent as text must be legible too; an accent that is not (a pale button colour) falls back to the text colour.
    "--k-accent-soft": accentSoft,
    "--k-border": c.border,
    "--k-danger": legible(hex("error") ?? (dark ? "#ff6b6b" : "#c62828")),
    "--k-success": legible(hex("success") ?? (dark ? "#4cd08a" : "#1a7f4e")),
    "--k-warning": legible(hex("warning") ?? (dark ? "#f2b84b" : "#a15c00")),
    "--k-star": dark ? "#f2b84b" : "#e6a100",
    "--k-input": color(input?.get("backgroundColor")) ?? c.card,
    "--k-input-text": color(input?.get("textColor")) ?? c.text,
  });
  if (contrast(c.accent, c.page) < 3) {
    // The accent still fills buttons; where it would be text or an icon, the text colour stands in.
    vars["--k-accent-soft"] = mix(c.text, c.page, 0.1);
    vars["--k-accent-ink"] = c.text;
  }
  const secondaryBg = color(secondary?.get("backgroundColor"));
  if (secondaryBg) {
    vars["--k-button"] = secondaryBg;
    vars["--k-button-text"] = color(secondary?.get("textColor")) ?? c.text;
    if (contrast(secondaryBg, c.page) < 1.15) vars["--k-button-border"] = `1px solid ${c.border}`;
  }

  // --- Depth: the prose describes it; there is no token for it ---------------
  const tint = mix(c.accent, "#000000", 0.3);
  vars["--k-card-shadow"] = read.elevation !== "shadow" ? "none" : dark ? "0 8px 28px rgb(0 0 0 / 0.5)" : `0 1px 2px ${tint}14, 0 8px 28px ${tint}1f`;
  vars["--k-card-border"] = read.elevation === "outline" ? `1px solid ${c.border}` : "0";

  // --- Photographs: a treatment is a filter, and for a duotone the two inks as well ------
  if (read.treatment === "muted") vars["--k-image-filter"] = "saturate(0.55) contrast(0.92) brightness(1.04)";
  if (read.treatment === "mono") vars["--k-image-filter"] = "grayscale(1) contrast(1.08)";
  if (read.treatment === "duotone") {
    Object.assign(vars, {
      "--k-image-filter": "grayscale(1) contrast(1.15) brightness(1.08)",
      // The picture multiplies into the light ink, and the dark ink lifts whatever came out darker than it.
      "--k-image-blend": "multiply",
      // On a dark page a pale ground would glare, so there the accent itself is the light ink and the page tints the dark one.
      "--k-image-ground": mix(c.accent, "#ffffff", dark ? 0.85 : 0.2),
      "--k-image-wash": dark ? mix(c.accent, c.page, 0.14) : mix(c.accent, "#05050f", 0.42),
      "--k-image-wash-blend": "lighten",
    });
  }

  // --- Shape ----------------------------------------------------------------
  const radius = toPx(find(system.rounded, ["md", "DEFAULT", "sm"], /./)) ?? 8;
  const card = component(system, /^(card|panel)/);
  const button = component(system, /^button-primary$/);
  const chip = component(system, /^(chip|badge|tag)/);
  Object.assign(vars, {
    "--k-radius-sm": px(toPx(system.rounded.get("sm")) ?? radius / 2),
    "--k-radius-md": px(radius),
    "--k-radius-card": px(dimension(card?.get("rounded")) ?? toPx(find(system.rounded, ["lg", "xl"])) ?? radius),
    "--k-radius-button": px(dimension(button?.get("rounded")) ?? radius),
    "--k-radius-input": px(dimension(input?.get("rounded")) ?? radius),
    "--k-radius-chip": px(dimension(chip?.get("rounded")) ?? toPx(system.rounded.get("full")) ?? radius),
  });

  // --- Space ----------------------------------------------------------------
  const sm = toPx(find(system.spacing, ["sm", "base", "unit"])) ?? 8;
  const md = toPx(find(system.spacing, ["md", "gutter"])) ?? sm * 2;
  const lg = toPx(system.spacing.get("lg")) ?? md * 1.75;
  Object.assign(vars, {
    "--k-space-xs": px(toPx(system.spacing.get("xs")) ?? sm / 2),
    "--k-space-sm": px(sm),
    "--k-space-md": px(md),
    "--k-space-lg": px(Math.min(lg, 40)),
    "--k-space-xl": px(Math.min(toPx(system.spacing.get("xl")) ?? lg * 1.5, 64)),
    "--k-margin": px(Math.min(Math.max(toPx(system.spacing.get("margin")) ?? md, 14), 28)),
    "--k-card-pad": px(Math.min(dimension(card?.get("padding")) ?? md, 28)),
  });
  const buttonPad = dimension(button?.get("padding"));
  if (buttonPad !== undefined) vars["--k-button-pad"] = `${px(Math.min(buttonPad, 18) * 0.75)} ${px(Math.min(buttonPad, 18) * 1.5)}`;
  const inputPad = dimension(input?.get("padding"));
  if (inputPad !== undefined) vars["--k-input-pad"] = `${px(Math.min(inputPad, 16))} ${px(Math.min(inputPad, 16) * 1.3)}`;

  // --- Type: each role is a typography token, whole -------------------------
  const tokens = Object.fromEntries(TEXT_ROLES.map((role) => [role, find(system.typography, ROLE_TOKENS[role].names, ROLE_TOKENS[role].pattern)])) as Record<Role, ResolvedTypography | undefined>;
  const bodyPx = toPx(tokens.body?.fontSize) ?? 16;
  const headlinePx = toPx(tokens.headline?.fontSize) ?? bodyPx * 1.5;
  // A phone screen cannot carry a 48px headline; roles are capped at what a mock can show.
  const caps: Record<Role, number> = { display: 40, headline: 30, title: 20, body: 18, label: 14, caption: 14 };
  const defaults: Record<Role, { size: number; weight: number; line: number; like: Role }> = {
    display: { size: headlinePx * 1.3, weight: 700, line: 1.1, like: "headline" },
    headline: { size: headlinePx, weight: 700, line: 1.2, like: "body" },
    // A design with no title level gets one in the headline's face, a notch above body.
    title: { size: bodyPx * 1.06, weight: 600, line: 1.3, like: "headline" },
    body: { size: bodyPx, weight: 400, line: 1.5, like: "body" },
    label: { size: bodyPx * 0.78, weight: 600, line: 1.3, like: "body" },
    caption: { size: bodyPx * 0.84, weight: 400, line: 1.4, like: "body" },
  };
  for (const role of TEXT_ROLES) {
    const token = tokens[role];
    const fallback = defaults[role];
    const size = Math.min(toPx(token?.fontSize) ?? fallback.size, caps[role]);
    const line = token?.lineHeight ? (token.lineHeight.unit ? toPx(token.lineHeight)! / (toPx(token.fontSize) ?? size) : token.lineHeight.value) : fallback.line;
    vars[`--k-${role}-font`] = fontStack(token?.fontFamily ?? tokens[fallback.like]?.fontFamily ?? tokens.body?.fontFamily) ?? "inherit";
    vars[`--k-${role}-size`] = px(size);
    vars[`--k-${role}-weight`] = String(token?.fontWeight ?? (role === "title" ? Math.min(tokens.headline?.fontWeight ?? 600, 700) : fallback.weight));
    vars[`--k-${role}-line`] = String(Math.round(line * 100) / 100);
    if (token?.letterSpacing) vars[`--k-${role}-track`] = `${token.letterSpacing.value}${token.letterSpacing.unit}`;
  }
  // Wide tracking on a small label is how a DESIGN.md spells "small caps"; the prose usually says so outright.
  const track = tokens.label?.letterSpacing;
  if (track && track.unit === "em" && track.value >= 0.06) vars["--k-label-case"] = "uppercase";

  const families = TEXT_ROLES.map((role) => familyName(tokens[role]?.fontFamily));
  return {
    vars,
    fontFamily: fontStack(tokens.body?.fontFamily) ?? "system-ui, sans-serif",
    fonts: [...new Set(families.filter((f): f is string => !!f && !GENERIC.test(f)))],
    colorScheme: dark ? "dark" : "light",
  };
}
