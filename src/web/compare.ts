import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ContextProvider } from "@lit/context";
import { MessageProcessor, type SurfaceModel } from "@a2ui/web_core/v0_9";
import { basicCatalog, Context } from "@a2ui/lit/v0_9";
import { renderMarkdown } from "@a2ui/markdown-it";
import type { Decision, PipelineEvent, RunStats } from "../shared/events.js";

const EXAMPLES = [
  "Delete my account and all of its data",
  "What happens to my data if I delete my account?",
  "Am I going to be surprised by my electricity bill this month?",
  "Send $50 to Alex",
  "My car won't start, what do I do?",
  "Sign-up form for a weekend pottery workshop",
  "Find me three Italian restaurants near downtown Seattle for tonight",
  "How do I make sourdough starter from scratch?",
  "Tell me about the Golden Gate Bridge",
];

type Mode = RunStats["mode"];
type LogEntry =
  | { kind: "stage"; at: number; stage: string; ms: number; detail?: string; decisions: Decision[]; tokens?: { input: number; output: number } }
  | { kind: "note"; at: number; tone: "bad" | "plain"; text: string };

/** One pipeline run: its own message processor, surface, and trace. */
@customElement("jev2ui-run")
export class RunPanel extends LitElement {
  @property() mode: Mode = "hybrid";
  @property() heading = "";
  @state() private surface: SurfaceModel<any> | undefined;
  @state() private log: LogEntry[] = [];
  @state() private stats: RunStats | undefined;
  @state() private firstPaintMs: number | undefined;
  @state() private running = false;
  private source: EventSource | undefined;

  // Light DOM, so the renderer's injected theme variables and page CSS both apply.
  protected createRenderRoot() {
    return this;
  }

  start(prompt: string) {
    this.source?.close();
    this.surface = undefined;
    this.log = [];
    this.stats = undefined;
    this.firstPaintMs = undefined;
    this.running = true;

    const processor = new MessageProcessor([basicCatalog], (action) => {
      this.note("plain", `action "${action.name}" ${JSON.stringify(action.context)}`);
    });
    processor.onSurfaceCreated((surface) => (this.surface = surface));

    const query = new URLSearchParams({ mode: this.mode, prompt });
    const source = (this.source = new EventSource(`/api/generate?${query}`));
    source.onmessage = (message) => {
      const event: PipelineEvent = JSON.parse(message.data);
      switch (event.type) {
        case "a2ui":
          try {
            processor.processMessages([event.message as any]);
            if ("updateComponents" in event.message) this.firstPaintMs ??= event.at;
          } catch (error) {
            this.note("bad", `renderer rejected a message: ${(error as Error).message}`, event.at);
          }
          break;
        case "trace":
          this.log = [...this.log, { kind: "stage", decisions: [], ...event }];
          break;
        case "invalid":
          for (const text of event.errors) this.note("bad", text, event.at);
          break;
        case "error":
          this.note("bad", event.message, event.at);
          this.finish();
          break;
        case "done":
          this.stats = event.stats;
          this.finish();
          break;
      }
    };
    source.onerror = () => this.finish();
  }

  private finish() {
    this.running = false;
    this.source?.close();
  }

  private note(tone: "bad" | "plain", text: string, at = this.stats?.totalMs ?? 0) {
    this.log = [...this.log, { kind: "note", at, tone, text }];
  }

  render() {
    const s = this.stats;
    return html`
      <header class="run-header">
        <h2>${this.heading}</h2>
        <div class="stats">
          ${this.running ? html`<span class="pill live">running</span>` : nothing}
          ${this.firstPaintMs !== undefined ? html`<span class="pill">first UI ${this.firstPaintMs} ms</span>` : nothing}
          ${s
            ? html`${s.firstContentMs !== null ? html`<span class="pill">first text ${s.firstContentMs} ms</span>` : nothing}
                <span class="pill">done ${s.totalMs} ms</span>
                <span class="pill">${s.geminiOutputTokens} Gemini out tok</span>
                ${s.jevCalls ? html`<span class="pill">${s.jevCalls} Jev calls · ${s.jevInputTokens} tok</span>` : nothing}
                <span class="pill ${s.valid ? "good" : "bad"}">${s.valid ? "valid A2UI" : "invalid A2UI"}</span>`
            : nothing}
        </div>
      </header>
      <div class="surface">
        ${this.surface
          ? html`<a2ui-surface .surface=${this.surface}></a2ui-surface>`
          : html`<p class="empty">${this.running ? "Waiting for the first components…" : "Nothing rendered yet."}</p>`}
      </div>
      <details class="trace" open>
        <summary>Trace</summary>
        ${this.log.map((entry) =>
          entry.kind === "note"
            ? html`<p class="note ${entry.tone}">${entry.text}</p>`
            : html`
                <section class="stage">
                  <h3>
                    ${entry.stage}
                    <small>
                      at ${entry.at} ms · took ${entry.ms} ms${entry.detail ? ` · ${entry.detail}` : ""}${entry.tokens ? ` · ${entry.tokens.input} in / ${entry.tokens.output} out tok` : ""}
                    </small>
                  </h3>
                  ${entry.decisions.length
                    ? html`<table>
                        ${entry.decisions.map(
                          (d) => html`<tr title=${d.note ?? ""}>
                            <td>${d.question}</td>
                            <td class="answer">${d.answer}${d.note ? html`<sup>*</sup>` : nothing}</td>
                            <td class="bar"><span style="width:${Math.round(d.p * 100)}%"></span></td>
                            <td class="p">${d.p.toFixed(2)}</td>
                          </tr>`,
                        )}
                      </table>`
                    : nothing}
                </section>
              `,
        )}
      </details>
    `;
  }
}

@customElement("jev2ui-app")
export class App extends LitElement {
  @state() private prompt = EXAMPLES[0];

  protected createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    // Text components pull their markdown renderer from context.
    new ContextProvider(this, { context: Context.markdown, initialValue: renderMarkdown });
  }

  private go(prompt = this.prompt) {
    this.prompt = prompt;
    if (!prompt.trim()) return;
    for (const panel of this.querySelectorAll<RunPanel>("jev2ui-run")) panel.start(prompt);
  }

  render() {
    return html`
      <h1>jev2ui <small>Jev decides · Gemini writes · code assembles A2UI</small></h1>
      <form
        class="prompt"
        @submit=${(e: Event) => {
          e.preventDefault();
          this.go();
        }}
      >
        <input
          .value=${this.prompt}
          @input=${(e: InputEvent) => (this.prompt = (e.target as HTMLInputElement).value)}
          placeholder="Describe a UI…"
          aria-label="Prompt"
        />
        <button type="submit">Generate</button>
      </form>
      <div class="examples">
        ${EXAMPLES.map((example) => html`<button @click=${() => this.go(example)}>${example}</button>`)}
      </div>
      <main>
        <jev2ui-run mode="jobs" heading="Jobs: Jev profiles the person"></jev2ui-run>
        <jev2ui-run mode="hybrid" heading="Sections: Jev picks the parts"></jev2ui-run>
        <jev2ui-run mode="baseline" heading="Baseline: Gemini writes A2UI"></jev2ui-run>
      </main>
    `;
  }
}
