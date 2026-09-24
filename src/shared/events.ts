// Events streamed from the server pipelines to the browser (and the eval CLI).

import type { DesignReport } from "./design.js";
import type { Architecture, ScreenRoutes } from "./architecture.js";

export type A2uiMessage = Record<string, unknown> & { version: string };

/** Which service answers System One: jev is TypeSafe's, gev is ours, and they speak the same wire format (server/models.ts). */
export type Endpoint = "jev" | "gev";

/** What to call whoever answered, where a person reads it: "Jev" is the name of the job in the code, and of only one of the two that do it. */
export const named = (endpoint?: Endpoint) => (endpoint === "gev" ? "gev" : "Jev");

/** One Jev answer, flattened for display. */
export interface Decision {
  id: string;
  question: string;
  answer: string;
  /** Probability of the chosen answer (Noul: P(yes)). */
  p: number;
  /** Set when code overrode Jev's top pick to satisfy a structural constraint. */
  note?: string;
}

export type PipelineEvent =
  | { type: "architecture"; at: number; architecture: Architecture }
  | { type: "architecture-error"; at: number; message: string }
  | { type: "routes"; at: number; destination: string; routes: ScreenRoutes }
  /** The design the mock is painted with. `markdown` is set when Jev mixed it, so the browser can show the file. */
  | { type: "design"; at: number; report: DesignReport; markdown?: string }
  /** The reading the screen was built from: its kind, its parts and every answer as the graph read it; what it would take to build it again as it is (shared/turn.ts, `ScreenEdit`). */
  | { type: "plan"; at: number; plan: { kind: string; blocks: string[]; values: Record<string, boolean | string | number>; p: Record<string, number> } }
  /**
   * What the frame the screen is drawn in is, as the browser needs to know it whatever the catalog: whether it sits over
   * the screen it was opened from (a dialog), whether it is one of the app's main screens, where in its data its title
   * and the app's destinations are, and what the app settles once, on its first screen, for every screen after it.
   */
  | { type: "frame"; at: number; over: boolean; main: boolean; title?: string; destinations?: string; app?: Record<string, boolean | string | number> }
  | { type: "a2ui"; message: A2uiMessage; at: number }
  | {
      type: "trace";
      stage: string;
      at: number;
      ms: number;
      /** Set on what System One answered: which endpoint did, and, where it says (gev does), how much of `ms` its model took. */
      endpoint?: Endpoint;
      modelMs?: number;
      decisions?: Decision[];
      tokens?: { input: number; output: number };
      detail?: string;
    }
  | { type: "invalid"; at: number; errors: string[] }
  | { type: "done"; at: number; stats: RunStats }
  | { type: "error"; at: number; message: string };

export interface RunStats {
  mode: "mock" | "jobs" | "hybrid" | "baseline";
  totalMs: number;
  /** Time until the first updateComponents message left the server. */
  firstComponentsMs: number | null;
  /** Time until the client had both a component tree and some text to show in it. */
  firstContentMs: number | null;
  valid: boolean;
  /** Which endpoint the Jev calls went to. */
  endpoint?: Endpoint;
  jevCalls: number;
  jevInputTokens: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
}
