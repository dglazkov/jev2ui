// Events streamed from the server pipelines to the browser (and the eval CLI).

export type A2uiMessage = Record<string, unknown> & { version: string };

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
  | { type: "a2ui"; message: A2uiMessage; at: number }
  | {
      type: "trace";
      stage: string;
      at: number;
      ms: number;
      decisions?: Decision[];
      tokens?: { input: number; output: number };
      detail?: string;
    }
  | { type: "invalid"; at: number; errors: string[] }
  | { type: "done"; at: number; stats: RunStats }
  | { type: "error"; at: number; message: string };

export interface RunStats {
  mode: "jobs" | "hybrid" | "baseline";
  totalMs: number;
  /** Time until the first updateComponents message left the server. */
  firstComponentsMs: number | null;
  /** Time until the client had both a component tree and some text to show in it. */
  firstContentMs: number | null;
  valid: boolean;
  jevCalls: number;
  jevInputTokens: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
}
