import { withCatalog, withRenderedScreens, connectDestination } from "../shared/catalog.js";
import type { DestinationEvidence } from "../shared/identity.js";
// The tool: a conversation on the left, the app it is about on the right (docs/chat-and-turns.md).
//
// The first thing typed makes an app. Everything typed after that changes it: the server is asked what the message
// means (shared/turn.ts) and answers with what to do, and what came of it is shown in the conversation as a receipt
// that code wrote from Jev's decisions. The tool only speaks, in Gemini's words, when it found nothing to do.
//
// A turn is whatever made or changed the app: a message, a tap that led to a screen nobody had made, a button.
// Walking around what is already made is not a turn. The turns are the app's history, and the last can be undone.

import "./app-map.js";
import { architectureIcon, architectureNav, boundScreens, rebaseRoutes, type Architecture, type ScreenRoutes } from "../shared/architecture.js";
import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { repeat } from "lit/directives/repeat.js";
import "./surface.js";
import "./settings.js";
import { paintIn, stylesOf } from "./kit/idioms.js";
import { IDIOMS, IDIOM_IDS, idiomNamed, isIdiom, type IdiomId } from "../shared/idioms.js";
import type { Surface } from "./surface.js";
import { named, type A2uiMessage, type Decision, type Endpoint, type PipelineEvent, type RunStats } from "../shared/events.js";
import type { DesignReport, Theme } from "../shared/design.js";
import type { Journey, Via } from "../shared/journey.js";
import type { Baked } from "../shared/components.js";
import type { SavedAbout, SavedApp, SavedTurn, Visibility } from "../shared/saved.js";
import { receiptOf, type Option, type PaintChange, type ScreenAbout, type TurnRequest, type TurnResponse } from "../shared/turn.js";
import { session, streamEvents } from "./session.js";
import { face, icon, mark, titled } from "./chrome.js";
import { DEVICES, DEVICE_ICONS, firstDevice, type Device, type Section } from "./settings.js";

/** Things to ask for, each with a symbol of what it is. */
const EXAMPLES: Array<[string, string]> = [
  ["podcasts", "Settings screen for a podcast app"],
  ["shopping_bag", "Checkout for a sneaker store, with order summary"],
  ["bolt", "Home energy dashboard showing today's usage"],
  ["pets", "Find a dog walker: nearby walkers with ratings"],
  ["bakery_dining", "Recipe page for sourdough bread"],
  ["dns", "Kubernetes cluster health for on-call engineers"],
  ["auto_stories", "Bedtime story picker for a kids' reading app"],
];
/** Things to say to an app that is there, for someone who has not yet tried. */
const SUGGESTIONS: Array<[string, string]> = [
  ["light_mode", "Make it lighter"],
  ["celebration", "Make it more playful"],
  ["dark_mode", "Switch to dark mode"],
  ["short_text", "Make the text shorter"],
  ["add_to_queue", "Add a settings page"],
];

/** A symbol for some kinds of screen, and the idiom's own symbol for a kind this file has not heard of. */
const ARCHETYPE_ICONS: Record<string, string> = { feed: "view_agenda", dashboard: "dashboard", detail: "article", guide: "menu_book", settings: "tune", form: "edit_note", checkout: "shopping_cart", result: "task_alt", confirm: "help" };
const screenIcon = (archetype: string, idiom: IdiomId) => ARCHETYPE_ICONS[archetype] ?? IDIOMS[idiom].symbol;

/** A path in a screen's data as the update that writes it and the key in it: `/header/title` is `title` of what is written at `/header`. */
const split = (path: string): [string, string] => [path.slice(0, path.lastIndexOf("/")) || "/", path.slice(path.lastIndexOf("/") + 1)];

/** Where the app's destinations are in a screen's data, if it draws them, as its frame said; a screen saved before frames said so is the kit's, and draws them on a main screen. */
const destinationsOf = (screen: { destinationsAt?: string; titleAt?: string; topLevel: boolean }) => screen.destinationsAt ?? (screen.titleAt === undefined && screen.topLevel ? "/nav" : undefined);

/** A symbol for a line of a receipt, going by what the line says was changed. */
function lineIcon(what: string): string {
  const found = (
    [
      [/hue|vivid|accent|colou?r/i, "palette"],
      [/round/i, "rounded_corner"],
      [/type|font|letter/i, "text_fields"],
      [/dark|light/i, "contrast"],
      [/warm/i, "thermostat"],
      [/space|dens|room/i, "density_medium"],
      [/picture|photo/i, "image"],
      [/shadow|flat|card|border/i, "layers"],
      [/title|text|words/i, "edit_note"],
    ] as Array<[RegExp, string]>
  ).find(([pattern]) => pattern.test(what));
  return found ? found[1] : "tune";
}

type View = "chat" | "stage" | "design" | "library" | "settings";
/** What a snackbar says, and the one thing that can be done about it. */
interface Snack {
  text: string;
  tone?: "bad";
  action?: { label: string; run: () => void };
}

const AUTO = "auto";
const CUSTOM = "custom";
const STORED_DESIGN = "jev2ui.design.md";
/** The grammar new apps are made in, kept between visits: the person changes it about once a session. */
const STORED_IDIOM = "jev2ui.idiom";
/** Every device is this tall at most; a phone is always. */
const DEVICE_HEIGHTS: Record<Device, number> = { phone: 780, tablet: 1024, desktop: 760 };

type LogEntry =
  | { kind: "stage"; at: number; stage: string; ms: number; endpoint?: Endpoint; modelMs?: number; detail?: string; decisions: Decision[]; tokens?: { input: number; output: number } }
  | { kind: "note"; at: number; tone: "bad" | "plain"; text: string };

/**
 * One screen of the prototype. A session is a graph of these that grows as the person taps around: a tap that
 * has been followed before shows the screen it made then, so the prototype holds still while it is explored.
 */
interface Screen {
  destination?: string;
  routes?: ScreenRoutes;
  links?: Record<string, string>;
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
  /** Where in its data the screen's title is, and the app's destinations if it draws them (the frame event); a screen saved before these were said is the kit's. */
  titleAt?: string;
  destinationsAt?: string;
  /** The reading the screen was built from, as the server sent it: sent back for the parts that stay when it is generated again. */
  plan?: Extract<PipelineEvent, { type: "plan" }>["plan"];
  /** What it was made from, so that it can be made again; `notes` are what has been said about it since, and `edit` what was settled by saying it. */
  request: { prompt: string; journey?: Journey; fresh?: boolean; notes?: string[]; edit?: { plan: Record<string, unknown>; blocks: string[] } };
}

/** Everything a turn can change, as it stood before the turn. Screens are replaced and never edited once made, so a copy of the map is enough. */
interface Before {
  idiom: IdiomId;
  architecture?: Architecture;
  architectureError: string;
  app: string;
  nav: Journey["nav"];
  settled: Journey["settled"];
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

/** Top-bar actions that act in place. */
const IN_PLACE = new Set(["favorite", "more_vert", "share"]);
const EDITED = "Edited your DESIGN.md";

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
  @state() private device: Device = firstDevice();
  /** What the rail says is showing. The conversation and the design sit beside the stage; the library and the settings take its place. On a narrow window, `stage` is the mock alone. */
  @state() private view: View = "chat";
  @state() private section: Section = "account";
  /** Which menu is open: `account`, `info`, `export`, or `app:<id>` for a tile of the library. */
  @state() private menu = "";
  /** The saved app that is about to be deleted, once the person says so again. */
  @state() private deleting = "";
  @state() private snack: Snack | undefined;
  private snackTimer: ReturnType<typeof setTimeout> | undefined;
  /** How much smaller than life the device is drawn, so that all of it is in the window. */
  @state() private fit = 1;
  private fitting: ResizeObserver | undefined;

  /** The grammar new apps are made in (shared/idioms.ts): the person's to choose, in the bar. Opening an app made in another leaves it be. */
  @state() private preset: IdiomId = idiomNamed(localStorage.getItem(STORED_IDIOM));
  /**
   * The grammar this app was made in: which grammar reads it, which catalog draws it and which stylesheet paints it. An
   * app keeps it for as long as it lives, since its screens were read by that grammar and no other. With no app, the preset.
   */
  @state() private idiom: IdiomId = idiomNamed(localStorage.getItem(STORED_IDIOM));
  /** Which grammar's apps the library shows: every one's, unless one is chosen. */
  @state() private filtered: IdiomId | "" = "";
  /** How far from the left the grammar in the bar is, for its menu to open under it. */
  private grammarAt = 0;
  @state() private choice: string = AUTO;
  @state() private markdown = "";
  @state() private report: DesignReport | undefined;
  @state() private designError = "";
  @state() private designBusy = false;
  /** Which draw of Jev's mix is showing: 0 is its best guess, anything else a remix. */
  @state() private seed = 0;
  /** What the person has asked to have changed about the mix. A remix keeps it. */
  private change: PaintChange = {};

  /** Bumped whenever a screen or a turn changes; both are mutated in place as things arrive. */
  @state() private tick = 0;
  /** A message is being read. Screens may still be streaming; that does not stop the next message. */
  @state() private reading = false;

  // The session: what app this is, every screen made for it, the way back, and how it came to be.
  private app = "";
  @state() private architecture?: Architecture;
  @state() private architectureError = "";
  /** Whether the stage shows the map of the app instead of the screen it is of. */
  @state() private onMap = false;
  @state() private mapSelected = "first";
  private nav: Journey["nav"];
  /** What the app settled on its first screen, which every screen after it is given (a Windows app's silhouette). */
  private settled: Journey["settled"];
  private screens = new Map<string, Screen>();
  private stack: Screen[] = [];
  private turns: Turn[] = [];
  private nextId = 1;
  private nextTurn = 1;
  private shownTurns = 0;
  /** Every screen being made. More than one can be: "move the form to a screen of its own" makes two. */
  private making = new Map<AbortController, Screen>();
  private readingAbort: AbortController | undefined;
  private resolveAbort?: AbortController;
  @state() private resolving = "";
  private designRequest = 0;
  private editTimer: ReturnType<typeof setTimeout> | undefined;

  /** The saved app that is showing (shared/saved.ts), until the session moves on from it. */
  @state() private saved: SavedAbout | undefined;
  /** What the person has saved. */
  @state() private library: SavedAbout[] = [];
  /** What a visitor tapped that leads to a screen nobody has made. */
  @state() private unmade = "";
  /** The app a link names (`?app=<id>`), until it has been opened or has turned out not to be there. */
  private linked = new URLSearchParams(location.search).get("app");
  private libraryFor = "";

  constructor() {
    super();
    session.attach(this);
    this.readAddress();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.readAddress);
    window.addEventListener("keydown", this.onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.readAddress);
    window.removeEventListener("keydown", this.onKey);
    this.fitting?.disconnect();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.menu) this.menu = "";
  };

  // --- Where the person is: the view is in the address, after the #, so that a link can name it and Back works -------

  private readAddress = () => {
    const [view, section] = location.hash.slice(1).split("/");
    this.view = view === "design" || view === "library" || view === "settings" || view === "stage" ? view : "chat";
    if (section === "account" || section === "keys" || section === "appearance" || section === "models" || section === "access") this.section = section;
    this.menu = "";
  };

  private go(view: View, section?: Section) {
    if (section) this.section = section;
    this.menu = "";
    const hash = view === "chat" ? "" : view === "settings" ? `#settings/${section ?? this.section}` : `#${view}`;
    if (hash !== location.hash) history.pushState(null, "", location.pathname + location.search + hash);
    this.view = view;
  }

  /** Says something at the foot of the window, for a few seconds. */
  private tell(text: string, more: Omit<Snack, "text"> = {}) {
    clearTimeout(this.snackTimer);
    this.snack = { text, ...more };
    this.snackTimer = setTimeout(() => (this.snack = undefined), more.tone === "bad" ? 9000 : 4500);
  }

  private bad = (error: unknown) => this.tell(error instanceof Error ? error.message : String(error), { tone: "bad" });

  /** The name of the app: the title of the screen it started with. */
  private get appName(): string {
    const first = this.screens.get("start") ?? this.made[0];
    return first?.title || (this.app.length > 48 ? `${this.app.slice(0, 46)}…` : this.app);
  }

  // Light DOM, so the theme variables set on the device frame reach the renderer.
  protected createRenderRoot() {
    return this;
  }

  private get current(): Screen | undefined {
    return this.stack.at(-1);
  }

  /** Stops whatever is being made: what it was for is about to be gone. */
  private stop(retain = new Set<Screen>()) {
    this.readingAbort?.abort();
    this.resolveAbort?.abort();
    this.resolving = "";
    for (const [abort, screen] of this.making) if (!retain.has(screen)) {
      abort.abort();
      this.making.delete(abort);
    }
  }

  private get made(): Screen[] {
    return [...new Set(this.screens.values())];
  }

  protected willUpdate(changed: Map<string, unknown>) {
    // An idiom whose frame is a window is shown on a desktop first; the rest on the device the person chose.
    if (changed.has("idiom")) {
      const own = (IDIOMS[this.idiom] as { device?: Device }).device;
      this.device = own ?? firstDevice();
    }
    // Who is asking decides whether a private app opens, so a link waits until that is known.
    if (this.linked && session.state !== "loading") void this.openSaved(this.linked);
    if (session.state === "in" && this.libraryFor !== session.email) void this.loadLibrary();
  }

  protected updated() {
    const byId = new Map(this.made.map((screen) => [String(screen.id), screen]));
    const navigationIcons = Object.fromEntries(this.architecture?.map.nodes.map((node) => [node.id, architectureIcon(this.architecture!, node.id)]) ?? []);
    // The page is painted in the app's idiom, and every request says which it is.
    paintIn(this.idiom);
    session.idiom = this.idiom;
    for (const surface of this.querySelectorAll<Surface>("ui-surface")) {
      surface.theme = this.report?.theme;
      surface.stylesheet = stylesOf(this.idiom);
      surface.navigationIcons = navigationIcons;
      surface.sync(byId.get(surface.dataset.screen!)?.messages ?? []);
    }
    document.title = this.appName ? `${this.appName} · Apparite` : "Apparite";
    this.watchFit();
    // The conversation follows its last turn.
    if (this.shownTurns !== this.turns.length) {
      this.shownTurns = this.turns.length;
      const turns = this.querySelector(".turns");
      turns?.scrollTo({ top: turns.scrollHeight, behavior: "smooth" });
    }
  }

  /** Keeps the device, drawn at its own size, within what the window has room for: a phone whose foot is off the page is not seen whole. */
  private watchFit() {
    const holder = this.querySelector<HTMLElement>(".holder");
    if (!holder) return;
    const measure = () => {
      const padding = getComputedStyle(holder);
      const wide = holder.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
      const high = holder.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
      const frame = this.device === "phone" ? 20 : 0;
      const fit = Math.min(1, wide / (DEVICES[this.device] + frame), high / (DEVICE_HEIGHTS[this.device] + frame));
      if (fit > 0 && Math.abs(fit - this.fit) > 0.004) this.fit = fit;
    };
    if (!this.fitting) this.fitting = new ResizeObserver(measure);
    this.fitting.disconnect();
    this.fitting.observe(holder);
    measure();
  }

  // --- Turns ------------------------------------------------------------------

  private asItStands(): Before {
    return { idiom: this.idiom, architecture: this.architecture, architectureError: this.architectureError, app: this.app, nav: this.nav, settled: this.settled, screens: new Map(this.screens), stack: [...this.stack], nextId: this.nextId, choice: this.choice, markdown: this.markdown, seed: this.seed, change: this.change, report: this.report };
  }

  /** Every turn starts here: what stood before it is kept, so that it can be undone. */
  private begin(source: Turn["source"], said: string): Turn {
    this.movedOn();
    const turn: Turn = { id: this.nextTurn++, source, said, outcome: "pending", lines: [], decisions: [], before: this.asItStands() };
    this.turns = [...this.turns, turn];
    // The turns are not reactive state, and a chip leaves the box as it was: without this, nothing shows until the server first answers.
    this.tick++;
    return turn;
  }

  /** Nothing can be said yet: a message is being read, or the screen it would be about has not got as far as being drawn. */
  private get busy() {
    const here = this.current;
    return this.reading || Boolean(this.resolving) || Boolean(here?.destination ? this.making.size || (this.architecture?.status === "reviewing" && !this.architecture.catalog) : here?.running && here.firstPaintMs === undefined);
  }

  /** Takes back the last turn, whatever it was. */
  private undo() {
    const turn = this.turns.at(-1);
    if (!turn?.before) return;
    // Opening a destination can overlap the previous screen's remaining assets.
    // Undo the new screen while allowing the restored screen to finish its run.
    this.stop(new Set(turn.before.screens.values()));
    this.designRequest++;
    const b = turn.before;
    Object.assign(this, { idiom: b.idiom, architecture: b.architecture, architectureError: b.architectureError, app: b.app, nav: b.nav, settled: b.settled, screens: b.screens, stack: b.stack, nextId: b.nextId, choice: b.choice, markdown: b.markdown, seed: b.seed, change: b.change, report: b.report });
    if (b.report) loadFonts(b.report.theme);
    for (const screen of this.made) if (screen.links) screen.links = Object.fromEntries(Object.entries(screen.links).filter(([, id]) => this.architecture?.map.nodes.some((n) => n.id === id)));
    this.turns = this.turns.slice(0, -1);
    this.movedOn();
    this.tick++;
  }

  /** What the person typed, or chose from what the tool offered. The first makes an app; the rest are about the one there is. */
  private async say(message = this.draft) {
    message = message.trim();
    if (!message || this.busy || !session.makes) return;
    this.draft = "";
    const here = this.current;
    const asked = this.turns.at(-1);
    const turn = this.begin("typed", message);
    if (!this.app || !here) return this.create(message, turn);

    this.reading = true;
    try {
      const about = (screen: Screen): ScreenAbout => ({ destination: screen.destination, id: screen.id, title: screen.title, archetype: screen.archetype, ...(screen.plan ? { blocks: screen.plan.blocks } : {}) });
      const request: TurnRequest = {
        message,
        app: this.app,
        architecture: this.architecture ? withRenderedScreens(this.architecture, this.made) : undefined,
        bindings: this.architecture ? this.made.flatMap((s) => s.destination && s.routes ? [{ destination: s.destination, routes: s.routes }] : []) : undefined,
        others: this.made.filter((screen) => screen !== here && !screen.running && screen.title).map(about),
        design: this.customDesign ? { markdown: this.markdown } : { brief: this.app, seed: this.seed, change: this.change },
        showing: { ...about(here), decisions: [...here.log.flatMap((entry) => (entry.kind === "stage" ? entry.decisions : [])), ...(this.report?.decisions ?? [])].slice(0, 60).map(({ question, answer }) => ({ question, answer })) },
        // A message that follows a question of the tool's is the answer to it.
        ...(asked?.outcome === "said" && asked.options?.length && asked.text ? { answering: { message: asked.said, question: asked.text } } : {}),
      };
      const response = await session.fetch("/api/turn", { method: "POST", body: JSON.stringify(request), signal: (this.readingAbort = new AbortController()).signal });
      if (!response.ok) throw new Error(await response.text());
      const answer = (await response.json()) as TurnResponse;
      // Undone while it was being read: there is nothing to answer.
      if (!this.turns.includes(turn)) return;
      turn.decisions = answer.decisions;
      turn.ms = answer.ms;
      turn.endpoint = answer.endpoint;
      if (answer.design) {
        this.change = answer.design.change;
        this.designRequest++;
        this.applyDesign(answer.design.report, answer.design.markdown);
        turn.lines = answer.design.receipt;
      }
      if (answer.architecture) {
        this.applyArchitecture(answer.architecture, answer.routes);
        turn.lines = [...turn.lines, ...(answer.architectureChanges ?? []).slice(0, 20).map((to) => ({ what: "App map", from: "Previous map", to }))];
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
          // What the new screen takes with it leaves the screen it was on.
          if (answer.screen) this.remake(answer.screen, message, turn, here);
          if (answer.destination && this.architecture) {
            this.visitDestination(answer.destination, { kind: "asked", label: message }, turn);
            break;
          }
          const screen = this.open(`asked:${turn.id}`, false, { prompt: this.app, journey: { app: this.app, from: { title: here.title, archetype: here.archetype }, via: { kind: "asked", label: message }, ...this.carried() } });
          this.stack = [...this.stack, screen];
          void this.run(screen, turn);
          break;
        }
        case "remake":
          this.remake(answer.screen, message, turn, here);
          break;
      }
    } catch (error) {
      // Stopped by the person, the turn is gone already, and there is nobody to tell.
      if (this.turns.includes(turn)) Object.assign(turn, { outcome: "failed", text: (error as Error).message });
    } finally {
      this.reading = false;
      this.tick++;
    }
  }

  /** Makes a screen again as the message asked: the one it named, or the one showing. */
  private remake(asked: TurnResponse["screen"], message: string, turn: Turn, here: Screen) {
    const old = this.made.find((screen) => screen.id === asked?.id) ?? this.current ?? here;
    turn.on = old.title;
    turn.lines = [...turn.lines, ...(asked?.lines ?? [])];
    // The person should see what they changed, and it may not be the screen they were on: the way back stops there.
    this.stack = this.stack.includes(old) ? this.stack.slice(0, this.stack.indexOf(old) + 1) : [old];
    // To the letter, where the screen's plan is known and Jev could tell what was meant; with the message in mind, otherwise.
    // Nor while it is still being written: the words that would be kept are not all there yet.
    const exact = asked && !asked.blunt && old.plan && !old.running ? asked : undefined;
    const blocks = exact ? [...old.plan!.blocks.filter((block) => !exact.remove.includes(block)), ...exact.add] : undefined;
    const kept: Record<string, unknown> = {};
    if (exact)
      for (const sent of old.messages as Array<Record<string, any>>) {
        const part = String(sent.updateDataModel?.path ?? "").slice(1);
        if (part && !part.includes("/") && !exact.rewrite.includes(part) && !exact.remove.includes(part)) kept[part] = sent.updateDataModel.value;
      }
    void this.run(this.again(old, message, blocks && { plan: old.plan!, blocks }), turn, kept);
  }

  /** Clears the bench for another app, in the preset grammar. What was there is gone unless it was saved, so the way back is offered for a moment; `undone` puts back whatever else the caller changed. */
  private fresh(undone?: () => void) {
    this.menu = "";
    if (!this.app) return this.go("chat");
    const was = { ...this.asItStands(), turns: this.turns, saved: this.saved, search: location.search };
    this.stop();
    this.designRequest++;
    Object.assign(this, { idiom: this.preset, architecture: undefined, architectureError: "", app: "", nav: undefined, settled: undefined, screens: new Map(), stack: [], turns: [], change: {}, seed: 0, report: undefined, saved: undefined, unmade: "" });
    if (this.choice === AUTO) this.markdown = "";
    history.replaceState(null, "", location.pathname);
    this.view = "chat";
    this.tell("Started a new apparition", {
      action: {
        label: "Undo",
        run: () => {
          const { turns, saved, search, ...before } = was;
          undone?.();
          Object.assign(this, before, { turns, saved });
          if (before.report) loadFonts(before.report.theme);
          history.replaceState(null, "", location.pathname + search);
          this.tick++;
        },
      },
    });
    this.tick++;
  }

  /** A new description starts a new app, with a design of its own. */
  private create(prompt: string, turn: Turn) {
    this.stop();
    // A new app is made in the preset grammar, whichever grammar the app it replaces was made in.
    this.idiom = session.idiom = this.preset;
    this.app = prompt;
    this.architecture = undefined;
    this.architectureError = "";
    this.mapSelected = "first";
    this.onMap = false;
    this.seed = 0;
    this.change = {};
    this.nav = undefined;
    this.settled = undefined;
    this.screens = new Map();
    const screen = this.open("start", true, { prompt });
    screen.destination = "first";
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
    const turn = this.app ? this.begin("button", choice === AUTO ? `Switched to the ${named(session.endpoint)} design` : "Switched to your DESIGN.md") : undefined;
    this.choice = choice;
    this.designError = "";
    if (choice === CUSTOM) this.markdown = localStorage.getItem(STORED_DESIGN) ?? this.markdown;
    if (choice === AUTO ? this.app : this.markdown.trim()) void this.loadDesign(this.designSource, turn);
    else if (turn) turn.outcome = "changed";
  }

  /**
   * Sets the grammar new apps are made in. An app keeps the grammar it was made in, so choosing another while one is
   * open starts a new app in it; undoing that puts the preset back too.
   */
  private pick(id: IdiomId) {
    this.menu = "";
    const was = this.preset;
    this.preset = id;
    localStorage.setItem(STORED_IDIOM, id);
    if (!this.app) this.idiom = id;
    else if (id !== this.idiom)
      this.fresh(() => {
        this.preset = was;
        localStorage.setItem(STORED_IDIOM, was);
      });
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
    const under = screen.dialog ? this.underneath(screen) : undefined;
    this.stack = under ? [under, screen] : [screen];
    this.unmade = "";
    this.tick++;
  }

  /**
   * The screen a dialog sits over: the one the app map says it goes back to, or else the one it was opened from. Shown
   * again, from the map, the chat or a link, it sits over that screen as it did when it was first opened.
   */
  private underneath(dialog: Screen): Screen | undefined {
    const back = this.architecture?.map.nodes.find((n) => n.id === dialog.destination)?.actions.find((a) => a.kind === "back")?.target;
    const opener = Number(dialog.key.match(/^(\d+):/)?.[1]);
    const under = (back ? boundScreens(this.made).get(back) : undefined) ?? this.made.find((screen) => screen.id === opener);
    return under && under !== dialog && !under.dialog ? under : undefined;
  }

  /** What every request for a screen of this app carries of the app: its destinations, and what its first screen settled. */
  private carried() {
    return { ...(this.nav ? { nav: this.nav } : {}), ...(this.settled ? { settled: this.settled } : {}) };
  }

  /** What a tap does: go back, show the screen this tap made before, or have a new one made. Only the last is a turn. */
  private follow(detail: { kind: string; label: string; data?: Record<string, unknown>; index?: number; variant?: string; component?: string; source?: string }) {
    const here = this.current;
    if (!here) return;
    // A button that acts on the whole screen carries what the screen showed, but not its pictures or the app's destinations.
    if ((detail.kind === "action" || detail.kind === "submit") && detail.data) detail = { ...detail, data: JSON.parse(JSON.stringify(detail.data, (key, value) => (key === "imageUrl" || key === "nav" ? undefined : value))) };
    if (here.destination) return void this.followDestination(detail);
    const kind = (detail.kind === "item" && detail.variant !== undefined ? "itemAction" : detail.kind) as Via["kind"];
    if (kind === "appbar" && IN_PLACE.has(detail.label)) return;
    // A back arrow goes back, and so does a button the grammar says only closes what it is on (Cancel): the kit taps it as one.
    if (kind === "back" && this.stack.length > 1) {
      this.stack = this.stack.slice(0, -1);
      return void this.tick++;
    }
    const via: Via = { kind, label: detail.label, ...(detail.data ? { data: detail.data } : {}), ...(detail.index !== undefined ? { index: detail.index } : {}), ...(detail.component ? { component: detail.component } : {}) };
    const key = via.kind === "nav" ? `nav:${via.label}` : `${here.id}:${via.kind}:${via.label}`;
    let screen = this.screens.get(key);
    const made = !screen;
    // Looking is free; a screen nobody has made yet takes a run, and a run takes a name.
    if (made && !session.makes) return void (this.unmade = via.label);
    this.unmade = "";
    const turn = made ? this.begin("tap", via.kind === "back" ? `Went back from “${here.title}”` : `Tapped “${String(via.data?.title ?? via.label)}”`) : undefined;
    screen ??= this.open(key, via.kind === "nav", { prompt: this.app, journey: { app: this.app, from: { title: here.title, archetype: here.archetype }, via, ...this.carried() } });
    // The navigation bar switches between main screens, and a way back from the first screen makes the one it came from. Everything else drills in.
    this.stack = via.kind === "nav" || via.kind === "back" ? [screen] : [...this.stack, screen];
    // The home made by going back from a settings page leads back to that page, not to a second one.
    if (made && via.kind === "back" && here.archetype === "settings") this.screens.set(`${screen.id}:appbar:settings`, here);
    this.tick++;
    if (made) void this.run(screen, turn);
  }

  /** Identity decisions are serialized; registered in-flight destinations are visible to the next decision. */
  private async followDestination(detail: { kind: string; label: string; data?: Record<string, unknown>; source?: string; group?: string; component?: string }) {
    const here = this.current, map = this.architecture;
    if (!here?.destination || !map || this.reading || this.resolving) return;
    if (map.status === "reviewing" && !map.catalog) return this.tell("The app map is still being reviewed.");
    const kind = detail.kind as Via["kind"];
    if (kind === "appbar" && IN_PLACE.has(detail.label)) return;
    if (kind === "back" && this.stack.length > 1) {
      this.stack = this.stack.slice(0, -1); this.mapSelected = this.current!.destination!; this.tick++; return;
    }
    const source = detail.source ?? `${kind}:${detail.label}`;
    const direct = here.links?.[source] ?? (source.startsWith("nav:") && map.map.nodes.some((n) => n.id === source.slice(4)) ? source.slice(4) : kind === "back" ? map.map.nodes.find((n) => n.id === here.destination)?.actions.find((a) => a.kind === "back")?.target : undefined);
    if (direct) return this.visitDestination(direct, { ...detail, kind });
    if (!session.makes) return void (this.unmade = detail.label);
    const abort = new AbortController(); this.resolveAbort = abort;
    this.resolving = detail.label;
    const state = withRenderedScreens(map, this.made);
    const accept = (next: Architecture, destination: string) => {
      if (abort.signal.aborted || this.architecture !== map || this.current !== here || this.screens.get(here.key) !== here) return;
      const isNew = !boundScreens(this.made).has(destination);
      const turn = isNew ? this.begin("tap", `Opened “${detail.label}”`) : undefined;
      here.links = { ...here.links, [source]: destination };
      this.adoptCatalog(next);
      this.resolving = "";
      this.visitDestination(destination, { ...detail, kind }, turn);
    };
    try {
      const response = await session.fetch("/api/resolve", { method: "POST", signal: abort.signal, body: JSON.stringify({ state, from: { destination: here.destination, title: here.title, archetype: here.archetype }, via: { ...detail, kind } }) });
      if (!response.ok) throw new Error(await response.text());
      const answer = await response.json() as { state?: Architecture; destination?: string; requested: DestinationEvidence; ms: number; result: { kind: string } };
      if (abort.signal.aborted || this.architecture !== map || this.current !== here || this.screens.get(here.key) !== here) return;
      here.log = [...here.log, { kind: "stage", stage: `Jev: resolve “${detail.label}”`, at: 0, ms: answer.ms, detail: answer.result.kind, decisions: [] }];
      if (answer.state && answer.destination) accept(answer.state, answer.destination);
      else this.tell(`“${detail.label}” could refer to more than one screen. You can open an existing screen from the map, or make a separate mock.`, { action: { label: "Make separate mock", run: () => {
        if (this.architecture !== map || this.current !== here) return;
        const next = connectDestination(map, here.destination!, answer.requested, { kind: "new" });
        accept(next.state, next.destination);
      } } });
    } catch (error) {
      if (!abort.signal.aborted) this.tell(`Could not resolve this link: ${(error as Error).message}`);
    } finally {
      if (this.resolveAbort === abort) { this.resolving = ""; this.resolveAbort = undefined; }
      this.tick++;
    }
  }

  /** Additive catalog changes keep streaming screen objects alive and refresh visible navigation. */
  private adoptCatalog(next: Architecture) {
    this.architecture = next;
    this.architectureError = "";
    for (const screen of this.made) {
      screen.routes = undefined;
      const at = destinationsOf(screen);
      if (screen.destination && at) screen.messages.push({ version: "v0.9", updateDataModel: { surfaceId: "main", path: at, value: architectureNav(next, screen.destination) } });
    }
    this.tick++;
  }

  /**
   * A screen to take the place of `old`, made from the same request, or from that and a `note` of what was asked for.
   * Whatever was reached from the old one goes with it.
   */
  private again(old: Screen, note?: string, edit?: Screen["request"]["edit"]): Screen {
    const forget = (screen: Screen) => {
      for (const [key, other] of [...this.screens]) {
        if (other === screen) this.screens.delete(key);
        else if (key.startsWith(`${screen.id}:`) && !this.stack.includes(other)) forget(other);
      }
    };
    const aliases = [...this.screens].filter(([, screen]) => screen === old).map(([key]) => key);
    if (!old.destination) forget(old);
    // It may have been the screen that established the navigation bar; if so, it establishes it again.
    const request = !old.request.journey ? old.request : { ...old.request, journey: { ...old.request.journey, ...(!old.request.journey.nav && this.nav ? { nav: this.nav } : {}), ...(!old.request.journey.settled && this.settled ? { settled: this.settled } : {}) } };
    // Made again as it was means made anew: a custom component is baked afresh. Made again with a note, what was baked may well still do.
    const screen = this.open(old.key, old.topLevel, note ? { ...request, fresh: false, notes: [...(request.notes ?? []), note], ...(edit ? { edit } : {}) } : { ...request, fresh: true });
    screen.destination = old.destination;
    for (const key of aliases) this.screens.set(key, screen);
    this.stack = this.stack.map((one) => (one === old ? screen : one));
    this.tick++;
    return screen;
  }

  /** Revisions are atomic: copies keep undo snapshots intact, and cached control bindings are checked again. */
  private applyArchitecture(next: Architecture, routes: Record<string, ScreenRoutes> = {}) {
    const before = this.architecture;
    const valid = new Set(next.map.nodes.map((n) => n.id));
    const replaced = new Map<Screen, Screen>();
    for (const screen of this.made) {
      if (!screen.destination || !valid.has(screen.destination)) continue;
      const copy = { ...screen, messages: [...screen.messages], routes: routes[screen.destination] ?? (before ? rebaseRoutes(before, next, screen.destination, screen.routes) : screen.routes) };
      const at = destinationsOf(copy);
      if (at) copy.messages.push({ version: "v0.9", updateDataModel: { surfaceId: "main", path: at, value: architectureNav(next, screen.destination) } });
      replaced.set(screen, copy);
    }
    this.screens = new Map([...this.screens].flatMap(([key, screen]) => replaced.has(screen) ? [[key, replaced.get(screen)!] as const] : []));
    this.stack = this.stack.flatMap((screen) => replaced.has(screen) ? [replaced.get(screen)!] : []);
    if (!this.stack.length) { const first = boundScreens(this.made).get("first"); if (first) this.stack = [first]; }
    this.architecture = next;
    this.architectureError = "";
    this.tick++;
  }

  private visitDestination(destination: string, via?: Via, turn?: Turn) {
    const architecture = this.architecture, here = this.current;
    const node = architecture?.map.nodes.find((n) => n.id === destination);
    if (!architecture || !node || !here || (architecture.status === "reviewing" && !architecture.catalog) || (!turn && (this.reading || Boolean(this.resolving)))) return;
    const existing = boundScreens(this.made).get(destination);
    // A resolved route names the canonical screen. Generated labels and legacy subject hints
    // are presentation data, not a second identity check on an already-bound destination.
    this.mapSelected = destination;
    // A tap that leads to the screen it is on stays there. On a dialog it is done with it: every button of an alert closes it (HIG).
    if (existing === here && via && !turn) {
      if (here.dialog) this.stack = this.stack.length > 1 ? this.stack.slice(0, -1) : [this.underneath(here) ?? here];
      this.mapSelected = this.current!.destination ?? destination;
      return void this.tick++;
    }
    if (existing) {
      if (turn) Object.assign(turn, { outcome: "changed", screen: existing.id, text: `Opened the existing ${node.label} screen.` });
      return this.show(existing);
    }
    if (!session.makes) return void (this.unmade = node.label);
    turn ??= this.begin("tap", `Opened “${node.label}” from the app map`);
    const screen = this.open(`destination:${destination}`, false, { prompt: this.app, journey: { app: this.app, from: { title: here.title, archetype: here.archetype }, via: via ?? { kind: "asked", label: `Open ${node.label}` }, ...(this.settled ? { settled: this.settled } : {}) } });
    screen.destination = destination;
    this.stack = via?.kind === "back" || via?.kind === "nav" ? [screen] : [...this.stack, screen];
    this.unmade = "";
    this.tick++;
    void this.run(screen, turn);
  }

  private regenerate() {
    const old = this.current;
    if (!old) return;
    const turn = this.begin("button", "Regenerated this screen");
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

  /** `kept` are the words of the parts that stay as they are, by their path: no writer is asked for those again. */
  private async run(screen: Screen, turn?: Turn, kept: Record<string, unknown> = {}) {
    if (turn) turn.screen = screen.id;
    // Where there is room for only one of them, what was asked for is what is shown.
    if (matchMedia("(max-width: 900px)").matches && (this.view === "chat" || this.view === "stage")) this.go("stage");
    // A screen made anew has no use for the shelf; any other is told what the app has baked, as of now.
    const shelf = screen.request.journey && !screen.request.fresh ? this.shelf : [];
    const request = { ...screen.request, ...(screen.destination ? { architecture: this.architecture ? { state: withRenderedScreens(this.architecture, this.made), destination: screen.destination } : { create: true as const } } : {}), ...(shelf.length ? { journey: { ...screen.request.journey!, shelf } } : {}), ...(screen.request.edit ? { edit: { ...screen.request.edit, kept } } : {}) };
    const abort = new AbortController();
    this.making.set(abort, screen);
    const note = (tone: "bad" | "plain", text: string, at = 0) => void (screen.log = [...screen.log, { kind: "note", at, tone, text }]);
    try {
      // Every screen of an app is painted by the same design: the developer's file, or the same draw of Jev's mix with what they have asked of it.
      await streamEvents({ ...request, ...this.designSource }, abort.signal, (event) => {
        if (abort.signal.aborted || this.screens.get(screen.key) !== screen) return;
        switch (event.type) {
          case "architecture":
            this.architecture = event.architecture;
            this.architectureError = "";
            break;
          case "architecture-error":
            this.architectureError = event.message;
            note("bad", event.message, event.at);
            break;
          case "routes":
            if (event.destination === screen.destination && event.routes.revision === this.architecture?.revision) screen.routes = event.routes;
            break;
          case "design":
            this.designRequest++; // a reading in flight is older than this one
            this.applyDesign(event.report, event.markdown);
            screen.builtWith = event.report.structure;
            break;
          case "plan":
            screen.plan = event.plan;
            screen.archetype = event.plan.kind;
            break;
          case "frame":
            // What the frame is, as the server read it: its components are the catalog's, and the shell reads none of them.
            screen.dialog = event.over;
            screen.topLevel = event.main;
            screen.titleAt = event.title;
            screen.destinationsAt = event.destinations;
            // The app's first screen settles what every screen after it is given.
            if (event.app && !this.settled) this.settled = event.app;
            break;
          case "a2ui": {
            screen.messages.push(event.message);
            const message = event.message as Record<string, any>;
            if (message.updateComponents) screen.firstPaintMs ??= event.at;
            const data = message.updateDataModel;
            const [where, key] = split(screen.titleAt ?? "/header/title");
            if (data?.path === where && data.value?.[key]) screen.title = data.value[key];
            // The first screen that draws the app's destinations establishes them for the app, symbols included once they arrive.
            if (!screen.destination && data?.path && data.path === destinationsOf(screen) && Array.isArray(data.value?.items) && !request.journey?.nav) {
              this.nav = { items: data.value.items };
              const active = data.value.items[data.value.active ?? 0]?.label;
              if (active) this.screens.set(`nav:${active}`, screen);
            }
            break;
          }
          case "trace":
            screen.log = [...screen.log, { kind: "stage", decisions: [], ...event }];
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
      this.making.delete(abort);
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
    screen.log = [...screen.log, { kind: "note", at: 0, tone: "bad", text: `The custom component “${detail.name ?? "untitled"}” failed in the browser: ${detail.message}. To generate the component again, regenerate the screen.` }];
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
      version: this.architecture ? 3 : 2,
      architecture: this.architecture ? withRenderedScreens(this.architecture, this.made) : undefined,
      app: this.app,
      ...(this.nav ? { nav: this.nav } : {}),
      ...(this.settled ? { settled: this.settled } : {}),
      design: { choice: this.choice, markdown: this.markdown, seed: this.seed, change: this.change as Record<string, unknown>, ...(this.report ? { report: this.report as unknown as Record<string, unknown> } : {}) },
      idiom: this.idiom,
      screens: kept.map(({ running, key, ...screen }) => ({ ...screen, keys: [...this.screens].filter(([, other]) => other.id === screen.id).map(([k]) => k) })) as unknown as SavedApp["screens"],
      stack: stack.length ? stack : [kept[0].id],
      turns: turns.slice(-400).map(({ before, screen, ...turn }) => ({ ...turn, ...(screen && ids.has(screen) ? { screen } : {}), decisions: turn.decisions.slice(0, 80) as unknown as Array<Record<string, unknown>> })),
    };
  }

  private restore(app: SavedApp) {
    this.stop();
    this.app = app.app;
    this.architecture = app.architecture ? withCatalog(app.architecture) : undefined;
    this.architectureError = "";
    this.mapSelected = "first";
    this.onMap = false;
    this.nav = app.nav;
    this.settled = app.settled;
    this.idiom = idiomNamed(app.idiom);
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
    // Saved showing a dialog, it opens over the screen beneath it, even if that screen was not kept on the stack.
    const top = this.stack.at(-1);
    const under = this.stack.length === 1 && top?.dialog ? this.underneath(top) : undefined;
    if (under) this.stack = [under, top!];
    // An app saved before there was a conversation has the one turn it must have had.
    this.turns = (app.turns as unknown as Turn[] | undefined) ?? [{ id: 1, source: "typed", said: app.app, outcome: "made", lines: [], decisions: [], screen: app.screens[0].id }];
    this.nextTurn = Math.max(...this.turns.map((turn) => turn.id)) + 1;
    this.tick++;
  }

  /** The session is no longer the saved app that was showing: something was made, or changed. */
  private movedOn() {
    if (!this.saved && !new URLSearchParams(location.search).has("app")) return;
    this.saved = undefined;
    history.replaceState(null, "", location.pathname + location.hash);
  }

  private async openSaved(id: string) {
    this.linked = null;
    try {
      const response = await session.fetch(`/api/apps/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(await response.text());
      const { about, app } = (await response.json()) as { about: SavedAbout; app: SavedApp };
      this.restore(app);
      this.saved = about;
      history.replaceState(null, "", `?app=${about.id}`);
      this.view = "chat";
      this.menu = "";
    } catch (error) {
      this.bad(error);
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
      history.replaceState(null, "", `?app=${id}${location.hash}`);
      if (share) await this.copy(this.linkTo(id), "Link copied. Anyone with the link can open this apparition.");
      else this.tell(`Saved “${this.saved?.name || this.appName}”`, { action: { label: "Share", run: () => void this.share(id) } });
    } catch (error) {
      this.bad(error);
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

  /** Lets anyone with the link open a saved app, and puts the link on the clipboard. */
  private async share(id: string) {
    this.menu = "";
    try {
      await this.setVisibility(id, "link");
      await this.copy(this.linkTo(id), "Link copied. Anyone with the link can open this apparition.");
    } catch (error) {
      this.bad(error);
    }
  }

  private async forget(id: string) {
    this.menu = this.deleting = "";
    const response = await session.fetch(`/api/apps/${id}`, { method: "DELETE" });
    if (!response.ok) return this.bad(await response.text());
    const gone = this.library.find((one) => one.id === id);
    this.library = this.library.filter((one) => one.id !== id);
    if (this.saved?.id === id) this.movedOn();
    this.tell(`Deleted “${gone?.name || gone?.title || "Untitled apparition"}”`);
  }

  private async copy(text: string, said: string) {
    this.menu = "";
    try {
      await navigator.clipboard.writeText(text);
      this.tell(said);
    } catch (error) {
      this.bad(error);
    }
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
              ${entry.endpoint ? entry.stage.replace(/^Jev/, named(entry.endpoint)) : entry.stage}
              <small>at ${entry.at} ms${entry.ms ? ` · ${entry.endpoint ? `${entry.endpoint} took` : "took"} ${entry.ms} ms${entry.modelMs ? `, its model ${entry.modelMs}` : ""}` : ""}${entry.detail ? ` · ${entry.detail}` : ""}${entry.tokens?.input ? ` · ${entry.tokens.input} in tok` : ""}</small>
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
        ${turn.lines.map((line) => html`<li>${icon(lineIcon(line.what))}<span><b>${line.what}</b><span class="from">${line.from}</span> ${icon("arrow_forward", "xs")} <span class="to">${line.to}</span></span></li>`)}
      </ul>`);
    if (screen)
      reply.push(html`<button class="madecard" aria-current=${screen === this.current} @click=${() => this.show(screen)} title="Show this screen">
        <span class="glyph ${screen.running ? "working" : ""}">${icon(screenIcon(screen.archetype, this.idiom))}</span>
        <span class="words">
          <b>${screen.title || (screen.running ? "Planning the screen…" : "Untitled screen")}</b>
          <small>${[screen.archetype, screen.running ? "generating…" : screen.stats ? `${turn.on ? "regenerated" : "generated"} in ${seconds(screen.stats.totalMs)}` : "", bad ? `${bad} ${bad === 1 ? "error" : "errors"}` : ""].filter(Boolean).join(" · ")}</small>
        </span>
        ${icon("chevron_right")}
      </button>`);
    else if (turn.screen && turn.outcome !== "pending") reply.push(html`<p class="hint gone">${icon("history", "xs")}The screen from this turn was replaced when it was regenerated.</p>`);
    if (turn.outcome === "changed" && !turn.lines.length && !turn.screen) reply.push(html`<p class="hint">No visible changes.</p>`);
    if (turn.text) reply.push(html`<p class=${turn.outcome === "failed" ? "note bad" : "spoken"}>${turn.text}</p>`);
    if (turn.options?.length)
      reply.push(html`<div class="options">
        ${turn.options.map((option: Option) => html`<button ?disabled=${this.busy || !session.makes} title=${option.instruction} @click=${() => this.say(option.instruction)}>${option.label}</button>`)}
      </div>`);
    if (turn.outcome === "pending" && !screen) reply.push(html`<p class="reading"><span class="dots"><i></i><i></i><i></i></span>Interpreting your message…</p>`);
    const count = turn.decisions.length + (screen?.log.reduce((sum, entry) => sum + (entry.kind === "stage" ? entry.decisions.length : 0), 0) ?? 0);
    return html`<article class="turn ${turn.source} ${turn.outcome}">
      <p class="said">${turn.source === "tap" ? icon("touch_app", "xs") : turn.source === "button" ? icon("smart_button", "xs") : nothing}${turn.said}</p>
      <div class="reply">
        ${turn.on && !turn.lines.length && !screen ? html`<small class="on">On ${turn.on}</small>` : nothing} ${reply}
        <footer>
          ${count
            ? html`<details class="why">
                <summary>${icon("arrow_right", "s")}${count} ${count === 1 ? "decision" : "decisions"}${turn.ms ? ` · ${turn.endpoint ? `${turn.endpoint} responded` : "interpreted"} in ${turn.ms} ms` : ""}</summary>
                ${turn.decisions.length ? this.renderDecisions(turn.decisions) : nothing} ${screen ? this.renderLog(screen) : nothing}
              </details>`
            : html`<span></span>`}
          ${last && turn.before && turn.outcome !== "pending" && session.makes ? html`<button class="ib small" title="Undo this turn" aria-label="Undo this turn" @click=${() => this.undo()}>${icon("undo", "s")}</button>` : nothing}
        </footer>
      </div>
    </article>`;
  }

  private renderDesign() {
    const problems = this.report?.findings.filter((f) => f.severity !== "info") ?? [];
    const options = [
      { id: AUTO, name: `${named(session.endpoint)} design`, symbol: "auto_awesome" },
      { id: CUSTOM, name: "Your DESIGN.md", symbol: "description" },
    ];
    const asked = [...Object.entries(this.change.dials ?? {}).filter(([, by]) => by), ...Object.entries(this.change.pins ?? {})];
    const vars = this.report?.theme.vars;
    const swatches = vars ? [vars["--k-page"], vars["--k-card"], vars["--k-text"], vars["--k-accent"], vars["--k-border"]] : [];
    return html`
      <section class="panel design">
        <header class="panel-head">
          <span class="swatches">${swatches.map((value) => html`<i style="background:${value}"></i>`)}</span>
          <h2>${this.designBusy ? "Generating design…" : (this.report?.name ?? "Design")}</h2>
          ${this.choice === AUTO
            ? html`<button class="btn small" ?disabled=${!this.app || this.designBusy} @click=${() => this.remix()} title="Generate a different design from the same ratings. The changes that you asked for are kept.">${icon("casino", "s")}Remix</button>`
            : nothing}
        </header>
        <div class="segmented wide" role="radiogroup" aria-label="Design system">
          ${options.map((o) => html`<button role="radio" aria-checked=${this.choice === o.id} @click=${() => this.choose(o.id)}>${icon(o.symbol, "s")}${o.name}</button>`)}
        </div>
        <p class="hint">
          ${this.choice === AUTO
            ? `${named(session.endpoint)} rates your description for hue, vividness, warmth, roundness, and whitespace, and then turns the ratings into a DESIGN.md file. To change the design, describe the change in the chat, or select Remix.`
            : `Paste your project's DESIGN.md. Apparite applies the tokens to the preview, and ${named(session.endpoint)} reads the prose for anything the tokens don't specify.`}
        </p>
        ${this.choice === AUTO && asked.length
          ? html`<p class="yours">
              ${icon("push_pin", "xs")}
              ${asked.map(([key, value]) => html`<span>${typeof value === "number" ? `${key} ${value > 0 ? "+" : ""}${value.toFixed(2)}` : `${key} ${value === true ? "yes" : value === false ? "no" : value}`}</span>`)}
              <small>Your changes. Remixing keeps them.</small>
            </p>`
          : nothing}
        ${this.designError ? html`<p class="note bad">${this.designError}</p>` : nothing}
        ${problems.map((f) => html`<p class="note ${f.severity === "error" ? "bad" : "warn"}">${icon(f.severity === "error" ? "error" : "warning", "xs")}${f.message}</p>`)}
        <div class="editor">
          <textarea
            spellcheck="false"
            aria-label="DESIGN.md"
            placeholder="Paste your project's DESIGN.md"
            .value=${this.markdown}
            @input=${(e: InputEvent) => this.edit((e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </div>
      </section>
    `;
  }

  /** What the person has saved: a tile for each, drawn from the colours it is painted with. */
  private renderLibrary() {
    const when = (created: string) => {
      const date = new Date(created);
      return Date.now() - date.getTime() < 86_400_000 && date.getDate() === new Date().getDate() ? "today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };
    // The grammars the library holds, not every grammar there is: a filter only once there are two to tell apart.
    const held = IDIOM_IDS.filter((id) => this.library.some((one) => one.idiom === id));
    const only = held.includes(this.filtered as IdiomId) ? this.filtered : "";
    const shown = only ? this.library.filter((one) => one.idiom === only) : this.library;
    return html`
      <section class="library">
        <h2>Library <small>${this.library.length ? `${this.library.length} ${this.library.length === 1 ? "apparition" : "apparitions"}, with every screen and message` : ""}</small></h2>
        ${held.length > 1
          ? html`<div class="segmented grammar-filter" role="radiogroup" aria-label="Grammar">
              <button role="radio" aria-checked=${!only} @click=${() => (this.filtered = "")}>All <span class="count">${this.library.length}</span></button>
              ${held.map((id) => html`<button role="radio" aria-checked=${only === id} @click=${() => (this.filtered = id)}>${icon(IDIOMS[id].symbol, "s")}${IDIOMS[id].name} <span class="count">${this.library.filter((one) => one.idiom === id).length}</span></button>`)}
            </div>`
          : nothing}
        <div class="grid">
          ${session.makes
            ? html`<button class="tile new" @click=${() => this.fresh()}>
                <span>${icon("add_circle")}<b>New ${IDIOMS[this.preset].name} apparition</b><small>Describe ${IDIOMS[this.preset].app}, or start from an example.</small></span>
              </button>`
            : nothing}
          ${shown.map((one) => {
            const [page, card, text, accent, border] = one.palette ?? [];
            const paint = page ? `--p:${page};--c:${card};--t:${text};--a:${accent};--b:${border}` : "";
            const shared = one.visibility === "link";
            return html`<div class="tile" aria-current=${one.id === this.saved?.id}>
              ${isIdiom(one.idiom) ? html`<span class="tile-grammar">${icon(IDIOMS[one.idiom].symbol, "xs")}${IDIOMS[one.idiom].name}</span>` : nothing}
              <button class="shot" title=${one.title} aria-label="Open ${one.name || one.title}" @click=${() => this.openSaved(one.id)}>
                <span class="mini" style=${paint}><i class="t"></i><i class="a"></i><i class="r"></i><i class="r"></i><i class="r"></i><i class="n"></i></span>
              </button>
              <div class="meta">
                <div>
                  <b title=${one.title}>${one.name || one.title}</b>
                  <small>${icon(shared ? "link" : "lock", "xs")}${shared ? "Shared · " : ""}${one.screens} ${one.screens === 1 ? "screen" : "screens"} · ${when(one.created)}</small>
                </div>
                <button class="ib" aria-label="More options for ${one.name || one.title}" aria-expanded=${this.menu === `app:${one.id}`} @click=${() => ((this.deleting = ""), (this.menu = this.menu === `app:${one.id}` ? "" : `app:${one.id}`))}>${icon("more_vert", "s")}</button>
              </div>
              ${this.menu === `app:${one.id}`
                ? html`<div class="pop tile-menu" role="menu">
                    ${this.deleting === one.id
                      ? html`<p class="ask">Delete “${one.name || one.title}”? Anyone who has its link can no longer open it.</p>
                          <div class="ask-acts">
                            <button class="btn small" @click=${() => (this.menu = "")}>Cancel</button>
                            <button class="btn small danger" @click=${() => this.forget(one.id)}>Delete</button>
                          </div>`
                      : html`<button class="mi" role="menuitem" @click=${() => this.openSaved(one.id)}>${icon("open_in_new")}Open</button>
                          ${shared
                            ? html`<button class="mi" role="menuitem" @click=${() => this.copy(this.linkTo(one.id), "Link copied")}>${icon("content_copy")}Copy link</button>
                                <button class="mi" role="menuitem" @click=${() => (this.menu = "", this.setVisibility(one.id, "private").then(() => this.tell("Only you can open this apparition now.")).catch(this.bad))}>${icon("lock")}Make private</button>`
                            : html`<button class="mi" role="menuitem" @click=${() => this.share(one.id)}>${icon("link")}Share by link</button>`}
                          <div class="sep"></div>
                          <button class="mi danger" role="menuitem" @click=${() => (this.deleting = one.id)}>${icon("delete")}Delete</button>`}
                  </div>`
                : nothing}
            </div>`;
          })}
        </div>
        ${this.library.length ? nothing : html`<p class="empty-note">${icon("bookmark")}You haven't saved any apparitions yet. Save keeps an apparition with all of its screens and messages. Share also creates a link that anyone can open.</p>`}
      </section>
    `;
  }

  /** What someone who cannot make things sees in place of the box to type in: what they are looking at, and the way in. */
  private renderVisitor() {
    return html`
      <section class="visitor">
        <p class="hint">
          This apparition has ${this.saved?.screens} ${this.saved?.screens === 1 ? "screen" : "screens"}, created by ${this.saved?.owner || "another user"}. Tap through the preview: every screen that was generated is included. To see how a screen was generated, select the info icon.
        </p>
        ${session.state === "out"
          ? html`<p class="hint">To create or change apparitions, sign in with an account that's on the access list, or use your own API keys.</p>
              <div class="row">
                <button class="btn primary" @click=${() => session.signIn()}>${icon("login", "s")}Sign in with Google</button>
                <button class="btn" @click=${() => session.enter(true)}>${icon("key", "s")}Use your own keys</button>
              </div>`
          : nothing}
        ${session.state === "stranger"
          ? html`<p class="hint">You're signed in as ${session.email}, which isn't on the access list. To create or change apparitions, ask an admin to add your address, or use your own API keys.</p>
              <button class="btn" @click=${() => session.enter(true)}>${icon("key", "s")}Use your own keys</button>`
          : nothing}
      </section>
    `;
  }

  private renderChat() {
    if (this.view === "design" && session.makes) return html`<aside class="chat">${this.renderDesign()}</aside>`;
    const chips = this.app ? SUGGESTIONS : [];
    return html`
      <aside class="chat">
        <div class="turns">
          ${this.turns.length
            ? repeat(
                this.turns,
                (turn) => turn.id,
                (turn, i) => this.renderTurn(turn, i === this.turns.length - 1),
              )
            : html`<div class="opening">
                <h2>What ${IDIOMS[this.idiom].name} app do you want to make?</h2>
                <p>Describe an app, or a single screen. Apparite generates an apparition beside this conversation: a mock that looks like an app, so that you can explore the idea before you build it. To change the apparition, describe the change or tap an element in it.</p>
                ${session.makes ? html`<div class="examples">${EXAMPLES.map(([symbol, text]) => html`<button ?disabled=${this.busy} @click=${() => this.say(text)}>${icon(symbol)}<span>${text}</span>${icon("north_west", "xs")}</button>`)}</div>` : nothing}
              </div>`}
        </div>
        ${session.makes
          ? html`<form
              class="say"
              @submit=${(e: Event) => {
                e.preventDefault();
                void this.say();
              }}
            >
              ${chips.length ? html`<div class="chips">${chips.map(([symbol, text]) => html`<button type="button" ?disabled=${this.busy} @click=${() => this.say(text)}>${icon(symbol, "xs")}${text}</button>`)}</div>` : nothing}
              <div class="box">
                <textarea
                  rows="2"
                  aria-label=${this.app ? "Describe a change" : `Describe ${IDIOMS[this.idiom].app} or a screen`}
                  placeholder=${this.app ? "Describe a change, or describe another app" : `Describe ${IDIOMS[this.idiom].app}, or one screen of it`}
                  .value=${this.draft}
                  @input=${(e: InputEvent) => (this.draft = (e.target as HTMLTextAreaElement).value)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void this.say();
                    }
                  }}
                ></textarea>
                <div class="tools">
                  ${this.current?.title
                    ? html`<span class="about" title="Your message applies to the screen that's showing, unless you name a different one.">${icon(screenIcon(this.current.archetype, this.idiom), "xs")}Editing <b>${this.current.title}</b></span>`
                    : html`<span></span>`}
                  ${this.busy && this.turns.at(-1)?.before
                    ? html`<button type="button" class="send" title="Stop and undo this turn" aria-label="Stop and undo this turn" @click=${() => this.undo()}>${icon("stop", "s fill")}</button>`
                    : html`<button type="submit" class="send" ?disabled=${this.busy || !this.draft.trim()} aria-label="Send">${icon("arrow_upward", "s")}</button>`}
                </div>
              </div>
            </form>`
          : this.renderVisitor()}
      </aside>
    `;
  }

  private renderRail() {
    const item = (view: View, symbol: string, name: string, extra = "") =>
      html`<button class=${extra} aria-current=${this.view === view} @click=${() => this.go(view)}>${icon(symbol)}${name}</button>`;
    return html`<nav class="rail" aria-label="Main navigation">
      ${session.makes ? html`<button class="new" title="New apparition" aria-label="New apparition" @click=${() => this.fresh()}>${icon("add")}</button>` : nothing}
      ${item("chat", "chat_bubble", "Chat")} ${item("stage", "smartphone", "Preview", "narrow-only")} ${session.makes ? item("design", "palette", "Design") : nothing}
      ${session.state === "in" || session.state === "stranger" ? item("library", "grid_view", "Library") : nothing}
      <span class="grow"></span>
      ${item("settings", "settings", "Settings")}
    </nav>`;
  }

  private renderBar() {
    const bench = this.view !== "library" && this.view !== "settings";
    const here = this.current;
    const painted = here?.firstPaintMs !== undefined;
    const runs = session.runs;
    const limited = runs && runs.daily !== "unlimited";
    const saved = this.saved;
    return html`<header class="topbar">
      <a class="brand" href="/" title="Apparite" @click=${(e: Event) => (e.preventDefault(), this.go("chat"))}>${mark()}<b>Apparite</b></a>
      ${bench ? this.renderGrammar() : nothing}
      ${bench && this.app
        ? html`${icon("chevron_right", "crumb")}
            <span class="appname" title=${this.app}>${this.appName || "Untitled apparition"}</span>
            ${saved?.mine
              ? html`<button
                  class="vis"
                  title=${saved.visibility === "link" ? "Anyone with the link can open this apparition. Select to make it private." : "Only you can open this apparition. Select to share it with a link."}
                  @click=${() => this.setVisibility(saved.id, saved.visibility === "link" ? "private" : "link").then(() => this.tell(this.saved?.visibility === "link" ? "Anyone with the link can now open this apparition." : "Only you can open this apparition now.")).catch(this.bad)}
                >
                  ${icon(saved.visibility === "link" ? "link" : "lock", "xs")}${saved.visibility === "link" ? "Shared" : "Private"}
                </button>`
              : saved
                ? html`<span class="vis">${icon("person", "xs")}Shared by ${saved.owner || "another user"}</span>`
                : session.state === "in"
                  ? html`<span class="vis quiet">Not saved</span>`
                  : nothing}`
        : nothing}
      <span class="grow"></span>
      ${bench && this.app && session.state === "out" && session.ownKeys
        ? html`<button class="btn" disabled title="To save this apparition, sign in with Google. Signing in doesn't remove your keys.">${icon("bookmark", "s")}<span>Save</span></button>
            <button class="btn primary" disabled title="To share this apparition, sign in with Google.">${icon("link", "s")}<span>Share</span></button>`
        : nothing}
      ${bench && this.app && (session.state === "in" || session.state === "stranger")
        ? html`<button class="btn" ?disabled=${!painted || here!.running || this.busy || Boolean(saved?.mine)} @click=${() => this.save(false)} title="Save this apparition, with every screen and message, so that you can open it later.">
              ${icon("bookmark", saved?.mine ? "s fill" : "s")}<span>${saved?.mine ? "Saved" : "Save"}</span>
            </button>
            ${saved?.mine && saved.visibility === "link"
              ? html`<button class="btn primary" @click=${() => this.copy(this.linkTo(saved.id), "Link copied")}>${icon("content_copy", "s")}<span>Copy link</span></button>`
              : html`<button class="btn primary" ?disabled=${!painted || here!.running || this.busy} @click=${() => this.save(true)} title="Save this apparition and create a link. Anyone with the link can open it without signing in.">${icon("link", "s")}<span>Share</span></button>`}`
        : nothing}
      ${limited ? html`<span class="runs ${runs.left === "0" ? "spent" : ""}" title="You have ${runs.left} of ${runs.daily} runs left today. Generating one screen uses one run."><span class="meter"><i style="width:${(100 * Number(runs.left)) / Math.max(1, Number(runs.daily))}%"></i></span>${runs.left} runs left</span>` : nothing}
      ${session.ownKeys ? html`<button class="runs own" title="Apparite generates screens with your own API keys. Change or remove them in Settings." @click=${() => this.go("settings", "keys")}>${icon("key", "s")}Your keys</button>` : nothing}
      ${session.state === "in" || session.state === "stranger"
        ? html`<button class="facebtn" aria-label="Account" aria-expanded=${this.menu === "account"} @click=${() => (this.menu = this.menu === "account" ? "" : "account")}>${face(session)}</button>`
        : session.state === "out"
          ? html`<button class="btn" title=${session.ownKeys ? "Sign in to save and share apparitions" : ""} @click=${() => session.signIn()}>${icon("login", "s")}<span>Sign in</span></button>`
          : nothing}
    </header>`;
  }

  /** The grammar of what is on the bench, as a step of the path to it: the app's own, or with no app the one new apps are made in. */
  private renderGrammar() {
    const shown = IDIOMS[this.idiom];
    const preset = IDIOMS[this.preset];
    const name = this.appName || "This apparition";
    const title = !this.app
      ? `New apparitions are made as ${preset.app}. To use another grammar, select it here.`
      : this.idiom === this.preset
        ? `${name} is ${shown.app} and stays one. To make new apparitions with another grammar, select it here.`
        : `${name} was made as ${shown.app} and stays one. New apparitions are made as ${preset.app}.`;
    return html`${icon("chevron_right", "crumb")}
      <button
        class="grammar-crumb"
        aria-haspopup="menu"
        aria-expanded=${this.menu === "grammar"}
        title=${title}
        @click=${(e: Event) => {
          this.grammarAt = (e.currentTarget as HTMLElement).getBoundingClientRect().left;
          this.menu = this.menu === "grammar" ? "" : "grammar";
        }}
      >
        ${icon(shown.symbol, "s")}${shown.name}${icon("expand_more", "s")}
      </button>`;
  }

  /** The grammars there are, grouped by what they run on once there are several kinds. Over an app, it says what choosing one does to it. */
  private renderGrammarMenu() {
    const families = [...new Set(IDIOM_IDS.map((id) => IDIOMS[id].family))];
    const name = this.appName || "This apparition";
    return html`<div class="pop grammars" role="menu" aria-label="Grammar" style="left:${Math.max(8, this.grammarAt - 6)}px">
      ${this.app
        ? html`<p class="grammar-note">
            <b>${name} stays ${IDIOMS[this.idiom].app}.</b> Choosing another grammar starts a new apparition.
            ${this.saved?.mine ? "This one stays in your library." : "To keep this one, save it first."}
            ${this.preset !== this.idiom ? html`New apparitions are made as ${IDIOMS[this.preset].app}.` : nothing}
          </p>`
        : nothing}
      ${families.map(
        (family) => html`${families.length > 1 ? html`<div class="grammar-family">${family}</div>` : nothing}
          ${IDIOM_IDS.filter((id) => IDIOMS[id].family === family).map(
            (id) => html`<button class="mi" role="menuitemradio" aria-checked=${id === this.idiom} aria-current=${id === this.idiom} @click=${() => this.pick(id)}>
              ${icon(IDIOMS[id].symbol)}${IDIOMS[id].name}<small>${IDIOMS[id].line}</small>${id === this.idiom ? icon("check", "s tick") : nothing}
            </button>`,
          )}`,
      )}
    </div>`;
  }

  private renderAccountMenu() {
    const runs = session.runs;
    const limited = runs && runs.daily !== "unlimited";
    return html`<div class="pop account" role="menu">
      <div class="who">
        ${face(session, "big")}
        <div><b>${session.name}</b><small>${session.email}</small></div>
        <span class="role ${session.role}">${session.ownKeys ? "Own keys" : titled(session.role)}</span>
      </div>
      <div class="quota">
        ${session.ownKeys
          ? html`<p><b>No daily run limit</b></p>
              <p class="hint">Apparite generates screens with your own API keys.</p>`
          : limited
          ? html`<p>You have <b>${runs.left} of ${runs.daily}</b> runs left today.</p>
              <div class="meter ${runs.left === "0" ? "spent" : ""}"><i style="width:${(100 * Number(runs.left)) / Math.max(1, Number(runs.daily))}%"></i></div>
              <p class="hint">Generating one screen uses one run. Your runs reset at midnight UTC.</p>`
          : html`<p><b>No daily run limit</b></p>`}
      </div>
      <button class="mi" role="menuitem" @click=${() => this.go("settings", "account")}>${icon("settings")}Settings</button>
      <button class="mi" role="menuitem" @click=${() => this.go("library")}>${icon("grid_view")}Library</button>
      ${session.role === "admin" ? html`<button class="mi" role="menuitem" @click=${() => this.go("settings", "access")}>${icon("shield_person")}Access list</button>` : nothing}
      <div class="sep"></div>
      <button class="mi" role="menuitem" @click=${() => ((this.menu = ""), session.signOut())}>${icon("logout")}Sign out</button>
    </div>`;
  }

  private renderStage() {
    const here = this.current;
    const s = here?.stats;
    const theme = this.report?.theme;
    const frame = theme ? { ...theme.vars, "color-scheme": theme.colorScheme, background: theme.vars["--k-page"] } : {};
    const painted = Boolean(here?.firstPaintMs !== undefined);
    const stale = painted && !here!.running && this.report && here!.builtWith !== undefined && this.report.structure !== here!.builtWith;
    // A dialog sits over the screen it was opened from.
    const layers = here?.dialog && this.stack.length > 1 ? this.stack.slice(-2) : here ? [here] : [];
    const made = this.made;
    const wrong = Boolean((s && !s.valid) || here?.log.some((entry) => entry.kind === "note" && entry.tone === "bad"));
    const toggle = (menu: string) => (this.menu = this.menu === menu ? "" : menu);
    // Only a screen that is a destination has a map to show; without one the preview always has the stage.
    const mappable = Boolean(here?.destination) && (this.architecture?.map.nodes.length ?? 0) > 1;
    const onMap = mappable && this.onMap;
    return html`<section class="stage">
      <div class="toolbar">
        ${mappable
          ? html`<div class="segmented stage-pick" role="radiogroup" aria-label="Stage">
              <button role="radio" aria-checked=${!onMap} title="Preview" @click=${() => (this.onMap = false)}>${icon("smartphone", "s")}<span>Preview</span></button>
              <button role="radio" aria-checked=${onMap} title="App map" @click=${() => (this.onMap = true)}>${icon("account_tree", "s")}<span>Map</span></button>
            </div>`
          : nothing}
        <div class="segmented" role="radiogroup" aria-label="Device" ?hidden=${onMap}>
          ${(Object.keys(DEVICES) as Device[]).map((d) => html`<button role="radio" aria-checked=${this.device === d} aria-label=${titled(d)} title=${titled(d)} @click=${() => (this.device = d)}>${icon(DEVICE_ICONS[d], "s")}</button>`)}
        </div>
        <nav class="flow" aria-label="Screens">
          ${!here?.destination && made.length > 1
            ? made.map((screen) => html`<button aria-current=${screen === here} title=${screen.title || "Untitled screen"} @click=${() => this.show(screen)}>${icon(screenIcon(screen.archetype, this.idiom), "xs")}${screen.title || "…"}</button>`)
            : nothing}
        </nav>
        <div class="acts">
          <button class="ib solid" ?disabled=${!here || here.running || !session.makes} @click=${() => this.regenerate()} title="Regenerate this screen" aria-label="Regenerate this screen">${icon("refresh", "s")}</button>
          <button class="ib solid ${wrong ? "wrong" : ""}" ?disabled=${!here} aria-expanded=${this.menu === "info"} @click=${() => toggle("info")} title="How this screen was generated" aria-label="How this screen was generated">${icon("info", "s")}</button>
          <button class="ib solid" ?disabled=${!painted && !theme} aria-expanded=${this.menu === "export"} @click=${() => toggle("export")} title="Export" aria-label="Export">${icon("download", "s")}</button>
        </div>
        ${this.menu === "info" && here
          ? html`<div class="pop info">
              <h4>How this screen was generated</h4>
              <dl>
                <dt>First component</dt><dd>${here.firstPaintMs !== undefined ? `${here.firstPaintMs.toLocaleString()} ms` : "–"}</dd>
                <dt>Total time</dt><dd>${s ? `${s.totalMs.toLocaleString()} ms` : here.running ? "generating…" : "–"}</dd>
                <dt>${named(s?.endpoint)} calls</dt><dd>${s?.jevCalls ?? "–"}</dd>
                <dt>Gemini output tokens</dt><dd>${s?.geminiOutputTokens?.toLocaleString() ?? "–"}</dd>
                <dt>A2UI tree</dt><dd class=${s ? (s.valid ? "good" : "bad") : ""}>${s ? html`${icon(s.valid ? "check_circle" : "error", "xs fill")}${s.valid ? "Valid" : "Invalid"}` : "–"}</dd>
              </dl>
              ${here.log.filter((entry) => entry.kind === "note" && entry.tone === "bad").map((entry) => html`<p class="note bad">${(entry as { text: string }).text}</p>`)}
            </div>`
          : nothing}
        ${this.menu === "export"
          ? html`<div class="pop export" role="menu">
              <button class="mi" role="menuitem" ?disabled=${!painted} @click=${() => this.copy(JSON.stringify(here!.messages, null, 2), "A2UI messages copied")}>${icon("data_object")}Copy A2UI messages</button>
              <button class="mi" role="menuitem" ?disabled=${!theme} @click=${() => this.copy(this.themeCss(), "Theme CSS copied")}>${icon("css")}Copy theme CSS</button>
              <button class="mi" role="menuitem" ?disabled=${!this.markdown} @click=${() => this.copy(this.markdown, "DESIGN.md copied")}>${icon("description")}Copy DESIGN.md</button>
            </div>`
          : nothing}
      </div>
      ${this.unmade && !session.makes
        ? html`<p class="notice">
            ${icon("lock", "s")}<span>No one has generated the screen that “${this.unmade}” leads to. To generate it, sign in, or use your own API keys.</span>
            ${session.state === "out" ? html`<button class="btn small" @click=${() => session.signIn()}>Sign in</button>` : nothing}
            <button class="btn small" @click=${() => session.enter(true)}>Use your own keys</button>
          </p>`
        : nothing}
      ${stale && session.makes ? html`<p class="notice">${icon("info", "s")}<span>The current design uses a different layout for this screen.</span><button class="btn small" @click=${() => this.regenerate()}>Regenerate</button></p>` : nothing}
      ${this.resolving ? html`<p class="notice resolve-status" role="status">Finding “${this.resolving}”…</p>` : nothing}
      <div class="stage-body">
      <!-- The map takes the stage, but the screens stay made: hidden, not thrown away and painted again. -->
      <div class="holder" ?hidden=${onMap}>
        <!-- Drawn at its own size and then made to fit, so that what is seen is the whole device and not as much of it as there is room for. -->
        <div class="device ${this.device}" style="width:${DEVICES[this.device]}px;zoom:${this.fit}">
          <div class="screen" style=${styleMap({ ...frame, height: `${DEVICE_HEIGHTS[this.device]}px` })} @ui-tap=${(e: CustomEvent) => this.follow(e.detail)} @ui-custom-error=${(e: CustomEvent) => this.broke(e.detail)}>
            ${repeat(
              layers,
              (screen) => screen.id,
              (screen, i) => html`<ui-surface class="layer ${screen.dialog && i > 0 ? "over" : ""}" data-screen=${screen.id} ?inert=${i < layers.length - 1}></ui-surface>`,
            )}
            ${painted ? nothing : html`<p class="empty">${here?.running ? html`<span class="dots"><i></i><i></i><i></i></span>Planning the screen…` : html`${icon("draw")}Your preview appears here. Tap any element to explore it.`}</p>`}
          </div>
        </div>
      </div>
      ${onMap
        ? html`<app-map
            .architecture=${this.architecture}
            .titles=${Object.fromEntries(made.filter((s) => s.destination && s.title).map((s) => [s.destination!, s.title]))}
            .icons=${Object.fromEntries(made.filter((s) => s.destination && s.archetype).map((s) => [s.destination!, screenIcon(s.archetype, this.idiom)]))}
            .current=${here?.destination ?? ""}
            .selected=${this.mapSelected}
            .made=${made.filter((s) => !s.running && s.messages.length).flatMap((s) => (s.destination ? [s.destination] : []))}
            .working=${made.filter((s) => s.running).flatMap((s) => (s.destination ? [s.destination] : []))}
            .busy=${this.reading || Boolean(this.resolving)}
            .error=${this.architectureError}
            .issues=${here?.routes?.findings ?? []}
            @map-select=${(e: CustomEvent<string>) => (this.mapSelected = e.detail)}
            @map-open=${(e: CustomEvent<string>) => { this.onMap = false; this.visitDestination(e.detail); }}
          ></app-map>`
        : nothing}
      </div>
    </section>`;
  }

  render() {
    // A saved app is for anyone its owner shares it with, signed in or not; everything else waits for a name.
    const waits = !this.saved && !this.linked;
    if (waits && session.state === "loading") return html`<main class="splash">${mark()}</main>`;
    const gate = waits ? session.gate() : undefined;
    if (gate) return html`${gate}${this.renderSnack()}`;
    const view = this.view === "library" && session.state !== "in" ? "chat" : this.view;
    return html`
      ${this.renderBar()}
      <div class="shell view-${view}">
        ${this.renderRail()}
        ${view === "library"
          ? this.renderLibrary()
          : view === "settings"
            ? html`<jev2ui-settings
                .section=${this.section}
                @section=${(e: CustomEvent<Section>) => this.go("settings", e.detail)}
                @device=${(e: CustomEvent<Device>) => (this.device = e.detail)}
              ></jev2ui-settings>`
            : html`${this.renderChat()}${this.renderStage()}`}
      </div>
      ${this.menu ? html`<div class="scrim" @click=${() => (this.menu = "")}></div>` : nothing}
      ${this.menu === "account" ? this.renderAccountMenu() : nothing}
      ${this.menu === "grammar" ? this.renderGrammarMenu() : nothing}
      ${this.renderSnack()}
    `;
  }

  private renderSnack() {
    const snack = this.snack;
    if (!snack) return nothing;
    return html`<div class="snack ${snack.tone ?? ""}" role="status">
      ${icon(snack.tone === "bad" ? "error" : "check_circle", "s")}<span>${snack.text}</span>
      ${snack.action
        ? html`<button
            @click=${() => {
              this.snack = undefined;
              snack.action!.run();
            }}
          >
            ${snack.action.label}
          </button>`
        : nothing}
      <button class="ib small" aria-label="Dismiss" @click=${() => (this.snack = undefined)}>${icon("close", "s")}</button>
    </div>`;
  }
}
