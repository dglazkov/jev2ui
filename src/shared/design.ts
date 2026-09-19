// What the server tells the browser about a DESIGN.md: how to paint the mock,
// what the linter found, and how Jev read the prose.

import type { Decision } from "./events.js";

export interface Theme {
  /** CSS custom properties understood by the A2UI renderer (`--a2ui-*`). */
  vars: Record<string, string>;
  /** `font-family` for the mock as a whole; headings get theirs through a variable. */
  fontFamily: string;
  /** Families to try loading from Google Fonts. */
  fonts: string[];
  colorScheme: "light" | "dark";
}

export interface DesignFinding {
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
}

export interface DesignReport {
  name: string;
  theme: Theme;
  findings: DesignFinding[];
  /** How each colour role and style question was settled: by a token, or by Jev reading the prose. */
  decisions: Decision[];
  /** The decisions that change the component tree, so the browser can tell when a mock is stale. */
  structure: string;
  ms: number;
  jevInputTokens: number;
}
