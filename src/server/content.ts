// Shared machinery for pipelines where Gemini writes content only: one
// streaming request per part of the screen, each forwarded into its own
// corner of the data model as it arrives, none of them blocking structure.

import { streamGeminiJson } from "./models.js";
import type { Run } from "./run.js";

export interface PartRequest {
  system: string;
  prompt: string;
  /** Must describe an object with a single key: the part's name. */
  schema: unknown;
}

export interface PartHooks {
  /** Adds code-owned values (such as image URLs) before the content reaches the data model. */
  decorate?(value: any, complete: boolean): any;
  /** Sees every new version of the part, after the surface exists. Used to grow structure from content. */
  onValue?(value: any, complete: boolean): void;
}

export class ContentStreams {
  private readonly background: Promise<void>[] = [];
  private failure: unknown;
  private surfaceOpen = false;
  /** Content that arrives before the surface exists is held until it does. */
  private readonly held: Array<{ part: string; handle: () => void }> = [];
  private readonly writers = new Map<string, AbortController>();
  private readonly refreshers = new Map<string, () => void>();

  constructor(
    private readonly run: Run,
    private readonly surfaceId: string,
  ) {}

  /** Starts work without awaiting it. A failure surfaces from settle(), not as an unhandled rejection. */
  spawn(work: Promise<void>) {
    this.background.push(work.catch((error) => void (this.failure ??= error)));
  }

  has(part: string) {
    return this.writers.has(part);
  }

  /**
   * Starts writing a part now. Safe to call before the surface exists: that is how text gets a head start.
   * Resolves with the finished part (undefined if it was cancelled or failed), for parts that must agree with it.
   */
  write(part: string, request: PartRequest, hooks: PartHooks = {}): Promise<any> {
    const controller = new AbortController();
    this.writers.set(part, controller);
    let last = "";
    let latest: { document: any; complete: boolean } | undefined;
    this.refreshers.set(part, () => latest && forward(latest.document, latest.complete));
    const forward = (document: any, complete: boolean) => {
      latest = { document, complete };
      const value = document?.[part];
      if (value === undefined || value === null) return;
      const handle = () => {
        const decorated = hooks.decorate ? hooks.decorate(value, complete) : value;
        const json = JSON.stringify(decorated);
        if (json !== last) {
          last = json;
          this.run.send({ updateDataModel: { surfaceId: this.surfaceId, path: `/${part}`, value: decorated } });
        }
        hooks.onValue?.(value, complete);
      };
      if (this.surfaceOpen) handle();
      else this.held.push({ part, handle });
    };

    let finished!: (value: any) => void;
    const result = new Promise<any>((resolve) => (finished = resolve));
    this.spawn(
      (async () => {
        const generated = await streamGeminiJson({ ...request, signal: controller.signal }, (partial) =>
          forward(partial, false),
        ).catch((error) => {
          if (controller.signal.aborted) return undefined;
          throw error;
        });
        if (!generated) return;
        this.run.stats.geminiInputTokens += generated.inputTokens;
        this.run.stats.geminiOutputTokens += generated.outputTokens;
        const document = JSON.parse(generated.text);
        forward(document, true);
        finished(document?.[part]);
        this.run.trace({
          stage: `Gemini: write ${part}`,
          ms: generated.ms,
          detail: `first chunk ${Math.round(generated.firstChunkMs)} ms`,
          tokens: { input: generated.inputTokens, output: generated.outputTokens },
        });
      })().finally(() => finished(undefined)),
    );
    return result;
  }

  /** Sends a part again through its hooks. For when what `decorate` adds has changed but the words have not. */
  refresh(part: string) {
    this.refreshers.get(part)?.();
  }

  /**
   * Call once the surface and its skeleton have been sent. Writers for parts
   * that turned out not to be wanted are cancelled; held content is released.
   */
  open(wanted: Set<string>) {
    let cancelled = 0;
    for (const [part, controller] of this.writers) {
      if (wanted.has(part)) continue;
      controller.abort();
      cancelled++;
    }
    if (cancelled) this.run.trace({ stage: `Canceled ${cancelled} speculative writer${cancelled > 1 ? "s" : ""}`, ms: 0 });
    this.surfaceOpen = true;
    for (const { part, handle } of this.held.splice(0)) if (wanted.has(part)) handle();
  }

  /** Resolves when all spawned work, including work spawned by that work, has finished. */
  async settle() {
    while (this.background.length) await Promise.all(this.background.splice(0));
    if (this.failure) throw this.failure;
  }
}
