// The surface a screen is drawn on, whatever catalog draws it (docs/grammar.md, step 9). One light-DOM element: the
// component list and the data model go in as messages, plain HTML comes out, styled by the idiom's stylesheets
// (kit/idioms.ts) through the `--k-*` variables a DESIGN.md is turned into.
//
// What is here is every set's (shared/components.ts): the data model and its bindings, a template stamped once per
// element of an array (and over nothing, shimmering, until the array arrives), taps reported to the host, and the slot
// a baked component runs in. How each component looks is its set's drawing (sets.ts), chosen by the catalog id the
// surface is created with. Nothing here knows a component, a part or a path by name.

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { keyed } from "lit/directives/keyed.js";
import { sandboxDocument, themeMessage, type Definition } from "./kit/sandbox.js";
import { stylesOf } from "./kit/idioms.js";
import { drawingOf, type Drawing } from "./sets.js";
import type { Theme } from "../shared/design.js";

export type Component = { id: string; component: string } & Record<string, any>;
/** Where relative bindings resolve, and which element of a template this is. */
export interface Scope {
  base: string;
  index: number;
  /** Holds the place of an element that has not been written yet: it shimmers, and there is nothing to tap. */
  ghost?: boolean;
  /** The group it is in, as the container that groups it said: a tap on a row says which section it was in. */
  group?: string;
}
export type Out = TemplateResult | typeof nothing;

/** A slot a baked component runs in: what its frame should be showing and was last told, and where the slot's own things are. */
interface Slot {
  state: unknown;
  told?: string;
  ready?: boolean;
  error?: string;
  height?: number;
  grown?: number;
  /** The name of what fills it. */
  name?: string;
  /** Where the slot's plumbing is (what fills it, its data, what was picked in it), where what is picked is written, and the list whose items it draws. */
  root?: string;
  selection?: string;
  items?: string;
}

@customElement("ui-surface")
export class Surface extends LitElement {
  /** Host-supplied icons also repair placeholders in previously generated navigation. */
  navigationIcons: Readonly<Record<string, string>> = {};
  /** The idiom's stylesheets, as the page has them: a baked component's frame is handed the same. */
  @property({ attribute: false }) stylesheet = stylesOf("kit");
  private components = new Map<string, Component>();
  /** How each component is drawn: the set the surface was created with. */
  private drawing: Drawing = drawingOf(undefined);
  /** The part of the catalog that arrived with the screen: custom components, by id. */
  private definitions = new Map<string, Definition>();
  private data: any = {};
  /** Per slot a baked component runs in, by the id of the component that is the slot. */
  private frames = new Map<string, Slot>();
  private paint: Theme | undefined;

  /** Frames cannot inherit the design's variables, so they are told. */
  set theme(theme: Theme | undefined) {
    if (theme === this.paint) return;
    this.paint = theme;
    for (const frame of this.querySelectorAll<HTMLIFrameElement>("iframe.k-custom-frame")) if (this.frames.get(frame.dataset.slot!)?.ready) frame.contentWindow?.postMessage(themeMessage(theme), "*");
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("message", this.heard);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("message", this.heard);
  }

  /** What a baked component says: that it is up, that it broke, or what the person did in it. */
  private heard = (event: MessageEvent) => {
    const frame = [...this.querySelectorAll<HTMLIFrameElement>("iframe.k-custom-frame")].find((f) => f.contentWindow === event.source);
    const slot = frame && this.frames.get(frame.dataset.slot!);
    if (!frame || !slot) return;
    const message = event.data ?? {};
    const name = slot.name;
    switch (message.type) {
      case "ready":
        slot.ready = true;
        slot.told = undefined;
        frame.contentWindow?.postMessage(themeMessage(this.paint), "*");
        return void this.requestUpdate();
      case "error":
        if (slot.error) return;
        slot.error = String(message.message);
        this.dispatchEvent(new CustomEvent("ui-custom-error", { detail: { name, message: slot.error }, bubbles: true }));
        return void this.requestUpdate();
      case "overflow": {
        // Grows only, a few times at most, and never past a screenful: content sized in percent would chase the box for ever.
        const height = Math.min(Math.ceil(Number(message.height)), 900);
        if (!(height > (slot.height ?? 0)) || (slot.grown ?? 0) >= 4) return;
        slot.height = height;
        slot.grown = (slot.grown ?? 0) + 1;
        return void this.requestUpdate();
      }
      case "select":
        // Kept beside the component's data, so the screen's buttons carry what was chosen to the next screen.
        return void (slot.selection && this.write(slot.selection, message.value));
      case "open":
        return this.tap("part", message.label, undefined, { data: message.data, component: name });
      case "openItem": {
        const items = slot.items ? this.read(slot.items) : undefined;
        const index = Array.isArray(items) ? items.findIndex((item: any) => JSON.stringify(item) === JSON.stringify(message.item)) : -1;
        return this.tap("item", message.item?.title, undefined, { data: message.item, source: index >= 0 ? `item:${slot.items}/${index}` : "custom:outside" });
      }
    }
  };

  protected updated() {
    for (const frame of this.querySelectorAll<HTMLIFrameElement>("iframe.k-custom-frame")) {
      const slot = this.frames.get(frame.dataset.slot!);
      const state = JSON.stringify(slot?.state ?? {});
      if (!slot?.ready || slot.told === state) continue;
      slot.told = state;
      frame.contentWindow?.postMessage({ state: JSON.parse(state) }, "*");
    }
  }

  protected createRenderRoot() {
    return this;
  }

  private applied = 0;
  private source: unknown[] | undefined;

  /** Brings the surface up to date with a growing list of messages. A different list starts it over. */
  sync(messages: Array<Record<string, any>>) {
    if (messages !== this.source) {
      this.source = messages;
      this.applied = 0;
      this.components = new Map();
      this.drawing = drawingOf(undefined);
      this.definitions = new Map();
      this.frames = new Map();
      this.data = {};
    }
    for (; this.applied < messages.length; this.applied++) this.apply(messages[this.applied]);
    this.requestUpdate();
  }

  /** Everything a person can tap reports what it is and the data behind it; what happens next is up to the host. */
  tap(kind: string, label: unknown, scope?: Scope, extra: Record<string, unknown> = {}) {
    if (scope?.ghost) return;
    // A tap on one thing carries that thing; a button that acts on the whole screen carries what the screen showed.
    const whole = kind === "action" || kind === "submit";
    const data = scope?.base ? this.read(scope.base) : whole ? JSON.parse(JSON.stringify(this.data)) : undefined;
    // Of a baked component, the next screen needs to know what was chosen in it, not everything it drew.
    if (whole) for (const slot of this.frames.values()) if (slot.root) this.chosen(data, slot.root);
    this.dispatchEvent(new CustomEvent("ui-tap", { detail: { ...(scope?.group !== undefined ? { group: scope.group } : {}), source: kind === "back" ? "back" : `${kind}:${scope?.base ?? String(label ?? "")}`, kind, label: String(label ?? ""), data, ...extra }, bubbles: true }));
  }

  /** In a copy of the data model, what a slot holds, told as what was chosen in which component. */
  private chosen(data: any, root: string) {
    const keys = root.split("/").filter(Boolean);
    const parent = keys.slice(0, -1).reduce((at, key) => at?.[key], data);
    const held = parent?.[keys.at(-1)!];
    if (held && typeof held === "object") parent[keys.at(-1)!] = { component: held.name, chosen: held.selection };
  }

  /** Switches and checkboxes change their own state in place, so a mock feels alive without a round trip. */
  flip(scope: Scope) {
    if (scope.ghost) return;
    const item = this.read(scope.base);
    if (item && typeof item === "object") item.on = !item.on;
    this.requestUpdate();
  }

  apply(message: Record<string, any>) {
    if (message.createSurface) this.drawing = drawingOf(message.createSurface.catalogId);
    if (message.updateComponents) for (const c of message.updateComponents.components) this.components.set(c.id, c);
    if (message.defineComponent) this.definitions.set(message.defineComponent.id, message.defineComponent);
    if (message.updateDataModel) this.write(message.updateDataModel.path ?? "/", message.updateDataModel.value);
    this.requestUpdate();
  }

  // --- Data model ------------------------------------------------------------

  private write(path: string, value: unknown) {
    const keys = path.split("/").filter(Boolean);
    if (!keys.length) return void (this.data = value ?? {});
    let at = this.data;
    for (const key of keys.slice(0, -1)) at = at[key] ??= {};
    at[keys.at(-1)!] = value;
  }

  read(path: string): any {
    let at = this.data;
    for (const key of path.split("/").filter(Boolean)) at = at?.[key];
    return at;
  }

  absolute = (path: string, scope: Scope) => (path.startsWith("/") ? path : `${scope.base}/${path}`);

  value(v: any, scope: Scope): any {
    return v && typeof v === "object" && typeof v.path === "string" ? this.read(this.absolute(v.path, scope)) : v;
  }

  // --- Tree ------------------------------------------------------------------

  /**
   * A template is stamped once for each element of its array. Until the first element is written, it is stamped `ghosts`
   * times over nothing, so that a list is on screen before its words, as the words of a heading are.
   */
  kids(children: any, scope: Scope, ghosts = 3): Out[] {
    if (Array.isArray(children)) return children.map((id) => this.node(id, scope));
    if (!children?.componentId) return [];
    const base = this.absolute(children.path, scope);
    const items = this.read(base);
    const group = scope.group !== undefined ? { group: scope.group } : {};
    if (Array.isArray(items) && items.length) return items.map((_, index) => this.node(children.componentId, { base: `${base}/${index}`, index, ...group }));
    return Array.from({ length: ghosts }, (_, index) => this.node(children.componentId, { base: `${base}/${index}`, index, ghost: true, ...group }));
  }

  node(id: string | undefined, scope: Scope): Out {
    const c = id ? this.components.get(id) : undefined;
    if (!c) return nothing;
    const draw = this.drawing[c.component];
    return draw ? draw.call(this, c, scope) : nothing;
  }

  render() {
    // A new screen gets new elements: a picture remembers what it has loaded, and must not carry it over.
    return keyed(this.source, this.node("root", { base: "", index: 0 }));
  }

  // --- Helpers for drawing ---------------------------------------------------------

  /** Text that has not arrived yet holds its place with a shimmer, so structure is visible before words. */
  words(v: any, scope: Scope, width = 60): unknown {
    const text = this.value(v, scope);
    return text === undefined || text === null || text === "" ? html`<span class="k-skel" style="width:${width}%"></span>` : String(text);
  }

  has(v: any, scope: Scope) {
    const text = this.value(v, scope);
    return text !== undefined && text !== null && text !== "";
  }

  icon(name: unknown, extra = "") {
    return name ? html`<span class="k-icon material-symbols-outlined ${extra}" aria-hidden="true">${name}</span>` : nothing;
  }

  flex(c: Component) {
    return c.weight !== undefined ? `flex:${c.weight} 1 0;min-width:0;` : "";
  }

  // --- The slot a baked component runs in ------------------------------------------

  /**
   * A box of known shape from the first paint, for a component a set's slot names by its `use`. What goes in it is
   * baked meanwhile, and runs in a frame of its own. Where the slot's plumbing is, is the slot's to say: what fills it is
   * at its `use`, and what is picked in it goes to its `selection`.
   */
  baked(c: Component, s: Scope, box: Record<string, string>): Out {
    const slot = this.frames.get(c.id) ?? { state: undefined };
    this.frames.set(c.id, slot);
    const at = (v: any) => (v && typeof v === "object" && typeof v.path === "string" ? this.absolute(v.path, s) : undefined);
    slot.root = at(c.use)?.replace(/\/use$/, "");
    slot.selection = at(c.selection);
    slot.items = at(c.items);
    if (this.value(c.failed, s)) return nothing;
    const definition = this.definitions.get(this.value(c.use, s));
    slot.name = definition?.name;
    slot.state = { data: this.value(c.data, s), ...(c.items ? { items: this.value(c.items, s) ?? [] } : {}) };
    const shape = slot.height ? { height: `${slot.height}px`, "max-height": "none" } : box;
    if (slot.error) return html`<div class="k-custom k-custom-broken" style=${styleMap(shape)}>${this.icon("heart_broken")}<span class="k-text k-caption k-tone-muted">${slot.error}</span></div>`;
    return html`<div class="k-custom ${definition && slot.ready ? "" : "k-custom-baking"}" style=${styleMap(shape)}>
      ${definition ? html`<iframe class="k-custom-frame" data-slot=${c.id} sandbox="allow-scripts" title=${definition.name} .srcdoc=${sandboxDocument(definition, this.stylesheet)}></iframe>` : nothing}
    </div>`;
  }
}
