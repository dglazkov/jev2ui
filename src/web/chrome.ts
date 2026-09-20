// The small things every part of the tool's own chrome is made of: a symbol, the mark, a face, and whether it is
// light or dark. The mock inside the device is none of this file's business: that is the kit's, painted by a DESIGN.md.

import { html, nothing, svg, type TemplateResult } from "lit";

/** A word as a label: the same word, with its first letter capital. Roles and device names are stored in the small. */
export const titled = (word: string) => (word ? word[0]!.toUpperCase() + word.slice(1) : word);

/** A Material Symbol, by its name (the font is the one index.html loads for the kit's Icon). */
export const icon = (name: string, className = "") => html`<span class="i ${className}" aria-hidden="true">${name}</span>`;

/** The mark. Drawn, not set in the symbol font: it is there before any font is. */
export const mark = () =>
  html`<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
    ${svg`<rect width="32" height="32" rx="9" fill="currentColor"/><g class="tiles"><rect x="7.5" y="7.5" width="7" height="17" rx="2"/><rect x="17" y="7.5" width="7.5" height="6.5" rx="2"/><rect x="17" y="16.5" width="7.5" height="8" rx="2" opacity=".7"/></g>`}
  </svg>`;

const HUES = [12, 38, 96, 152, 188, 214, 262, 312];

/** A person's face: their picture where there is one, the letters of their name on a colour of their own where not. */
export function face(person: { name?: string; email?: string; picture?: string }, className = ""): TemplateResult {
  const called = (person.name || person.email || "?").trim();
  const letters = called
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  let sum = 0;
  for (const char of person.email || called) sum = (sum * 31 + char.charCodeAt(0)) >>> 0;
  return html`<span class="face ${className}" style="--hue:${HUES[sum % HUES.length]}">
    ${letters}
    ${person.picture
      ? // Google serves a picture only to a page that does not say where it is asking from.
        html`<img src=${person.picture} alt="" referrerpolicy="no-referrer" @error=${(e: Event) => (e.target as HTMLElement).remove()} />`
      : nothing}
  </span>`;
}

// --- Light or dark -------------------------------------------------------------

export type Appearance = "system" | "light" | "dark";
const STORED = "jev2ui.appearance";
const dark = matchMedia("(prefers-color-scheme: dark)");

export function appearance(): Appearance {
  const said = localStorage.getItem(STORED);
  return said === "light" || said === "dark" ? said : "system";
}

function apply() {
  const said = appearance();
  document.documentElement.dataset.theme = said === "system" ? (dark.matches ? "dark" : "light") : said;
}

export function setAppearance(to: Appearance) {
  if (to === "system") localStorage.removeItem(STORED);
  else localStorage.setItem(STORED, to);
  apply();
}

// index.html settles it before the first paint; this keeps it true when the system changes its mind.
dark.addEventListener("change", apply);
