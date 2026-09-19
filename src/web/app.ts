import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { repeat } from "lit/directives/repeat.js";
import "./kit/surface.js";
import "./kit/kit.css";
import type { KitSurface } from "./kit/surface.js";
import type { A2uiMessage, Decision, PipelineEvent, RunStats } from "../shared/events.js";
import type { DesignReport, Theme } from "../shared/design.js";
import type { Journey, Via } from "../shared/journey.js";

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

const AUTO = "auto";
const CUSTOM = "custom";
const STORED_DESIGN = "jev2ui.design.md";
const DEVICES = { phone: 390, tablet: 768, desktop: 1180 } as const;
type Device = keyof typeof DEVICES;

type LogEntry =
  | { kind: "stage"; at: number; stage: string; ms: number; detail?: string; decisions: Decision[]; tokens?: { input: number; output: number } }
  | { kind: "note"; at: number; tone: "bad" | "plain"; text: string };

/**
 * One screen of the prototype. A session is a graph of these that grows as the person taps around: a tap that
 * has been followed before shows the screen it made then, so the prototype holds still while it is explored.
 */
interface Screen {
  id: number;
  /** What leads here: `nav:Saved`, or `3:item:Il Corvo Pasta` for a tap on screen 3. */
  key: string;
  title: string;
  archetype: string;
  topLevel: boolean;
  dialog: boolean;
  messages: A2uiMessage[];
  log: LogEntry[];
  stats?: RunStats;
  firstPaintMs?: number;
  running: boolean;
  builtWith?: string;
  /** What it was made from, so that it can be made again. */
  request: { prompt: string; journey?: Journey; fresh?: boolean };
}

/** A button that backs out of a dialog goes back; it does not lead anywhere new. */
const BACKS_OUT = /^(cancel|close|back|dismiss|not now|no\b|never mind|keep|go back|done|ok)/i;
/** Top-bar actions that act in place. */
const IN_PLACE = new Set(["favorite", "more_vert", "share"]);

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
  /** Which draw of Jev's mix is showing: 0 is its best guess, anything else a remix. */
  @state() private seed = 0;

  @state() private copied = "";
  /** Bumped whenever a screen changes; screens are mutated in place as their messages stream in. */
  @state() private tick = 0;

  // The session: what app this is, every screen made for it, and the way back.
  private app = "";
  private nav: Journey["nav"];
  private screens = new Map<string, Screen>();
  private stack: Screen[] = [];
  private nextId = 1;
  private abort: AbortController | undefined;
  private designRequest = 0;
  private editTimer: ReturnType<typeof setTimeout> | undefined;

  // Light DOM, so the theme variables set on the device frame reach the renderer.
  protected createRenderRoot() {
    return this;
  }

  private get current(): Screen | undefined {
    return this.stack.at(-1);
  }

  protected updated() {
    const byId = new Map([...this.screens.values()].map((screen) => [String(screen.id), screen]));
    for (const surface of this.querySelectorAll<KitSurface>("kit-surface")) {
      surface.theme = this.report?.theme;
      surface.sync(byId.get(surface.dataset.screen!)?.messages ?? []);
    }
  }

  // --- Design -----------------------------------------------------------------

  /** The design is either Jev's mix for this app or the developer's own DESIGN.md. */
  private choose(choice: string) {
    this.choice = choice;
    this.designError = "";
    if (choice === AUTO) {
      if (this.app || this.prompt.trim()) void this.loadDesign({ brief: this.app || this.prompt, seed: this.seed });
      return;
    }
    this.markdown = localStorage.getItem(STORED_DESIGN) ?? this.markdown;
    if (this.markdown.trim()) void this.loadDesign({ markdown: this.markdown });
  }

  /** Another draw from what Jev thinks suits the brief. The screens stay; only their paint changes. */
  private remix() {
    this.choice = AUTO;
    this.seed = 1 + Math.floor(Math.random() * 0xfffffff);
    void this.loadDesign({ brief: this.app || this.prompt, seed: this.seed });
  }

  private edit(markdown: string) {
    this.markdown = markdown;
    this.choice = CUSTOM;
    localStorage.setItem(STORED_DESIGN, markdown);
    clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => void this.loadDesign({ markdown }), 700);
  }

  private async loadDesign(source: { markdown: string } | { brief: string; seed: number }) {
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

  /** A new description starts a new app. */
  private generate(prompt = this.prompt) {
    this.prompt = prompt;
    if (!prompt.trim()) return;
    // A remix belongs to the app it was made for; a new app starts from Jev's best guess.
    if (prompt !== this.app) this.seed = 0;
    this.app = prompt;
    this.nav = undefined;
    this.screens = new Map();
    this.nextId = 1;
    const screen = this.open("start", true, { prompt });
    this.stack = [screen];
    void this.run(screen);
  }

  private open(key: string, topLevel: boolean, request: Screen["request"]): Screen {
    const screen: Screen = { id: this.nextId++, key, title: "", archetype: "", topLevel, dialog: false, messages: [], log: [], running: true, request };
    this.screens.set(key, screen);
    return screen;
  }

  /** What a tap does: go back, show the screen this tap made before, or have a new one made. */
  private follow(detail: { kind: string; label: string; data?: Record<string, unknown>; index?: number; variant?: string; component?: string }) {
    const here = this.current;
    if (!here) return;
    const kind = (detail.kind === "item" && detail.variant !== undefined ? "itemAction" : detail.kind) as Via["kind"];
    if (kind === "appbar" && IN_PLACE.has(detail.label)) return;
    const backsOut = kind === "back" || ((kind === "action" || kind === "submit") && here.dialog && (BACKS_OUT.test(detail.label) || detail.variant === "secondary"));
    if (backsOut && this.stack.length > 1) {
      this.stack = this.stack.slice(0, -1);
      return void this.tick++;
    }
    const via: Via = { kind: backsOut ? "back" : kind, label: detail.label, ...(detail.data ? { data: detail.data } : {}), ...(detail.index !== undefined ? { index: detail.index } : {}), ...(detail.component ? { component: detail.component } : {}) };
    const key = via.kind === "nav" ? `nav:${via.label}` : `${here.id}:${via.kind}:${via.label}`;
    let screen = this.screens.get(key);
    const made = !screen;
    screen ??= this.open(key, via.kind === "nav", { prompt: this.app, journey: { app: this.app, from: { title: here.title, archetype: here.archetype }, via, ...(this.nav ? { nav: this.nav } : {}) } });
    // The navigation bar switches between main screens, and a way back from the first screen makes the one it came from. Everything else drills in.
    this.stack = via.kind === "nav" || via.kind === "back" ? [screen] : [...this.stack, screen];
    // The home made by going back from a settings page leads back to that page, not to a second one.
    if (made && via.kind === "back" && here.archetype === "settings") this.screens.set(`${screen.id}:appbar:settings`, here);
    this.tick++;
    if (made) void this.run(screen);
  }

  /** Makes the current page again from the same request. Whatever was reached from the old one goes with it. */
  private regenerate() {
    const old = this.current;
    if (!old) return;
    const forget = (screen: Screen) => {
      for (const [key, other] of [...this.screens]) {
        if (other === screen) this.screens.delete(key);
        else if (key.startsWith(`${screen.id}:`) && !this.stack.includes(other)) forget(other);
      }
    };
    const aliases = [...this.screens].filter(([, screen]) => screen === old).map(([key]) => key);
    forget(old);
    // It may have been the screen that established the navigation bar; if so, it establishes it again.
    const request = old.request.journey && !old.request.journey.nav ? old.request : { ...old.request, ...(old.request.journey && this.nav ? { journey: { ...old.request.journey, nav: this.nav } } : {}) };
    // Made again means made anew: a custom component is baked afresh, not taken from the app's shelf.
    const screen = this.open(old.key, old.topLevel, { ...request, fresh: true });
    for (const key of aliases) this.screens.set(key, screen);
    this.stack = [...this.stack.slice(0, -1), screen];
    this.tick++;
    void this.run(screen);
  }

  private async run(screen: Screen) {
    const { request } = screen;
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    // Every screen of an app is painted by the same design: the developer's file, or the same draw of Jev's mix.
    const design = this.choice === CUSTOM && this.markdown.trim() ? { markdown: this.markdown } : { brief: this.app, seed: this.seed };
    const note = (tone: "bad" | "plain", text: string, at = 0) => void (screen.log = [...screen.log, { kind: "note", at, tone, text }]);
    try {
      await streamEvents({ ...request, ...design }, abort.signal, (event) => {
        switch (event.type) {
          case "design":
            this.designRequest++; // a reading in flight is older than this one
            this.applyDesign(event.report, event.markdown);
            screen.builtWith = event.report.structure;
            break;
          case "a2ui": {
            screen.messages.push(event.message);
            const message = event.message as Record<string, any>;
            const root = message.updateComponents?.components.find((c: any) => c.id === "root");
            if (root) {
              screen.firstPaintMs ??= event.at;
              screen.dialog = Boolean(root.dialog);
              screen.topLevel = Boolean(root.navBar);
            }
            const data = message.updateDataModel;
            if (data?.path === "/header" && data.value?.title) screen.title = data.value.title;
            // The first screen with a navigation bar establishes it for the app, symbols included once they arrive.
            if (data?.path === "/nav" && Array.isArray(data.value?.items) && !request.journey?.nav) {
              this.nav = { items: data.value.items };
              const active = data.value.items[data.value.active ?? 0]?.label;
              if (active) this.screens.set(`nav:${active}`, screen);
            }
            break;
          }
          case "trace":
            screen.log = [...screen.log, { kind: "stage", decisions: [], ...event }];
            if (event.stage === "Jev: plan the screen") screen.archetype = event.decisions?.find((d) => d.id === "archetype")?.answer ?? "";
            break;
          case "invalid":
            for (const text of event.errors) note("bad", text, event.at);
            break;
          case "error":
            note("bad", event.message, event.at);
            break;
          case "done":
            screen.stats = event.stats;
            break;
        }
        this.tick++;
      });
    } catch (error) {
      if (!abort.signal.aborted) note("bad", (error as Error).message);
    } finally {
      screen.running = false;
      // A screen abandoned before it was planned would be a dead end; forget it so the tap can be tried again.
      if (!screen.messages.length) this.screens.delete(screen.key);
      this.tick++;
    }
  }

  /** A baked component that throws is the one way a mock can be wrong; say so where the rest of the run is reported. */
  private broke(detail: { name?: string; message: string }) {
    const screen = this.current;
    if (!screen) return;
    screen.log = [...screen.log, { kind: "note", at: 0, tone: "bad", text: `"${detail.name ?? "custom component"}" failed in the browser: ${detail.message}. Regenerate the page to bake it again.` }];
    this.tick++;
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
    const options = [
      { id: AUTO, name: "Jev's mix" },
      { id: CUSTOM, name: "My DESIGN.md" },
    ];
    return html`
      <section class="design">
        <h2>Design <small>${this.designBusy ? "mixing…" : (this.report?.name ?? "")}</small></h2>
        <div class="segmented" role="radiogroup" aria-label="Design system">
          ${options.map(
            (o) => html`<button role="radio" aria-checked=${this.choice === o.id} @click=${() => this.choose(o.id)}>${o.name}</button>`,
          )}
        </div>
        <p class="hint">
          ${this.choice === AUTO
            ? html`Jev rates the brief on hue, vividness, warmth, roundness and whitespace, and the ratings become a DESIGN.md.
                <button class="remix" ?disabled=${!(this.app || this.prompt.trim())} @click=${() => this.remix()} title="Draw another design from the same ratings">
                  ↻ Remix
                </button>`
            : "Paste your project's DESIGN.md below: tokens paint the mock, and Jev reads the prose for what tokens cannot say."}
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
        ${!this.current?.log.length ? html`<p class="hint">Every decision Jev makes shows up here, with its probability.</p>` : nothing}
        ${(this.current?.log ?? []).map((entry) =>
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
    const here = this.current;
    const s = here?.stats;
    const theme = this.report?.theme;
    const frame = theme ? { ...theme.vars, "color-scheme": theme.colorScheme, background: theme.vars["--k-page"] } : {};
    const painted = Boolean(here?.firstPaintMs !== undefined);
    const stale = painted && !here!.running && this.report && here!.builtWith !== undefined && this.report.structure !== here!.builtWith;
    // A dialog sits over the screen it was opened from.
    const layers = here?.dialog && this.stack.length > 1 ? this.stack.slice(-2) : here ? [here] : [];
    const made = [...new Set(this.screens.values())];
    return html`
      <header class="top">
        <h1>jev2ui <small>describe a screen, get a mock, tap through it</small></h1>
        <a href="/compare.html">compare pipelines →</a>
      </header>
      <div class="workbench">
        <aside class="controls">
          <form
            class="prompt"
            @submit=${(e: Event) => {
              e.preventDefault();
              this.generate();
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
                  this.generate();
                }
              }}
            ></textarea>
            <button type="submit">${here?.running ? "Mocking…" : "Mock it"}</button>
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
            <!-- Every pill is there from the start, empty until its figure arrives, so the shelf never re-wraps and pushes the mock down. -->
            <div class="stats">
              <button class="again" ?disabled=${!here || here.running} @click=${() => this.regenerate()} title="Make this page again" aria-label="Regenerate this page">↻</button>
              <span class="pill first ${here?.firstPaintMs === undefined ? "pending" : ""}">first UI ${here?.firstPaintMs ?? "–"} ms</span>
              <span class="pill total ${s ? "" : "pending"}">done ${s?.totalMs ?? "–"} ms</span>
              <span class="pill cost ${s ? "" : "pending"}">${s?.jevCalls ?? "–"} Jev · ${s?.geminiOutputTokens ?? "–"} Gemini tok</span>
              <span class="pill verdict ${s ? (s.valid ? "good" : "bad") : "pending"}">${s && !s.valid ? "invalid tree" : "valid tree"}</span>
            </div>
            <div class="exports">
              <button ?disabled=${!painted} @click=${() => this.copy("a2ui", JSON.stringify(here!.messages, null, 2))}>
                ${this.copied === "a2ui" ? "Copied" : "Copy messages"}
              </button>
              <button ?disabled=${!theme} @click=${() => this.copy("css", this.themeCss())}>${this.copied === "css" ? "Copied" : "Copy theme CSS"}</button>
            </div>
          </div>
          ${made.length > 1
            ? html`<nav class="flow" aria-label="Screens made so far">
                ${made.map(
                  (screen) => html`<button
                    aria-current=${screen === here}
                    title=${screen.key}
                    @click=${() => {
                      this.stack = [screen];
                      this.tick++;
                    }}
                  >
                    ${screen.title || "…"}<small>${screen.archetype}</small>
                  </button>`,
                )}
              </nav>`
            : nothing}
          ${stale ? html`<p class="stale">This design lays the screen out differently. <button class="link" @click=${() => this.generate()}>Mock it again</button></p>` : nothing}
          <div class="device ${this.device}" style="max-width:${DEVICES[this.device]}px">
            <div class="screen" style=${styleMap(frame)} @kit-tap=${(e: CustomEvent) => this.follow(e.detail)} @kit-custom-error=${(e: CustomEvent) => this.broke(e.detail)}>
              ${repeat(
                layers,
                (screen) => screen.id,
                (screen, i) => html`<kit-surface class="layer ${screen.dialog && i > 0 ? "over" : ""}" data-screen=${screen.id} ?inert=${i < layers.length - 1}></kit-surface>`,
              )}
              ${painted ? nothing : html`<p class="empty">${here?.running ? "Planning the screen…" : "Describe a screen and it appears here. Then tap anything."}</p>`}
            </div>
          </div>
        </section>

        ${this.renderTrace()}
      </div>
    `;
  }
}
