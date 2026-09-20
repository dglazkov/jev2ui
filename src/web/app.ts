// The tool: a conversation on the left, the app it is about on the right (docs/chat-and-turns.md).
//
// The first thing typed makes an app. Everything typed after that changes it: the server is asked what the message
// means (shared/turn.ts) and answers with what to do, and what came of it is shown in the conversation as a receipt
// that code wrote from Jev's decisions. The tool only speaks, in Gemini's words, when it found nothing to do.
//
// A turn is whatever made or changed the app: a message, a tap that led to a screen nobody had made, a button.
// Walking around what is already made is not a turn. The turns are the app's history, and the last can be undone.

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { repeat } from "lit/directives/repeat.js";
import "./kit/surface.js";
import "./kit/kit.css";
import type { KitSurface } from "./kit/surface.js";
import type { A2uiMessage, Decision, RunStats } from "../shared/events.js";
import type { DesignReport, Theme } from "../shared/design.js";
import type { Journey, Via } from "../shared/journey.js";
import type { Baked } from "../shared/kit.js";
import type { SavedAbout, SavedApp, SavedTurn, Visibility } from "../shared/saved.js";
import { receiptOf, type Option, type PaintChange, type ReceiptLine, type TurnRequest, type TurnResponse } from "../shared/turn.js";
import { session, streamEvents } from "./session.js";

const EXAMPLES = [
  "Settings screen for a podcast app",
  "Checkout for a sneaker store, with order summary",
  "Home energy dashboard showing today's usage",
  "Find a dog walker: nearby walkers with ratings",
  "Recipe page for sourdough bread",
  "Kubernetes cluster health for on-call engineers",
  "Bedtime story picker for a kids' reading app",
];
/** Things to say to an app that is there, for someone who has not yet tried. */
const SUGGESTIONS = ["Make it lighter", "More playful", "Switch to dark mode", "Make the text shorter", "Add a settings page"];

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
  /** What it was made from, so that it can be made again; `notes` are what has been said about it since. */
  request: { prompt: string; journey?: Journey; fresh?: boolean; notes?: string[] };
}

/** Everything a turn can change, as it stood before the turn. Screens are replaced and never edited once made, so a copy of the map is enough. */
interface Before {
  app: string;
  nav: Journey["nav"];
  screens: Map<string, Screen>;
  stack: Screen[];
  nextId: number;
  choice: string;
  markdown: string;
  seed: number;
  change: PaintChange;
  report: DesignReport | undefined;
}

interface Turn extends Omit<SavedTurn, "outcome" | "decisions"> {
  outcome: SavedTurn["outcome"] | "pending";
  decisions: Decision[];
  /** Kept only while the session lasts: a turn of an app that was opened from a link cannot be undone. */
  before?: Before;
}

/** A button that backs out of a dialog goes back; it does not lead anywhere new. */
const BACKS_OUT = /^(cancel|close|back|dismiss|not now|no\b|never mind|keep|go back|done|ok)/i;
/** Top-bar actions that act in place. */
const IN_PLACE = new Set(["favorite", "more_vert", "share"]);
const EDITED = "Edited the DESIGN.md";

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
  @state() private draft = "";
  @state() private device: Device = "phone";
  /** Which of the panels over the conversation is open. */
  @state() private panel: "" | "design" | "saved" = "";

  @state() private choice: string = AUTO;
  @state() private markdown = "";
  @state() private report: DesignReport | undefined;
  @state() private designError = "";
  @state() private designBusy = false;
  /** Which draw of Jev's mix is showing: 0 is its best guess, anything else a remix. */
  @state() private seed = 0;
  /** What the person has asked to have changed about the mix. A remix keeps it. */
  private change: PaintChange = {};

  @state() private copied = "";
  /** Bumped whenever a screen or a turn changes; both are mutated in place as things arrive. */
  @state() private tick = 0;
  /** A message is being read. Screens may still be streaming; that does not stop the next message. */
  @state() private reading = false;

  // The session: what app this is, every screen made for it, the way back, and how it came to be.
  private app = "";
  private nav: Journey["nav"];
  private screens = new Map<string, Screen>();
  private stack: Screen[] = [];
  private turns: Turn[] = [];
  private nextId = 1;
  private nextTurn = 1;
  private shownTurns = 0;
  private abort: AbortController | undefined;
  private designRequest = 0;
  private editTimer: ReturnType<typeof setTimeout> | undefined;

  /** The saved app that is showing (shared/saved.ts), until the session moves on from it. */
  @state() private saved: SavedAbout | undefined;
  /** What the person has saved. */
  @state() private library: SavedAbout[] = [];
  @state() private saveError = "";
  /** What a visitor tapped that leads to a screen nobody has made. */
  @state() private unmade = "";
  /** The app a link names (`?app=<id>`), until it has been opened or has turned out not to be there. */
  private linked = new URLSearchParams(location.search).get("app");
  private libraryFor = "";

  constructor() {
    super();
    session.attach(this);
  }

  // Light DOM, so the theme variables set on the device frame reach the renderer.
  protected createRenderRoot() {
    return this;
  }

  private get current(): Screen | undefined {
    return this.stack.at(-1);
  }

  private get made(): Screen[] {
    return [...new Set(this.screens.values())];
  }

  protected willUpdate() {
    // Who is asking decides whether a private app opens, so a link waits until that is known.
    if (this.linked && session.state !== "loading") void this.openSaved(this.linked);
    if (session.state === "in" && this.libraryFor !== session.email) void this.loadLibrary();
  }

  protected updated() {
    const byId = new Map(this.made.map((screen) => [String(screen.id), screen]));
    for (const surface of this.querySelectorAll<KitSurface>("kit-surface")) {
      surface.theme = this.report?.theme;
      surface.sync(byId.get(surface.dataset.screen!)?.messages ?? []);
    }
    // The conversation follows its last turn.
    if (this.shownTurns !== this.turns.length) {
      this.shownTurns = this.turns.length;
      const turns = this.querySelector(".turns");
      turns?.scrollTo({ top: turns.scrollHeight, behavior: "smooth" });
    }
  }

  // --- Turns ------------------------------------------------------------------

  private asItStands(): Before {
    return { app: this.app, nav: this.nav, screens: new Map(this.screens), stack: [...this.stack], nextId: this.nextId, choice: this.choice, markdown: this.markdown, seed: this.seed, change: this.change, report: this.report };
  }

  /** Every turn starts here: what stood before it is kept, so that it can be undone. */
  private begin(source: Turn["source"], said: string): Turn {
    this.movedOn();
    const turn: Turn = { id: this.nextTurn++, source, said, outcome: "pending", lines: [], decisions: [], before: this.asItStands() };
    this.turns = [...this.turns, turn];
    return turn;
  }

  /** Takes back the last turn, whatever it was. */
  private undo() {
    const turn = this.turns.at(-1);
    if (!turn?.before) return;
    this.abort?.abort();
    this.designRequest++;
    const b = turn.before;
    Object.assign(this, { app: b.app, nav: b.nav, screens: b.screens, stack: b.stack, nextId: b.nextId, choice: b.choice, markdown: b.markdown, seed: b.seed, change: b.change, report: b.report });
    if (b.report) loadFonts(b.report.theme);
    this.turns = this.turns.slice(0, -1);
    this.movedOn();
    this.tick++;
  }

  /** What the person typed, or chose from what the tool offered. The first makes an app; the rest are about the one there is. */
  private async say(message = this.draft) {
    message = message.trim();
    if (!message || this.reading || !session.makes) return;
    this.draft = "";
    const here = this.current;
    const asked = this.turns.at(-1);
    const turn = this.begin("typed", message);
    if (!this.app || !here) return this.create(message, turn);

    this.reading = true;
    try {
      const request: TurnRequest = {
        message,
        app: this.app,
        design: this.customDesign ? { markdown: this.markdown } : { brief: this.app, seed: this.seed, change: this.change },
        showing: { title: here.title, archetype: here.archetype, decisions: [...here.log.flatMap((entry) => (entry.kind === "stage" ? entry.decisions : [])), ...(this.report?.decisions ?? [])].slice(0, 60).map(({ question, answer }) => ({ question, answer })) },
        // A message that follows a question of the tool's is the answer to it.
        ...(asked?.outcome === "said" && asked.options?.length && asked.text ? { answering: { message: asked.said, question: asked.text } } : {}),
      };
      const response = await session.fetch("/api/turn", { method: "POST", body: JSON.stringify(request) });
      if (!response.ok) throw new Error(await response.text());
      const answer = (await response.json()) as TurnResponse;
      // Undone while it was being read: there is nothing to answer.
      if (!this.turns.includes(turn)) return;
      turn.decisions = answer.decisions;
      turn.ms = answer.ms;
      if (answer.design) {
        this.change = answer.design.change;
        this.designRequest++;
        this.applyDesign(answer.design.report, answer.design.markdown);
        turn.lines = answer.design.receipt;
      }
      switch (answer.act) {
        case "paint":
          turn.outcome = "changed";
          break;
        case "talk":
          Object.assign(turn, { outcome: "said", text: answer.text, options: answer.options ?? [], on: here.title });
          break;
        case "app":
          this.create(message, turn);
          break;
        case "screen": {
          const screen = this.open(`asked:${turn.id}`, false, { prompt: this.app, journey: { app: this.app, from: { title: here.title, archetype: here.archetype }, via: { kind: "asked", label: message }, ...(this.nav ? { nav: this.nav } : {}) } });
          this.stack = [...this.stack, screen];
          void this.run(screen, turn);
          break;
        }
        case "remake":
          turn.on = here.title;
          void this.run(this.again(here, message), turn);
          break;
      }
    } catch (error) {
      Object.assign(turn, { outcome: "failed", text: (error as Error).message });
    } finally {
      this.reading = false;
      this.tick++;
    }
  }

  /** A new description starts a new app, with a design of its own. */
  private create(prompt: string, turn: Turn) {
    this.app = prompt;
    this.seed = 0;
    this.change = {};
    this.nav = undefined;
    this.screens = new Map();
    const screen = this.open("start", true, { prompt });
    this.stack = [screen];
    void this.run(screen, turn);
  }

  // --- Design -----------------------------------------------------------------

  private get customDesign() {
    return this.choice === CUSTOM && Boolean(this.markdown.trim());
  }

  private get designSource() {
    return this.customDesign ? { markdown: this.markdown } : { brief: this.app, seed: this.seed, change: this.change };
  }

  /** The design is either Jev's mix for this app or the developer's own DESIGN.md. */
  private choose(choice: string) {
    if (choice === this.choice) return;
    const turn = this.app ? this.begin("button", choice === AUTO ? "Switched to Jev's mix" : "Switched to my DESIGN.md") : undefined;
    this.choice = choice;
    this.designError = "";
    if (choice === CUSTOM) this.markdown = localStorage.getItem(STORED_DESIGN) ?? this.markdown;
    if (choice === AUTO ? this.app : this.markdown.trim()) void this.loadDesign(this.designSource, turn);
    else if (turn) turn.outcome = "changed";
  }

  /** Another draw from what Jev thinks suits the brief. The screens stay, and so does whatever the person asked for; the rest of the paint changes. */
  private remix() {
    if (!this.app) return;
    const turn = this.begin("button", "Remixed the design");
    this.choice = AUTO;
    this.seed = 1 + Math.floor(Math.random() * 0xfffffff);
    void this.loadDesign(this.designSource, turn);
  }

  private edit(markdown: string) {
    // Typing is one turn however many keys it takes.
    const last = this.turns.at(-1);
    const turn = !this.app ? undefined : last?.said === EDITED ? last : this.begin("button", EDITED);
    this.markdown = markdown;
    this.choice = CUSTOM;
    localStorage.setItem(STORED_DESIGN, markdown);
    clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => void this.loadDesign({ markdown }, turn), 700);
  }

  private async loadDesign(source: { markdown: string } | { brief: string; seed: number; change: PaintChange }, turn?: Turn) {
    const request = ++this.designRequest;
    const was = turn?.before?.report?.decisions ?? [];
    this.designBusy = true;
    try {
      const response = await session.fetch("/api/design", { method: "POST", body: JSON.stringify(source) });
      if (!response.ok) throw new Error(await response.text());
      const { report, markdown } = await response.json();
      if (request !== this.designRequest) return;
      this.applyDesign(report, markdown);
      this.designError = "";
      if (turn) Object.assign(turn, { outcome: "changed", lines: receiptOf(was, report.decisions) });
    } catch (error) {
      if (request !== this.designRequest) return;
      this.designError = (error as Error).message;
      if (turn) Object.assign(turn, { outcome: "failed", text: this.designError });
    } finally {
      if (request === this.designRequest) this.designBusy = false;
      this.tick++;
    }
  }

  private applyDesign(report: DesignReport, mixedMarkdown?: string) {
    this.report = report;
    if (mixedMarkdown) this.markdown = mixedMarkdown;
    loadFonts(report.theme);
  }

  // --- Screens ----------------------------------------------------------------

  private open(key: string, topLevel: boolean, request: Screen["request"]): Screen {
    const screen: Screen = { id: this.nextId++, key, title: "", archetype: "", topLevel, dialog: false, messages: [], log: [], running: true, request };
    this.screens.set(key, screen);
    return screen;
  }

  private show(screen: Screen) {
    this.stack = [screen];
    this.unmade = "";
    this.tick++;
  }

  /** What a tap does: go back, show the screen this tap made before, or have a new one made. Only the last is a turn. */
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
    // Looking is free; a screen nobody has made yet takes a run, and a run takes a name.
    if (made && !session.makes) return void (this.unmade = via.label);
    this.unmade = "";
    const turn = made ? this.begin("tap", via.kind === "back" ? `Went back from “${here.title}”` : `Tapped “${String(via.data?.title ?? via.label)}”`) : undefined;
    screen ??= this.open(key, via.kind === "nav", { prompt: this.app, journey: { app: this.app, from: { title: here.title, archetype: here.archetype }, via, ...(this.nav ? { nav: this.nav } : {}) } });
    // The navigation bar switches between main screens, and a way back from the first screen makes the one it came from. Everything else drills in.
    this.stack = via.kind === "nav" || via.kind === "back" ? [screen] : [...this.stack, screen];
    // The home made by going back from a settings page leads back to that page, not to a second one.
    if (made && via.kind === "back" && here.archetype === "settings") this.screens.set(`${screen.id}:appbar:settings`, here);
    this.tick++;
    if (made) void this.run(screen, turn);
  }

  /**
   * A screen to take the place of `old`, made from the same request, or from that and a `note` of what was asked for.
   * Whatever was reached from the old one goes with it.
   */
  private again(old: Screen, note?: string): Screen {
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
    // Made again as it was means made anew: a custom component is baked afresh. Made again with a note, what was baked may well still do.
    const screen = this.open(old.key, old.topLevel, note ? { ...request, fresh: false, notes: [...(request.notes ?? []), note] } : { ...request, fresh: true });
    for (const key of aliases) this.screens.set(key, screen);
    this.stack = this.stack.map((one) => (one === old ? screen : one));
    this.tick++;
    return screen;
  }

  private regenerate() {
    const old = this.current;
    if (!old) return;
    const turn = this.begin("button", "Made this screen again");
    turn.on = old.title;
    void this.run(this.again(old), turn);
  }

  /**
   * What has been baked for this app: the components its screens define. Read from the screens and kept nowhere else,
   * so a screen that is forgotten takes its component with it, and whatever holds the screens holds the shelf.
   */
  private get shelf(): Baked[] {
    const shelf = new Map<string, Baked>();
    for (const screen of this.screens.values())
      for (const message of screen.messages as Array<Record<string, any>>) {
        if (!message.defineComponent) continue;
        const { surfaceId, ...baked } = message.defineComponent;
        shelf.set(baked.id, baked);
      }
    return [...shelf.values()];
  }

  private async run(screen: Screen, turn?: Turn) {
    if (turn) turn.screen = screen.id;
    // A screen made anew has no use for the shelf; any other is told what the app has baked, as of now.
    const shelf = screen.request.journey && !screen.request.fresh ? this.shelf : [];
    const request = shelf.length ? { ...screen.request, journey: { ...screen.request.journey!, shelf } } : screen.request;
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    const note = (tone: "bad" | "plain", text: string, at = 0) => void (screen.log = [...screen.log, { kind: "note", at, tone, text }]);
    try {
      // Every screen of an app is painted by the same design: the developer's file, or the same draw of Jev's mix with what they have asked of it.
      await streamEvents({ ...request, ...this.designSource }, abort.signal, (event) => {
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
      if (!abort.signal.aborted) {
        note("bad", (error as Error).message);
        if (turn && !screen.messages.length) turn.text = (error as Error).message;
      }
    } finally {
      screen.running = false;
      // A screen abandoned before it was planned would be a dead end; forget it so the tap can be tried again.
      if (!screen.messages.length) {
        // Unless the turn was undone meanwhile, and the key is again the screen it replaced.
        if (this.screens.get(screen.key) === screen) this.screens.delete(screen.key);
        this.stack = this.stack.filter((one) => one !== screen);
      }
      if (turn && turn.outcome === "pending") turn.outcome = screen.messages.length ? (turn.on ? "changed" : "made") : "failed";
      this.tick++;
    }
  }

  /** A baked component that throws is the one way a mock can be wrong; say so where the rest of the run is reported. */
  private broke(detail: { name?: string; message: string }) {
    const screen = this.current;
    if (!screen) return;
    screen.log = [...screen.log, { kind: "note", at: 0, tone: "bad", text: `"${detail.name ?? "custom component"}" failed in the browser: ${detail.message}. Make the screen again to bake it again.` }];
    this.tick++;
  }

  // --- Saved apps -------------------------------------------------------------

  /** The session as it would be saved: every screen that got as far as being drawn, each of the ways to it, and the turns that made it. */
  private snapshot(): SavedApp {
    const kept = this.made.filter((screen) => !screen.running && screen.messages.length);
    const ids = new Set(kept.map((screen) => screen.id));
    const stack = this.stack.filter((screen) => ids.has(screen.id)).map((screen) => screen.id);
    // Only the turns of this app: a conversation may have been through other apps on its way here.
    const from = this.turns.findLastIndex((turn) => turn.before?.app !== undefined && turn.before.app !== this.app);
    const turns = this.turns.slice(Math.max(0, from)).filter((turn): turn is Turn & { outcome: SavedTurn["outcome"] } => turn.outcome !== "pending");
    return {
      version: 2,
      app: this.app,
      ...(this.nav ? { nav: this.nav } : {}),
      design: { choice: this.choice, markdown: this.markdown, seed: this.seed, change: this.change as Record<string, unknown>, ...(this.report ? { report: this.report as unknown as Record<string, unknown> } : {}) },
      screens: kept.map(({ running, key, ...screen }) => ({ ...screen, keys: [...this.screens].filter(([, other]) => other.id === screen.id).map(([k]) => k) })) as unknown as SavedApp["screens"],
      stack: stack.length ? stack : [kept[0].id],
      turns: turns.slice(-400).map(({ before, screen, ...turn }) => ({ ...turn, ...(screen && ids.has(screen) ? { screen } : {}), decisions: turn.decisions.slice(0, 80) as unknown as Array<Record<string, unknown>> })),
    };
  }

  private restore(app: SavedApp) {
    this.abort?.abort();
    this.app = app.app;
    this.nav = app.nav;
    this.choice = app.design.choice === CUSTOM ? CUSTOM : AUTO;
    this.markdown = app.design.markdown;
    this.seed = app.design.seed;
    this.change = (app.design.change ?? {}) as PaintChange;
    this.designRequest++;
    if (app.design.report) this.applyDesign(app.design.report as unknown as DesignReport);
    this.screens = new Map();
    const byId = new Map<number, Screen>();
    for (const { keys, ...saved } of app.screens) {
      const screen = { ...saved, key: keys[0], running: false } as unknown as Screen;
      byId.set(screen.id, screen);
      for (const key of keys) this.screens.set(key, screen);
    }
    this.nextId = Math.max(...byId.keys()) + 1;
    this.stack = app.stack.map((id) => byId.get(id)!).filter(Boolean);
    // An app saved before there was a conversation has the one turn it must have had.
    this.turns = (app.turns as unknown as Turn[] | undefined) ?? [{ id: 1, source: "typed", said: app.app, outcome: "made", lines: [], decisions: [], screen: app.screens[0].id }];
    this.nextTurn = Math.max(...this.turns.map((turn) => turn.id)) + 1;
    this.tick++;
  }

  /** The session is no longer the saved app that was showing: something was made, or changed. */
  private movedOn() {
    if (!this.saved && !new URLSearchParams(location.search).has("app")) return;
    this.saved = undefined;
    history.replaceState(null, "", location.pathname);
  }

  private async openSaved(id: string) {
    this.linked = null;
    try {
      const response = await session.fetch(`/api/apps/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(await response.text());
      const { about, app } = (await response.json()) as { about: SavedAbout; app: SavedApp };
      this.restore(app);
      this.saved = about;
      this.saveError = "";
      this.panel = "";
      history.replaceState(null, "", `?app=${about.id}`);
    } catch (error) {
      this.saveError = (error as Error).message;
    }
  }

  private async loadLibrary() {
    this.libraryFor = session.email;
    const response = await session.fetch("/api/apps").catch(() => undefined);
    if (response?.ok) this.library = (await response.json()).apps;
  }

  /** Saves the session, and with `share` lets anyone who has the link open it; the link goes to the clipboard. */
  private async save(share: boolean) {
    try {
      const response = await session.fetch("/api/apps", { method: "POST", body: JSON.stringify(this.snapshot()) });
      if (!response.ok) throw new Error(await response.text());
      const { id } = await response.json();
      if (share) await this.setVisibility(id, "link");
      await this.loadLibrary();
      this.saved = this.library.find((one) => one.id === id);
      this.saveError = "";
      history.replaceState(null, "", `?app=${id}`);
      if (share) await this.copy("share", this.linkTo(id));
      else this.flash("save");
    } catch (error) {
      this.saveError = (error as Error).message;
    }
  }

  private linkTo(id: string) {
    return `${location.origin}/?app=${id}`;
  }

  private async setVisibility(id: string, visibility: Visibility) {
    const response = await session.fetch(`/api/apps/${id}`, { method: "PATCH", body: JSON.stringify({ visibility }) });
    if (!response.ok) throw new Error(await response.text());
    this.library = this.library.map((one) => (one.id === id ? { ...one, visibility } : one));
    if (this.saved?.id === id) this.saved = { ...this.saved, visibility };
  }

  private async forget(id: string) {
    const response = await session.fetch(`/api/apps/${id}`, { method: "DELETE" });
    if (!response.ok) return void (this.saveError = await response.text());
    this.library = this.library.filter((one) => one.id !== id);
    if (this.saved?.id === id) this.movedOn();
  }

  private async copy(what: string, text: string) {
    await navigator.clipboard.writeText(text);
    this.flash(what);
  }

  /** Says for a moment, on the button that did it, that a thing was done. */
  private flash(what: string) {
    this.copied = what;
    setTimeout(() => (this.copied = ""), 1200);
  }

  private themeCss() {
    const theme = this.report!.theme;
    const lines = Object.entries(theme.vars).map(([k, v]) => `  ${k}: ${v};`);
    return `.mock {\n  color-scheme: ${theme.colorScheme};\n  font-family: ${theme.fontFamily};\n${lines.join("\n")}\n}\n`;
  }

  // --- Rendering ----------------------------------------------------------------

  private renderDecisions(decisions: Decision[]) {
    return html`<table>
      ${decisions.map(
        (d) => html`<tr title=${d.note ?? ""}>
          <td>${d.question}${d.note ? html`<em>${d.note}</em>` : nothing}</td>
          <td class="answer">${d.answer}</td>
          <td class="bar"><span style="width:${Math.round(d.p * 100)}%"></span></td>
        </tr>`,
      )}
    </table>`;
  }

  /** Everything that went into a screen, as it was told while it was made. */
  private renderLog(screen: Screen) {
    return screen.log.map((entry) =>
      entry.kind === "note"
        ? html`<p class="note ${entry.tone}">${entry.text}</p>`
        : html`<section class="stage-entry">
            <h3>
              ${entry.stage}
              <small>at ${entry.at} ms${entry.ms ? ` · took ${entry.ms} ms` : ""}${entry.detail ? ` · ${entry.detail}` : ""}${entry.tokens?.input ? ` · ${entry.tokens.input} in tok` : ""}</small>
            </h3>
            ${entry.decisions.length ? this.renderDecisions(entry.decisions) : nothing}
          </section>`,
    );
  }

  private renderTurn(turn: Turn, last: boolean) {
    const screen = turn.screen ? this.made.find((one) => one.id === turn.screen) : undefined;
    const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
    const bad = [...(screen?.log ?? [])].filter((entry) => entry.kind === "note" && entry.tone === "bad").length;
    const reply: TemplateResult[] = [];
    if (turn.lines.length)
      reply.push(html`<ul class="receipt">
        ${turn.lines.map((line) => html`<li><b>${line.what}</b> <span class="from">${line.from}</span> → <span class="to">${line.to}</span></li>`)}
      </ul>`);
    if (screen)
      reply.push(html`<p class="made">
        <button class="link" @click=${() => this.show(screen)} title="Show this screen">${screen.title || (screen.running ? "Planning the screen…" : "A screen")}</button>
        ${screen.archetype ? html`<small>${screen.archetype}</small>` : nothing}
        <small>${screen.running ? "making…" : screen.stats ? `${turn.on ? "made again" : "made"} in ${seconds(screen.stats.totalMs)}` : ""}${bad ? ` · ${bad} ${bad === 1 ? "problem" : "problems"}` : ""}</small>
      </p>`);
    else if (turn.screen && turn.outcome !== "pending") reply.push(html`<p class="made gone"><small>The screen this made has since been made again.</small></p>`);
    if (turn.outcome === "changed" && !turn.lines.length && !turn.screen) reply.push(html`<p class="hint">Nothing looks different for it.</p>`);
    if (turn.text) reply.push(html`<p class=${turn.outcome === "failed" ? "note bad" : "spoken"}>${turn.text}</p>`);
    if (turn.options?.length)
      reply.push(html`<div class="options">
        ${turn.options.map((option: Option) => html`<button ?disabled=${this.reading || !session.makes} title=${option.instruction} @click=${() => this.say(option.instruction)}>${option.label}</button>`)}
      </div>`);
    if (turn.outcome === "pending" && !screen) reply.push(html`<p class="hint working">Reading what you meant…</p>`);
    const count = turn.decisions.length + (screen?.log.reduce((sum, entry) => sum + (entry.kind === "stage" ? entry.decisions.length : 0), 0) ?? 0);
    return html`<article class="turn ${turn.source} ${turn.outcome}">
      <p class="said">${turn.said}</p>
      <div class="reply">
        ${turn.on && !turn.lines.length && !screen ? html`<small class="on">on ${turn.on}</small>` : nothing} ${reply}
        <footer>
          ${count
            ? html`<details class="why">
                <summary>${count} ${count === 1 ? "decision" : "decisions"}${turn.ms ? ` · read in ${turn.ms} ms` : ""}</summary>
                ${turn.decisions.length ? this.renderDecisions(turn.decisions) : nothing} ${screen ? this.renderLog(screen) : nothing}
              </details>`
            : nothing}
          ${last && turn.before && turn.outcome !== "pending" && session.makes ? html`<button class="link undo" @click=${() => this.undo()}>undo</button>` : nothing}
        </footer>
      </div>
    </article>`;
  }

  private renderDesign() {
    const problems = this.report?.findings.filter((f) => f.severity !== "info") ?? [];
    const options = [
      { id: AUTO, name: "Jev's mix" },
      { id: CUSTOM, name: "My DESIGN.md" },
    ];
    const asked = [...Object.entries(this.change.dials ?? {}).filter(([, by]) => by), ...Object.entries(this.change.pins ?? {})];
    return html`
      <section class="panel design">
        <div class="segmented" role="radiogroup" aria-label="Design system">
          ${options.map((o) => html`<button role="radio" aria-checked=${this.choice === o.id} @click=${() => this.choose(o.id)}>${o.name}</button>`)}
        </div>
        <p class="hint">
          ${this.choice === AUTO
            ? html`Jev rates the brief on hue, vividness, warmth, roundness and whitespace, and the ratings become a DESIGN.md. Say what you would change, or
                <button class="remix" ?disabled=${!this.app} @click=${() => this.remix()} title="Draw another design from the same ratings; what you have asked for stays">↻ remix</button> it.`
            : "Paste your project's DESIGN.md below: tokens paint the mock, and Jev reads the prose for what tokens cannot say."}
        </p>
        ${this.choice === AUTO && asked.length
          ? html`<p class="hint">Yours, and kept by a remix: ${asked.map(([key, value]) => (typeof value === "number" ? `${key} ${value > 0 ? "+" : ""}${value.toFixed(2)}` : `${key} ${value === true ? "yes" : value === false ? "no" : value}`)).join(" · ")}</p>`
          : nothing}
        ${this.designError ? html`<p class="note bad">${this.designError}</p>` : nothing}
        ${problems.map((f) => html`<p class="note ${f.severity === "error" ? "bad" : "warn"}">${f.severity}: ${f.message}</p>`)}
        <div class="editor">
          <textarea
            spellcheck="false"
            aria-label="DESIGN.md"
            placeholder="Paste your project's DESIGN.md here."
            .value=${this.markdown}
            @input=${(e: InputEvent) => this.edit((e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </div>
      </section>
    `;
  }

  private renderLibrary() {
    return html`
      <section class="panel library">
        ${this.library.length ? nothing : html`<p class="hint">Nothing saved yet. Save keeps an app, every screen and turn of it; Share also lets anyone with the link open it.</p>`}
        ${this.library.map(
          (one) => html`<div class="saved" aria-current=${one.id === this.saved?.id}>
            <button class="open" title=${one.title} @click=${() => this.openSaved(one.id)}>${one.title}<small>${one.screens} ${one.screens === 1 ? "screen" : "screens"} · ${new Date(one.created).toLocaleDateString()}</small></button>
            <span class="acts">
              <button class="link" title=${one.visibility === "link" ? "Anyone with the link can open it. Make it yours alone again." : "Only you can open it. Let anyone with the link."} @click=${() => this.setVisibility(one.id, one.visibility === "link" ? "private" : "link").catch((error) => (this.saveError = error.message))}>
                ${one.visibility === "link" ? "shared" : "private"}
              </button>
              ${one.visibility === "link" ? html`<button class="link" @click=${() => this.copy(`link:${one.id}`, this.linkTo(one.id))}>${this.copied === `link:${one.id}` ? "copied" : "copy link"}</button>` : nothing}
              <button class="link" @click=${() => this.forget(one.id)}>delete</button>
            </span>
          </div>`,
        )}
      </section>
    `;
  }

  /** What someone who cannot make things sees in place of the box to type in: what they are looking at, and the way in. */
  private renderVisitor() {
    return html`
      <section class="visitor">
        <p class="hint">
          ${this.saved?.screens} ${this.saved?.screens === 1 ? "screen" : "screens"}, made by ${this.saved?.owner || "someone"}. Tap through it: every screen that was made is here, and above is how it was made.
        </p>
        ${session.state === "out"
          ? html`<p class="hint">Making and changing things takes a name, and a place on the list.</p>
              <button class="primary" @click=${() => session.signIn()}>Sign in with Google</button>`
          : nothing}
        ${session.state === "stranger" ? html`<p class="hint">You are signed in as ${session.email}, which is not on the list of people who can make things here.</p>` : nothing}
      </section>
    `;
  }

  private renderChat() {
    const vars = this.report?.theme.vars;
    const swatches = vars ? [vars["--k-page"], vars["--k-card"], vars["--k-text"], vars["--k-accent"], vars["--k-border"]] : [];
    const toggle = (panel: "design" | "saved") => (this.panel = this.panel === panel ? "" : panel);
    const chips = this.app ? SUGGESTIONS : EXAMPLES;
    return html`
      <aside class="chat">
        <div class="chat-head">
          <button class="tab" aria-expanded=${this.panel === "design"} ?disabled=${!session.makes} @click=${() => toggle("design")}>
            <span class="swatches">${swatches.map((value) => html`<i style="background:${value}"></i>`)}</span>
            ${this.designBusy ? "mixing…" : (this.report?.name ?? "Design")}
          </button>
          ${session.state === "in" ? html`<button class="tab" aria-expanded=${this.panel === "saved"} @click=${() => toggle("saved")}>Saved${this.library.length ? ` (${this.library.length})` : ""}</button>` : nothing}
        </div>
        ${this.panel === "design" ? this.renderDesign() : this.panel === "saved" ? this.renderLibrary() : nothing}
        ${this.saveError ? html`<p class="note bad pad">${this.saveError}</p>` : nothing}
        <div class="turns" ?hidden=${this.panel !== ""}>
          ${this.turns.length
            ? repeat(
                this.turns,
                (turn) => turn.id,
                (turn, i) => this.renderTurn(turn, i === this.turns.length - 1),
              )
            : html`<p class="hint opening">Say what you want to see: an app, or one screen of one. It appears on the right. Then say what to change (“make it lighter”, “more playful”, “add a settings page”), or tap anything in it.</p>`}
        </div>
        ${session.makes
          ? html`<form
              class="say"
              ?hidden=${this.panel !== ""}
              @submit=${(e: Event) => {
                e.preventDefault();
                void this.say();
              }}
            >
              <div class="chips">${chips.map((chip) => html`<button type="button" ?disabled=${this.reading} @click=${() => this.say(chip)}>${chip}</button>`)}</div>
              <div class="box">
                <textarea
                  rows="2"
                  aria-label=${this.app ? "Say what to change" : "Describe an app or a screen"}
                  placeholder=${this.app ? "Say what to change, or describe another app…" : "Describe an app, or a screen of one…"}
                  .value=${this.draft}
                  @input=${(e: InputEvent) => (this.draft = (e.target as HTMLTextAreaElement).value)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void this.say();
                    }
                  }}
                ></textarea>
                <button type="submit" ?disabled=${this.reading || !this.draft.trim()} aria-label="Send">↑</button>
              </div>
            </form>`
          : this.renderVisitor()}
      </aside>
    `;
  }

  render() {
    // A saved app is for anyone its owner shares it with, signed in or not; everything else waits for a name.
    const gate = this.saved || this.linked ? undefined : session.gate();
    if (gate) return html`${gate}${this.saveError ? html`<p class="gate-note note bad">${this.saveError}</p>` : nothing}`;
    const here = this.current;
    const s = here?.stats;
    const theme = this.report?.theme;
    const frame = theme ? { ...theme.vars, "color-scheme": theme.colorScheme, background: theme.vars["--k-page"] } : {};
    const painted = Boolean(here?.firstPaintMs !== undefined);
    const stale = painted && !here!.running && this.report && here!.builtWith !== undefined && this.report.structure !== here!.builtWith;
    // A dialog sits over the screen it was opened from.
    const layers = here?.dialog && this.stack.length > 1 ? this.stack.slice(-2) : here ? [here] : [];
    const made = this.made;
    return html`
      <header class="top">
        <h1>jev2ui <small>say what you want, get an app, keep talking</small></h1>
        <span class="aside">${session.badge()}</span>
      </header>
      <div class="bench">
        ${this.renderChat()}
        <section class="stage">
          <div class="toolbar">
            <div class="segmented" role="radiogroup" aria-label="Device">
              ${(Object.keys(DEVICES) as Device[]).map((d) => html`<button role="radio" aria-checked=${this.device === d} @click=${() => (this.device = d)}>${d}</button>`)}
            </div>
            <!-- Every pill is there from the start, empty until its figure arrives, so the shelf never re-wraps and pushes the mock down. -->
            <div class="stats">
              <button class="again" ?disabled=${!here || here.running || !session.makes} @click=${() => this.regenerate()} title="Make this screen again" aria-label="Make this screen again">↻</button>
              <span class="pill first ${here?.firstPaintMs === undefined ? "pending" : ""}">first UI ${here?.firstPaintMs ?? "–"} ms</span>
              <span class="pill total ${s ? "" : "pending"}">done ${s?.totalMs ?? "–"} ms</span>
              <span class="pill cost ${s ? "" : "pending"}">${s?.jevCalls ?? "–"} Jev · ${s?.geminiOutputTokens ?? "–"} Gemini tok</span>
              <span class="pill verdict ${s ? (s.valid ? "good" : "bad") : "pending"}">${s && !s.valid ? "invalid tree" : "valid tree"}</span>
            </div>
            <div class="exports">
              ${session.state === "in"
                ? html`<button ?disabled=${!painted || here!.running} @click=${() => this.save(false)} title="Keep this app, every screen and turn of it, to open again">${this.copied === "save" ? "Saved" : "Save"}</button>
                    <button ?disabled=${!painted || here!.running} @click=${() => this.save(true)} title="Save it, and let anyone with the link open it: they need not sign in">${this.copied === "share" ? "Link copied" : "Share"}</button>`
                : nothing}
              <button ?disabled=${!painted} @click=${() => this.copy("a2ui", JSON.stringify(here!.messages, null, 2))}>${this.copied === "a2ui" ? "Copied" : "Copy messages"}</button>
              <button ?disabled=${!theme} @click=${() => this.copy("css", this.themeCss())}>${this.copied === "css" ? "Copied" : "Copy theme CSS"}</button>
              <button ?disabled=${!this.markdown} @click=${() => this.copy("design", this.markdown)}>${this.copied === "design" ? "Copied" : "Copy DESIGN.md"}</button>
            </div>
          </div>
          ${made.length > 1
            ? html`<nav class="flow" aria-label="Screens made so far">
                ${made.map((screen) => html`<button aria-current=${screen === here} title=${screen.key} @click=${() => this.show(screen)}>${screen.title || "…"}<small>${screen.archetype}</small></button>`)}
              </nav>`
            : nothing}
          ${this.unmade && !session.makes
            ? html`<p class="stale">
                Nobody has made the screen that "${this.unmade}" leads to, and making one takes a name.
                ${session.state === "out" ? html`<button class="link" @click=${() => session.signIn()}>Sign in with Google</button>` : nothing}
              </p>`
            : nothing}
          ${stale && session.makes ? html`<p class="stale">This design lays the screen out differently. <button class="link" @click=${() => this.regenerate()}>Make it again</button></p>` : nothing}
          <div class="device ${this.device}" style="max-width:${DEVICES[this.device]}px">
            <div class="screen" style=${styleMap(frame)} @kit-tap=${(e: CustomEvent) => this.follow(e.detail)} @kit-custom-error=${(e: CustomEvent) => this.broke(e.detail)}>
              ${repeat(
                layers,
                (screen) => screen.id,
                (screen, i) => html`<kit-surface class="layer ${screen.dialog && i > 0 ? "over" : ""}" data-screen=${screen.id} ?inert=${i < layers.length - 1}></kit-surface>`,
              )}
              ${painted ? nothing : html`<p class="empty">${here?.running ? "Planning the screen…" : "What you ask for appears here. Then tap anything."}</p>`}
            </div>
          </div>
        </section>
      </div>
    `;
  }
}
