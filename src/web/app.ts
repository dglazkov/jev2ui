import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import "./kit/surface.js";
import "./kit/kit.css";
import type { KitSurface } from "./kit/surface.js";
import type { A2uiMessage, Decision, PipelineEvent, RunStats } from "../shared/events.js";
import type { DesignReport, Theme } from "../shared/design.js";

const EXAMPLES = [
  "Settings screen for a podcast app",
  "Checkout for a sneaker store, with order summary",
  "Home energy dashboard showing today's usage",
  "Find a dog walker: nearby walkers with ratings",
  "Sign-up form for a weekend pottery workshop",
  "Recipe page for sourdough bread",
  "Confirm deleting my account",
  "Kubernetes cluster health for on-call engineers",
  "Bedtime story picker for a kids' reading app",
];

// The bundled designs are ordinary DESIGN.md files; a developer's own goes in the same editor.
const FILES = import.meta.glob("../../designs/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const PRESETS = Object.entries(FILES).map(([path, markdown]) => ({
  id: path.split("/").pop()!.replace(/\.md$/, ""),
  name: /^name:\s*(.+)$/m.exec(markdown)?.[1].trim() ?? path,
  markdown,
}));

const AUTO = "auto";
const CUSTOM = "custom";
const STORED_DESIGN = "jev2ui.design.md";
const DEVICES = { phone: 390, tablet: 768, desktop: 1180 } as const;
type Device = keyof typeof DEVICES;

type LogEntry =
  | { kind: "stage"; at: number; stage: string; ms: number; detail?: string; decisions: Decision[]; tokens?: { input: number; output: number } }
  | { kind: "note"; at: number; tone: "bad" | "plain"; text: string };

/** Server-Sent Events over a POST, which EventSource cannot make. */
async function streamEvents(body: unknown, signal: AbortSignal, onEvent: (event: PipelineEvent) => void) {
  const response = await fetch("/api/generate", { method: "POST", body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) throw new Error(await response.text());
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop()!;
    for (const frame of frames) if (frame.startsWith("data: ")) onEvent(JSON.parse(frame.slice(6)));
  }
}

const requestedFonts = new Set<string>();
function loadFonts(theme: Theme) {
  for (const family of theme.fonts) {
    if (requestedFonts.has(family)) continue;
    requestedFonts.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const name = encodeURIComponent(family).replace(/%20/g, "+");
    link.href = `https://fonts.googleapis.com/css2?family=${name}:wght@400;700&display=swap`;
    // Google Fonts rejects the whole request if a weight is missing; the bare family always answers.
    link.onerror = () => (link.href = `https://fonts.googleapis.com/css2?family=${name}&display=swap`);
    document.head.append(link);
  }
}

@customElement("jev2ui-app")
export class App extends LitElement {
  @state() private prompt = EXAMPLES[0];
  @state() private device: Device = "phone";

  @state() private choice: string = AUTO;
  @state() private markdown = "";
  @state() private report: DesignReport | undefined;
  @state() private designError = "";
  @state() private designBusy = false;

  @state() private painted = false;
  @state() private log: LogEntry[] = [];
  @state() private stats: RunStats | undefined;
  @state() private firstPaintMs: number | undefined;
  @state() private running = false;
  @state() private copied = "";
  /** The design decisions the current mock's component tree was built with. */
  @state() private builtWith: string | undefined;

  private messages: A2uiMessage[] = [];
  private abort: AbortController | undefined;
  private designRequest = 0;
  private editTimer: ReturnType<typeof setTimeout> | undefined;

  // Light DOM, so the theme variables set on the device frame reach the renderer.
  protected createRenderRoot() {
    return this;
  }

  private get kit() {
    return this.querySelector<KitSurface>("kit-surface")!;
  }

  // --- Design -----------------------------------------------------------------

  private choose(choice: string) {
    this.choice = choice;
    this.designError = "";
    if (choice === AUTO) {
      // Mixed from the prompt at generation time; if a mock is showing, mix for it now.
      if (this.painted) void this.loadDesign({ brief: this.prompt });
      return;
    }
    this.markdown = choice === CUSTOM ? (localStorage.getItem(STORED_DESIGN) ?? this.markdown) : PRESETS.find((p) => p.id === choice)!.markdown;
    void this.loadDesign({ markdown: this.markdown });
  }

  private edit(markdown: string) {
    this.markdown = markdown;
    this.choice = CUSTOM;
    localStorage.setItem(STORED_DESIGN, markdown);
    clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => void this.loadDesign({ markdown }), 700);
  }

  private async loadDesign(source: { markdown: string } | { brief: string }) {
    const request = ++this.designRequest;
    this.designBusy = true;
    try {
      const response = await fetch("/api/design", { method: "POST", body: JSON.stringify(source) });
      if (!response.ok) throw new Error(await response.text());
      const { report, markdown } = await response.json();
      if (request !== this.designRequest) return;
      this.applyDesign(report, markdown);
      this.designError = "";
    } catch (error) {
      if (request === this.designRequest) this.designError = (error as Error).message;
    } finally {
      if (request === this.designRequest) this.designBusy = false;
    }
  }

  private applyDesign(report: DesignReport, mixedMarkdown?: string) {
    this.report = report;
    if (mixedMarkdown) this.markdown = mixedMarkdown;
    loadFonts(report.theme);
  }

  // --- Mock -------------------------------------------------------------------

  private async generate(prompt = this.prompt) {
    this.prompt = prompt;
    if (!prompt.trim()) return;
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    this.painted = false;
    this.kit.reset();
    this.log = [];
    this.stats = undefined;
    this.firstPaintMs = undefined;
    this.messages = [];
    this.running = true;

    try {
      await streamEvents({ prompt, markdown: this.choice === AUTO ? undefined : this.markdown }, abort.signal, (event) => {
        switch (event.type) {
          case "design":
            this.designRequest++; // a reading in flight is older than this one
            this.applyDesign(event.report, event.markdown);
            this.builtWith = event.report.structure;
            break;
          case "a2ui":
            this.messages.push(event.message);
            this.kit.apply(event.message);
            if ("updateComponents" in event.message) {
              this.firstPaintMs ??= event.at;
              this.painted = true;
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
            break;
          case "done":
            this.stats = event.stats;
            break;
        }
      });
    } catch (error) {
      if (!abort.signal.aborted) this.note("bad", (error as Error).message);
    } finally {
      if (this.abort === abort) this.running = false;
    }
  }

  private note(tone: "bad" | "plain", text: string, at = this.stats?.totalMs ?? 0) {
    this.log = [...this.log, { kind: "note", at, tone, text }];
  }

  private async copy(what: string, text: string) {
    await navigator.clipboard.writeText(text);
    this.copied = what;
    setTimeout(() => (this.copied = ""), 1200);
  }

  private themeCss() {
    const theme = this.report!.theme;
    const lines = Object.entries(theme.vars).map(([k, v]) => `  ${k}: ${v};`);
    return `.mock {\n  color-scheme: ${theme.colorScheme};\n  font-family: ${theme.fontFamily};\n${lines.join("\n")}\n}\n`;
  }

  // --- Rendering ----------------------------------------------------------------

  private renderDesign() {
    const vars = this.report?.theme.vars;
    const swatches: Array<[string, string]> = vars
      ? [
          ["page", vars["--k-page"]],
          ["card", vars["--k-card"]],
          ["text", vars["--k-text"]],
          ["muted", vars["--k-muted"]],
          ["accent", vars["--k-accent"]],
          ["border", vars["--k-border"]],
        ]
      : [];
    const problems = this.report?.findings.filter((f) => f.severity !== "info") ?? [];
    const options = [{ id: AUTO, name: "Auto" }, ...PRESETS, { id: CUSTOM, name: "Custom" }];
    return html`
      <section class="design">
        <h2>Design <small>${this.designBusy ? "reading…" : (this.report?.name ?? "")}</small></h2>
        <div class="segmented" role="radiogroup" aria-label="Design system">
          ${options.map(
            (o) => html`<button role="radio" aria-checked=${this.choice === o.id} @click=${() => this.choose(o.id)}>${o.name}</button>`,
          )}
        </div>
        <p class="hint">
          ${this.choice === AUTO
            ? "No DESIGN.md: Jev rates the brief on hue, vividness, warmth, roundness and whitespace, and the ratings become one."
            : "A DESIGN.md: tokens paint the mock, and Jev reads the prose for what tokens cannot say."}
        </p>
        ${swatches.length
          ? html`<div class="swatches">
              ${swatches.map(([role, value]) => html`<span title="${role} ${value}"><i style="background:${value}"></i>${role}</span>`)}
            </div>`
          : nothing}
        ${this.designError ? html`<p class="note bad">${this.designError}</p>` : nothing}
        ${problems.map((f) => html`<p class="note ${f.severity === "error" ? "bad" : "warn"}">${f.severity}: ${f.message}</p>`)}
        <details class="editor" ?open=${this.choice === CUSTOM}>
          <summary>
            DESIGN.md
            ${this.markdown
              ? html`<button class="link" @click=${(e: Event) => (e.preventDefault(), this.copy("design", this.markdown))}>
                  ${this.copied === "design" ? "copied" : "copy"}
                </button>`
              : nothing}
          </summary>
          <textarea
            spellcheck="false"
            aria-label="DESIGN.md"
            placeholder="Paste your project's DESIGN.md here."
            .value=${this.markdown}
            @input=${(e: InputEvent) => this.edit((e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </details>
      </section>
    `;
  }

  private renderTrace() {
    return html`
      <aside class="trace">
        <h2>Trace</h2>
        ${this.log.length === 0 ? html`<p class="hint">Every decision Jev makes shows up here, with its probability.</p>` : nothing}
        ${this.log.map((entry) =>
          entry.kind === "note"
            ? html`<p class="note ${entry.tone}">${entry.text}</p>`
            : html`
                <section class="stage-entry">
                  <h3>
                    ${entry.stage}
                    <small>
                      at ${entry.at} ms${entry.ms ? ` · took ${entry.ms} ms` : ""}${entry.detail ? ` · ${entry.detail}` : ""}${entry.tokens?.input
                        ? ` · ${entry.tokens.input} in tok`
                        : ""}
                    </small>
                  </h3>
                  ${entry.decisions.length
                    ? html`<table>
                        ${entry.decisions.map(
                          (d) => html`<tr title=${d.note ?? ""}>
                            <td>${d.question}${d.note ? html`<em>${d.note}</em>` : nothing}</td>
                            <td class="answer">${d.answer}</td>
                            <td class="bar"><span style="width:${Math.round(d.p * 100)}%"></span></td>
                          </tr>`,
                        )}
                      </table>`
                    : nothing}
                </section>
              `,
        )}
      </aside>
    `;
  }

  render() {
    const s = this.stats;
    const theme = this.report?.theme;
    const frame = theme
      ? { ...theme.vars, "color-scheme": theme.colorScheme, background: theme.vars["--k-page"] }
      : {};
    const stale = this.painted && !this.running && this.report && this.builtWith !== undefined && this.report.structure !== this.builtWith;
    return html`
      <header class="top">
        <h1>jev2ui <small>describe a screen, get a mock</small></h1>
        <a href="/compare.html">compare pipelines →</a>
      </header>
      <div class="workbench">
        <aside class="controls">
          <form
            class="prompt"
            @submit=${(e: Event) => {
              e.preventDefault();
              void this.generate();
            }}
          >
            <textarea
              rows="3"
              aria-label="Describe the screen"
              placeholder="Describe the screen you want…"
              .value=${this.prompt}
              @input=${(e: InputEvent) => (this.prompt = (e.target as HTMLTextAreaElement).value)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void this.generate();
                }
              }}
            ></textarea>
            <button type="submit">${this.running ? "Mocking…" : "Mock it"}</button>
          </form>
          <div class="examples">${EXAMPLES.map((example) => html`<button @click=${() => this.generate(example)}>${example}</button>`)}</div>
          ${this.renderDesign()}
        </aside>

        <section class="stage">
          <div class="toolbar">
            <div class="segmented" role="radiogroup" aria-label="Device">
              ${(Object.keys(DEVICES) as Device[]).map(
                (d) => html`<button role="radio" aria-checked=${this.device === d} @click=${() => (this.device = d)}>${d}</button>`,
              )}
            </div>
            <div class="stats">
              ${this.firstPaintMs !== undefined ? html`<span class="pill">first UI ${this.firstPaintMs} ms</span>` : nothing}
              ${s
                ? html`<span class="pill">done ${s.totalMs} ms</span>
                    <span class="pill">${s.jevCalls} Jev · ${s.geminiOutputTokens} Gemini tok</span>
                    <span class="pill ${s.valid ? "good" : "bad"}">${s.valid ? "valid tree" : "invalid tree"}</span>`
                : nothing}
            </div>
            <div class="exports">
              <button ?disabled=${!this.painted} @click=${() => this.copy("a2ui", JSON.stringify(this.messages, null, 2))}>
                ${this.copied === "a2ui" ? "Copied" : "Copy messages"}
              </button>
              <button ?disabled=${!theme} @click=${() => this.copy("css", this.themeCss())}>${this.copied === "css" ? "Copied" : "Copy theme CSS"}</button>
            </div>
          </div>
          ${stale ? html`<p class="stale">This design lays the screen out differently. <button class="link" @click=${() => this.generate()}>Mock it again</button></p>` : nothing}
          <div class="device ${this.device}" style="max-width:${DEVICES[this.device]}px">
            <div class="screen" style=${styleMap(frame)}>
              <kit-surface
                @kit-action=${(e: CustomEvent) => this.note("plain", `pressed "${e.detail.label}" (${e.detail.name})`)}
                ?hidden=${!this.painted}
              ></kit-surface>
              ${this.painted ? nothing : html`<p class="empty">${this.running ? "Planning the screen…" : "Describe a screen and it appears here."}</p>`}
            </div>
          </div>
        </section>

        ${this.renderTrace()}
      </div>
    `;
  }
}
