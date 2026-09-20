// Events streamed from the server pipelines to the browser (and the eval CLI).

import type { DesignReport } from "./design.js";

export type A2uiMessage = Record<string, unknown> & { version: string };

/** Which service answers System One: jev is TypeSafe's, gev is ours, and they speak the same wire format (server/models.ts). */
export type Endpoint = "jev" | "gev";

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
  /** The design the mock is painted with. `markdown` is set when Jev mixed it, so the browser can show the file. */
  | { type: "design"; at: number; report: DesignReport; markdown?: string }
  /** The plan the screen was built from: what it would take to build it again as it is (shared/turn.ts, `ScreenEdit`). */
  | { type: "plan"; at: number; plan: Record<string, unknown> & { archetype: string; blocks: string[] } }
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
