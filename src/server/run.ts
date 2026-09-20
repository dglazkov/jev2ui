import type { A2uiMessage, PipelineEvent, RunStats } from "../shared/events.js";
import { validateMessages } from "./validate.js";
import { askJev, endpoint } from "./models.js";
import type { Questions } from "@typesafe-ai/sdk";
import type { DesignReport } from "../shared/design.js";

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
  /** Who answers this run's Jev calls, all of them: whoever was answering when it began (models.ts). */
  private readonly endpoint = endpoint();
  /** What each Jev call said of its own timing, by its stage, for the trace that tells of it. */
  private readonly modelMs = new Map<string, number | undefined>();
  readonly stats: RunStats;

  constructor(mode: RunStats["mode"]) {
    this.stats = {
      mode,
      totalMs: 0,
      firstComponentsMs: null,
      firstContentMs: null,
      valid: true,
      endpoint: this.endpoint,
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

  /** One Jev request, counted in this run's stats. */
  async askJev(stage: string, state: unknown, questions: Questions) {
    const result = await askJev(state, questions, this.endpoint);
    this.modelMs.set(stage, result.modelMs);
    this.stats.jevCalls++;
    this.stats.jevInputTokens += result.inputTokens;
    return { ...result, stage };
  }

  /** The plan the screen is built from, for whoever may want it built again as it is. */
  plan(plan: Record<string, unknown> & { archetype: string; blocks: string[] }) {
    this.push({ type: "plan", at: this.at, plan });
  }

  design(report: DesignReport, markdown?: string) {
    this.push({ type: "design", at: this.at, report, ...(markdown ? { markdown } : {}) });
  }

  trace(event: Omit<Extract<PipelineEvent, { type: "trace" }>, "type" | "at">) {
    const modelMs = this.modelMs.get(event.stage);
    const asked = this.modelMs.has(event.stage) ? { endpoint: this.endpoint, ...(modelMs !== undefined ? { modelMs } : {}) } : {};
    this.push({ type: "trace", at: this.at, ...asked, ...event, ms: Math.round(event.ms) });
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
