import type { A2uiMessage, PipelineEvent, RunStats } from "../shared/events.js";
import { validateMessages } from "./validate.js";

export const A2UI_VERSION = "v0.9";
export const CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
export const SURFACE_ID = "main";

/** True if any string value (not key) in the JSON value is readable text rather than empty or a URL. */
function hasText(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0 && !/^https?:/.test(value);
  if (value && typeof value === "object") return Object.values(value).some(hasText);
  return false;
}

/**
 * Bookkeeping shared by both pipelines: timestamps events, collects the A2UI
 * messages for end-of-run validation, and bridges callback-style producers
 * (Gemini streaming) to an async iterator.
 */
export class Run {
  private readonly start = performance.now();
  private readonly queue: PipelineEvent[] = [];
  private wake: (() => void) | undefined;
  private closed = false;
  private textSent = false;
  private readonly messages: A2uiMessage[] = [];
  readonly stats: RunStats;

  constructor(mode: RunStats["mode"]) {
    this.stats = {
      mode,
      totalMs: 0,
      firstComponentsMs: null,
      firstContentMs: null,
      valid: true,
      jevCalls: 0,
      jevInputTokens: 0,
      geminiInputTokens: 0,
      geminiOutputTokens: 0,
    };
  }

  get at(): number {
    return Math.round(performance.now() - this.start);
  }

  private push(event: PipelineEvent) {
    this.queue.push(event);
    this.wake?.();
  }

  send(body: Record<string, unknown>) {
    const message = { version: A2UI_VERSION, ...body } as A2uiMessage;
    if ("updateComponents" in body && this.stats.firstComponentsMs === null) {
      this.stats.firstComponentsMs = this.at;
    }
    // Text is only visible once there is also a component tree to show it in.
    this.textSent ||= this.carriesText(body);
    if (this.stats.firstContentMs === null && this.textSent && this.stats.firstComponentsMs !== null) {
      this.stats.firstContentMs = this.at;
    }
    this.messages.push(message);
    this.push({ type: "a2ui", message, at: this.at });
  }

  /** The hybrid keeps all text in the data model; the baseline may also inline it in components. */
  private carriesText(body: Record<string, any>): boolean {
    if ("updateDataModel" in body) return hasText(body.updateDataModel.value);
    return this.stats.mode === "baseline" && "updateComponents" in body;
  }

  trace(event: Omit<Extract<PipelineEvent, { type: "trace" }>, "type" | "at">) {
    this.push({ type: "trace", at: this.at, ...event, ms: Math.round(event.ms) });
  }

  /** Runs the pipeline body and guarantees a terminal event. */
  async *drive(body: () => Promise<void>): AsyncGenerator<PipelineEvent> {
    const finished = body()
      .then(() => {
        const errors = validateMessages(this.messages);
        this.stats.valid = errors.length === 0 && this.messages.length > 0;
        if (errors.length) this.push({ type: "invalid", at: this.at, errors });
        this.stats.totalMs = this.at;
        this.push({ type: "done", at: this.at, stats: this.stats });
      })
      .catch((error: unknown) => {
        this.stats.valid = false;
        this.stats.totalMs = this.at;
        this.push({ type: "error", at: this.at, message: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.closed = true;
        this.wake?.();
      });

    while (true) {
      while (this.queue.length) yield this.queue.shift()!;
      if (this.closed) break;
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
    await finished;
  }
}
