// From a DESIGN.md to paint. The A2UI renderer keeps its components in shadow
// roots and exposes `--a2ui-*` custom properties, so a theme is a set of those.
// Tokens give the values; the reading (design-md.ts) says which token goes where.

import type { DesignSystemState, ResolvedDimension, ResolvedTypography } from "@google/design.md/linter";
import { luminance, mix, type Design, type DesignRead } from "./design-md.js";
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
function fontStack(family: string | undefined): string | undefined {
  // The name goes into a style attribute; keep it to what a font name can contain.
  const name = family?.split(",")[0].replace(/[^\w .-]/g, "").trim();
  if (!name) return undefined;
  if (GENERIC.test(name)) return name;
  const fallback = /mono|code/i.test(name) ? "ui-monospace, monospace" : /serif|playfair|garamond|georgia|times|slab/i.test(name) && !/sans/i.test(name) ? "Georgia, serif" : "system-ui, sans-serif";
  return `"${name}", ${fallback}`;
}

export function buildTheme(design: Design, read: DesignRead): Theme {
  const { system } = design;
  const c = read.colors;
  const dark = luminance(c.page) < 0.2;
  const vars: Record<string, string> = {};

  // --- Colour ---------------------------------------------------------------
  const secondaryButton = component(system, /^button-secondary$/);
  const input = component(system, /^(input|text-?field)/);
  const buttonBackground = color(secondaryButton?.get("backgroundColor")) ?? c.card;
  Object.assign(vars, {
    "--a2ui-color-background": c.page,
    "--a2ui-color-on-background": c.text,
    "--a2ui-text-color-text": c.text,
    "--a2ui-color-surface": c.card,
    "--a2ui-color-on-surface": c.text,
    "--a2ui-text-caption-color": c.muted,
    "--a2ui-color-primary": c.accent,
    "--a2ui-color-on-primary": c.onAccent,
    "--a2ui-color-primary-hover": color(component(system, /^button-primary-hover$/)?.get("backgroundColor")) ?? mix(c.accent, c.text, 0.88),
    "--a2ui-button-background": buttonBackground,
    "--a2ui-color-on-secondary": color(secondaryButton?.get("textColor")) ?? c.text,
    "--a2ui-color-secondary": buttonBackground,
    "--a2ui-color-secondary-hover": color(component(system, /^button-secondary-hover$/)?.get("backgroundColor")) ?? mix(buttonBackground, c.text, 0.92),
    "--a2ui-color-border": c.border,
    "--a2ui-border": `1px solid ${c.border}`,
    "--a2ui-color-input": color(input?.get("backgroundColor")) ?? c.card,
    "--a2ui-color-on-input": color(input?.get("textColor")) ?? c.text,
    "--a2ui-text-a-color": c.accent,
    "--a2ui-slider-thumb-color": c.accent,
    "--a2ui-slider-track-color": c.border,
  });

  // --- Depth ----------------------------------------------------------------
  // The prose describes depth; there is no token for it.
  const shadow = dark ? "0 8px 28px rgb(0 0 0 / 0.5)" : `0 1px 2px ${mix(c.accent, "#000000", 0.3)}14, 0 8px 28px ${mix(c.accent, "#000000", 0.3)}1f`;
  vars["--a2ui-card-box-shadow"] = read.elevation === "shadow" ? shadow : "none";
  vars["--a2ui-card-border"] = read.elevation === "outline" ? `1px solid ${c.border}` : "none";
  if (read.elevation !== "outline" && !secondaryButton) vars["--a2ui-button-border"] = `1px solid ${c.border}`;

  // --- Shape ----------------------------------------------------------------
  const radius = toPx(find(system.rounded, ["md", "DEFAULT", "sm"], /./));
  if (radius !== undefined) {
    const card = component(system, /^(card|panel)/);
    const button = component(system, /^button-primary$/);
    const chip = component(system, /^(chip|badge|tag)/);
    const small = toPx(find(system.rounded, ["sm"])) ?? radius;
    const large = toPx(find(system.rounded, ["lg", "xl"])) ?? radius;
    Object.assign(vars, {
      "--a2ui-border-radius": px(radius),
      "--a2ui-card-border-radius": px(dimension(card?.get("rounded")) ?? large),
      "--a2ui-button-border-radius": px(dimension(button?.get("rounded")) ?? radius),
      "--a2ui-textfield-border-radius": px(dimension(input?.get("rounded")) ?? small),
      "--a2ui-choicepicker-chip-border-radius": px(dimension(chip?.get("rounded")) ?? toPx(system.rounded.get("full")) ?? radius),
      "--a2ui-image-border-radius": px(radius),
    });
  }

  // --- Space ----------------------------------------------------------------
  // The renderer's everyday gap is its "m"; in a DESIGN.md scale that is usually `sm`.
  const gap = toPx(find(system.spacing, ["sm", "base", "unit"])) ?? 8;
  const roomy = toPx(find(system.spacing, ["md", "gutter"])) ?? gap * 2;
  Object.assign(vars, {
    "--a2ui-spacing-xs": px((toPx(system.spacing.get("xs")) ?? gap / 2) / 2),
    "--a2ui-spacing-s": px(toPx(system.spacing.get("xs")) ?? gap / 2),
    "--a2ui-spacing-m": px(gap),
    "--a2ui-spacing-l": px(roomy),
    "--a2ui-spacing-xl": px(toPx(find(system.spacing, ["lg", "xl"])) ?? roomy * 2),
    "--a2ui-list-gap": px(roomy),
    "--a2ui-card-padding": px(dimension(component(system, /^(card|panel)/)?.get("padding")) ?? roomy),
    "--a2ui-card-margin": "0",
    "--a2ui-button-margin": "0",
  });
  const buttonPadding = dimension(component(system, /^button-primary$/)?.get("padding"));
  if (buttonPadding !== undefined) vars["--a2ui-button-padding"] = `${px(buttonPadding * 0.75)} ${px(buttonPadding * 1.5)}`;
  const inputPadding = dimension(input?.get("padding"));
  if (inputPadding !== undefined) vars["--a2ui-textfield-padding"] = px(inputPadding);

  // --- Type -----------------------------------------------------------------
  const body = find(system.typography, ["body-md", "body", "body-lg", "body-sm"], /body|paragraph|text/i);
  const title = find(system.typography, ["headline-md", "headline-lg", "title-lg", "h2", "h1"], /headline|display|title|^h\d/i);
  const label = find(system.typography, ["label-md", "label", "label-lg", "label-sm"], /label|caption/i);
  const bodyPx = toPx(body?.fontSize) ?? 16;
  vars["--a2ui-font-size"] = px(bodyPx);
  // The screen title is an h2: two steps up the renderer's modular scale.
  const titlePx = toPx(title?.fontSize);
  if (titlePx) vars["--a2ui-font-scale"] = String(Math.min(1.6, Math.max(1.08, Math.sqrt(titlePx / bodyPx))).toFixed(3));
  const lineHeight = (t: ResolvedTypography | undefined) =>
    t?.lineHeight ? (t.lineHeight.unit ? (toPx(t.lineHeight)! / (toPx(t.fontSize) ?? bodyPx)).toFixed(2) : String(t.lineHeight.value)) : undefined;
  if (lineHeight(body)) vars["--a2ui-line-height-body"] = lineHeight(body)!;
  if (lineHeight(title)) vars["--a2ui-line-height-headings"] = lineHeight(title)!;
  if (fontStack(title?.fontFamily)) vars["--a2ui-font-family-title"] = fontStack(title?.fontFamily)!;
  if (label?.fontSize) vars["--a2ui-label-font-size"] = px(toPx(label.fontSize)!);
  vars["--a2ui-label-font-weight"] = String(label?.fontWeight ?? 600);
  vars["--a2ui-button-font-weight"] = String(label?.fontWeight ?? 600);

  const families = [body, title, label].map((t) => t?.fontFamily?.split(",")[0].replace(/[^\w .-]/g, "").trim());
  return {
    vars,
    fontFamily: fontStack(body?.fontFamily) ?? "system-ui, sans-serif",
    fonts: [...new Set(families.filter((f): f is string => !!f && !GENERIC.test(f)))],
    colorScheme: dark ? "dark" : "light",
  };
}
