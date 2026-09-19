// Renderer for the kit catalog (src/shared/kit.ts). One light-DOM element: the
// component list and the data model go in as messages, plain HTML comes out,
// styled by kit.css through the `--k-*` variables a DESIGN.md is turned into.

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { styleMap } from "lit/directives/style-map.js";
import { keyed } from "lit/directives/keyed.js";
import "./picture.js";
import { sandboxDocument, themeMessage, type Definition } from "./sandbox.js";
import type { Theme } from "../../shared/design.js";

type Component = { id: string; component: string } & Record<string, any>;
/** Where relative bindings resolve, and which element of a template this is. */
interface Scope {
  base: string;
  index: number;
}
type Out = TemplateResult | typeof nothing;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Bold, italics, bullets and paragraphs: all the markdown the writers are allowed. */
function markdown(source: string): string {
  const inline = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return source
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      return `<p>${inline(lines.join(" "))}</p>`;
    })
    .join("");
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

@customElement("kit-surface")
export class KitSurface extends LitElement {
  private components = new Map<string, Component>();
  /** The part of the catalog that arrived with the screen: custom components, by id. */
  private definitions = new Map<string, Definition>();
  private data: any = {};
  /** Per custom slot: what its frame should be showing, and what it was last told. */
  private frames = new Map<string, { state: unknown; told?: string; ready?: boolean; error?: string; height?: number; grown?: number }>();
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

  /** What a custom component says: that it is up, that it broke, or what the person did in it. */
  private heard = (event: MessageEvent) => {
    const frame = [...this.querySelectorAll<HTMLIFrameElement>("iframe.k-custom-frame")].find((f) => f.contentWindow === event.source);
    const slot = frame && this.frames.get(frame.dataset.slot!);
    if (!frame || !slot) return;
    const message = event.data ?? {};
    const name = this.read("/custom/name");
    switch (message.type) {
      case "ready":
        slot.ready = true;
        slot.told = undefined;
        frame.contentWindow?.postMessage(themeMessage(this.paint), "*");
        return void this.requestUpdate();
      case "error":
        if (slot.error) return;
        slot.error = String(message.message);
        this.dispatchEvent(new CustomEvent("kit-custom-error", { detail: { name, message: slot.error }, bubbles: true }));
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
        return this.write("/custom/selection", message.value);
      case "open":
        return this.tap("part", message.label, undefined, { data: message.data, component: name });
      case "openItem":
        return this.tap("item", message.item?.title, undefined, { data: message.item });
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
      this.definitions = new Map();
      this.frames = new Map();
      this.data = {};
    }
    for (; this.applied < messages.length; this.applied++) this.apply(messages[this.applied]);
    this.requestUpdate();
  }

  get isDialog() {
    return Boolean(this.components.get("root")?.dialog);
  }

  /** Everything a person can tap reports what it is and the data behind it; what happens next is up to the host. */
  private tap(kind: string, label: unknown, scope?: Scope, extra: Record<string, unknown> = {}) {
    // A tap on one thing carries that thing; a button that acts on the whole screen carries what the screen showed.
    const whole = kind === "action" || kind === "submit";
    const data = scope?.base ? this.read(scope.base) : whole ? JSON.parse(JSON.stringify(this.data, (key, value) => (key === "imageUrl" || key === "nav" ? undefined : value))) : undefined;
    // Of a custom component, the next screen needs to know what was chosen in it, not everything it drew.
    if (whole && data?.custom) data.custom = { component: data.custom.name, chosen: data.custom.selection };
    this.dispatchEvent(new CustomEvent("kit-tap", { detail: { kind, label: String(label ?? ""), data, title: this.read("/header/title"), ...extra }, bubbles: true }));
  }

  /** Switches and checkboxes change their own state in place, so a mock feels alive without a round trip. */
  private flip(scope: Scope) {
    const item = this.read(scope.base);
    if (item && typeof item === "object") item.on = !item.on;
    this.requestUpdate();
  }

  apply(message: Record<string, any>) {
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

  private read(path: string): any {
    let at = this.data;
    for (const key of path.split("/").filter(Boolean)) at = at?.[key];
    return at;
  }

  private absolute = (path: string, scope: Scope) => (path.startsWith("/") ? path : `${scope.base}/${path}`);

  private value(v: any, scope: Scope): any {
    return v && typeof v === "object" && typeof v.path === "string" ? this.read(this.absolute(v.path, scope)) : v;
  }

  // --- Tree ------------------------------------------------------------------

  private kids(children: any, scope: Scope): Out[] {
    if (Array.isArray(children)) return children.map((id) => this.node(id, scope));
    if (!children?.componentId) return [];
    const base = this.absolute(children.path, scope);
    const items = this.read(base);
    return Array.isArray(items) ? items.map((_, index) => this.node(children.componentId, { base: `${base}/${index}`, index })) : [];
  }

  private node(id: string | undefined, scope: Scope): Out {
    const c = id ? this.components.get(id) : undefined;
    if (!c) return nothing;
    const draw = (this as any)[`draw${c.component}`] as ((c: Component, s: Scope) => Out) | undefined;
    return draw ? draw.call(this, c, scope) : nothing;
  }

  render() {
    // A new screen gets new elements: a picture remembers what it has loaded, and must not carry it over.
    return keyed(this.source, this.node("root", { base: "", index: 0 }));
  }

  // --- Helpers ---------------------------------------------------------------

  /** Text that has not arrived yet holds its place with a shimmer, so structure is visible before words. */
  private words(v: any, scope: Scope, width = 60): unknown {
    const text = this.value(v, scope);
    return text === undefined || text === null || text === "" ? html`<span class="k-skel" style="width:${width}%"></span>` : String(text);
  }

  private has(v: any, scope: Scope) {
    const text = this.value(v, scope);
    return text !== undefined && text !== null && text !== "";
  }

  private icon(name: unknown, extra = "") {
    return name ? html`<span class="k-icon material-symbols-outlined ${extra}" aria-hidden="true">${name}</span>` : nothing;
  }

  private flex(c: Component) {
    return c.weight !== undefined ? `flex:${c.weight} 1 0;min-width:0;` : "";
  }

  // --- Frame -----------------------------------------------------------------

  drawScreen(c: Component, s: Scope) {
    return html`<div class="k-screen ${c.dialog ? "k-dialog" : ""}">
      ${this.node(c.appBar, s)}
      <div class="k-scroll"><div class="k-scroll-inner">${this.node(c.body, s)}</div></div>
      ${this.node(c.sticky, s)} ${this.node(c.navBar, s)}
    </div>`;
  }

  drawAppBar(c: Component, s: Scope) {
    const leading = { back: "arrow_back", close: "close", menu: "menu" }[c.leading as string];
    return html`<header class="k-appbar">
      ${leading ? html`<button class="k-iconbtn" aria-label=${c.leading} @click=${() => this.tap("back", c.leading)}>${this.icon(leading)}</button>` : nothing}
      <h1 class="k-appbar-title ${leading ? "" : "k-large"}">${c.title === undefined ? nothing : this.words(c.title, s, 40)}</h1>
      ${(c.actions ?? []).map((name: string) => html`<button class="k-iconbtn" aria-label=${name} @click=${() => this.tap("appbar", name)}>${this.icon(name)}</button>`)}
    </header>`;
  }

  drawNavBar(c: Component, s: Scope) {
    const items: any[] = this.value(c.items, s) ?? [];
    const active = Number(this.value(c.active, s) ?? 0);
    if (!items.length) return html`<nav class="k-navbar"><span class="k-skel" style="width:70%"></span></nav>`;
    return html`<nav class="k-navbar">
      ${items.slice(0, 5).map(
        (item, i) => html`<a class=${i === active ? "k-active" : ""} @click=${() => i !== active && this.tap("nav", item?.label, undefined, { index: i })}>
          ${c.icons === false ? nothing : html`<span class="k-navpill">${this.icon(item?.icon ?? "circle")}</span>`}
          <span>${item?.label ?? ""}</span>
        </a>`,
      )}
    </nav>`;
  }

  drawStickyBar(c: Component, s: Scope) {
    return html`<div class="k-sticky">${this.node(c.child, s)}</div>`;
  }

  // --- Layout ----------------------------------------------------------------

  drawStack(c: Component, s: Scope) {
    return html`<div class="k-stack k-gap-${c.gap ?? "md"} k-pad-${c.pad ?? "none"}" style="${this.flex(c)}align-items:${c.align ?? "stretch"}">${this.kids(c.children, s)}</div>`;
  }

  drawCluster(c: Component, s: Scope) {
    const justify = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" }[(c.justify as string) ?? "start"];
    return html`<div class="k-cluster k-gap-${c.gap ?? "sm"}" style="${this.flex(c)}justify-content:${justify};align-items:${c.align ?? "center"}">
      ${this.kids(c.children, s)}
    </div>`;
  }

  drawGrid(c: Component, s: Scope) {
    return html`<div class="k-grid k-gap-${c.gap ?? "sm"}" style="--k-min:${c.min ?? 140}px">${this.kids(c.children, s)}</div>`;
  }

  drawReel(c: Component, s: Scope) {
    return html`<div class="k-reel k-gap-${c.gap ?? "sm"}" style="--k-item:${c.itemWidth ?? 220}px">${this.kids(c.children, s)}</div>`;
  }

  drawCard(c: Component, s: Scope) {
    return html`<div class="k-card ${c.flat ? "k-flat" : ""} k-pad-${c.pad ?? "md"}" style=${this.flex(c)}>${this.node(c.child, s)}</div>`;
  }

  drawGroup(c: Component, s: Scope) {
    return html`<section class="k-group ${c.flat ? "k-flat" : ""}">
      ${c.title !== undefined ? html`<h3 class="k-group-title">${this.words(c.title, s, 30)}</h3>` : nothing}
      <div class="k-group-rows">${this.kids(c.children, s)}</div>
    </section>`;
  }

  drawDivider() {
    return html`<hr class="k-divider" />`;
  }

  // --- Content ---------------------------------------------------------------

  drawText(c: Component, s: Scope) {
    const text = this.value(c.text, s);
    const cls = `k-text k-${c.role ?? "body"} k-tone-${c.tone ?? "default"}`;
    if (c.markdown && typeof text === "string") return html`<div class="${cls} k-prose" style=${this.flex(c)}>${unsafeHTML(markdown(text))}</div>`;
    return html`<div class=${cls} style=${this.flex(c)}>${this.words(c.text, s)}</div>`;
  }

  drawIcon(c: Component, s: Scope) {
    const name = this.value(c.name, s);
    const size = c.size ? `font-size:${c.size}px;` : "";
    return html`<span class="k-icon-wrap ${c.boxed ? "k-boxed" : ""} k-tone-${c.tone ?? "default"}" style=${size}>${this.icon(name ?? "circle")}</span>`;
  }

  drawImage(c: Component, s: Scope) {
    const url = this.value(c.url, s);
    const style = { "aspect-ratio": (c.ratio ?? "16:9").replace(":", " / "), ...(c.width ? { width: `${c.width}px`, flex: "none" } : {}) };
    return html`<kit-picture class="k-image ${c.bleed ? "k-bleed" : ""}" style=${styleMap(style)} .src=${url} .alt=${this.value(c.alt, s) ?? ""} .icon=${this.value(c.icon, s) ?? "image"}></kit-picture>`;
  }

  drawAvatar(c: Component, s: Scope) {
    const name = this.value(c.name, s);
    const url = this.value(c.url, s);
    return html`<span class="k-avatar" style="--k-size:${c.size ?? 40}px">${initials(String(name ?? ""))}${url ? html`<img src=${url} alt="" @load=${(e: Event) => (e.target as HTMLElement).classList.add("k-in")} />` : nothing}</span>`;
  }

  drawNumeral(_c: Component, s: Scope) {
    return html`<span class="k-numeral">${s.index + 1}</span>`;
  }

  drawBadge(c: Component, s: Scope) {
    if (!this.has(c.text, s)) return nothing;
    return html`<span class="k-badge k-on-${this.value(c.tone, s) ?? "neutral"}">${this.value(c.text, s)}</span>`;
  }

  drawRating(c: Component, s: Scope) {
    const value = Number(this.value(c.value, s));
    if (!Number.isFinite(value)) return nothing;
    const count = this.value(c.count, s);
    return html`<span class="k-rating">${this.icon("star", "k-fill")}<b>${value.toFixed(1)}</b>${count ? html`<span>(${count})</span>` : nothing}</span>`;
  }

  drawProgress(c: Component, s: Scope) {
    const value = Math.min(100, Math.max(0, Number(this.value(c.value, s)) || 0));
    return html`<div class="k-progress k-on-${this.value(c.tone, s) ?? "accent"}" role="progressbar" aria-valuenow=${value}><i style="width:${value}%"></i></div>`;
  }

  drawStat(c: Component, s: Scope) {
    const tone = this.value(c.tone, s) ?? "neutral";
    const delta = this.value(c.delta, s);
    const arrow = typeof delta === "string" && /^\s*[-−▼↓]/.test(delta) ? "arrow_downward" : typeof delta === "string" && /^\s*[+▲↑]/.test(delta) ? "arrow_upward" : "";
    return html`<div class="k-stat ${c.flat ? "k-flat" : ""}">
      <div class="k-text k-label k-tone-muted">${this.words(c.label, s, 50)}</div>
      <div class="k-stat-value">${this.words(c.value, s, 40)}</div>
      ${delta ? html`<span class="k-delta k-on-${tone}">${this.icon(arrow)}${String(delta).replace(/^\s*[+\-−▲▼↑↓]\s*/, "")}</span>` : nothing}
    </div>`;
  }

  drawKeyValue(c: Component, s: Scope) {
    return html`<div class="k-kv ${this.value(c.strong, s) ? "k-strong" : ""}">
      <span>${this.words(c.label, s, 30)}</span><span>${this.words(c.value, s, 20)}</span>
    </div>`;
  }

  drawStep(c: Component, s: Scope) {
    return html`<div class="k-step">
      <span class="k-numeral">${s.index + 1}</span>
      <div>
        <div class="k-text k-title">${this.words(c.title, s, 50)}</div>
        ${c.detail !== undefined ? html`<div class="k-text k-body k-tone-muted">${this.words(c.detail, s, 90)}</div>` : nothing}
      </div>
    </div>`;
  }

  drawBanner(c: Component, s: Scope) {
    const tone = this.value(c.tone, s) ?? "accent";
    const fallback = { danger: "error", warning: "warning", success: "check_circle" }[tone as string] ?? "info";
    return html`<div class="k-banner k-on-${tone}">
      ${this.icon(this.value(c.icon, s) ?? fallback)}
      <div>
        <div class="k-text k-title">${this.words(c.title, s, 50)}</div>
        ${c.text !== undefined ? html`<div class="k-text k-body">${this.words(c.text, s, 90)}</div>` : nothing}
      </div>
    </div>`;
  }

  drawListItem(c: Component, s: Scope) {
    return html`<div class="k-item k-tappable" style=${this.flex(c)} @click=${() => this.tap("item", this.value(c.headline, s), s)}>
      ${c.leading ? html`<div class="k-item-leading">${this.node(c.leading, s)}</div>` : nothing}
      <div class="k-item-main">
        ${c.overline !== undefined && this.has(c.overline, s) ? html`<div class="k-text k-label k-tone-muted">${this.value(c.overline, s)}</div>` : nothing}
        <div class="k-item-head">
          <div class="k-text k-title">${this.words(c.headline, s, 55)}</div>
          ${c.meta !== undefined && this.has(c.meta, s) ? html`<div class="k-item-meta">${this.value(c.meta, s)}</div>` : nothing}
        </div>
        ${c.supporting !== undefined ? html`<div class="k-text k-caption k-tone-muted k-clamp">${this.words(c.supporting, s, 85)}</div>` : nothing}
        ${c.below ? html`<div class="k-item-below">${this.node(c.below, s)}</div>` : nothing}
      </div>
      ${c.trailing ? html`<div class="k-item-trailing">${this.node(c.trailing, s)}</div>` : nothing}
    </div>`;
  }

  drawSettingRow(c: Component, s: Scope) {
    const control = this.value(c.control, s) ?? "nav";
    const on = Boolean(this.value(c.on, s));
    const icon = this.value(c.icon, s);
    const value = this.value(c.value, s);
    const press = () => (control === "switch" || control === "check" ? this.flip(s) : this.tap("row", this.value(c.label, s), s));
    return html`<div class="k-item k-setting k-tappable ${control === "danger" ? "k-tone-danger" : ""}" @click=${press}>
      ${icon ? html`<div class="k-item-leading"><span class="k-icon-wrap k-tone-muted">${this.icon(icon)}</span></div>` : nothing}
      <div class="k-item-main">
        <div class="k-text k-body">${this.words(c.label, s, 45)}</div>
        ${this.has(c.detail, s) ? html`<div class="k-text k-caption k-tone-muted">${this.value(c.detail, s)}</div>` : nothing}
      </div>
      <div class="k-item-trailing">
        ${control === "switch"
          ? html`<span class="k-switch ${on ? "k-checked" : ""}"><i></i></span>`
          : control === "check"
            ? html`<span class="k-check ${on ? "k-checked" : ""}">${on ? this.icon("check") : nothing}</span>`
            : control === "danger"
              ? nothing
              : html`${control === "value" && value ? html`<span class="k-text k-body k-tone-muted">${value}</span>` : nothing}${this.icon("chevron_right", "k-chevron")}`}
      </div>
    </div>`;
  }

  // --- Custom ----------------------------------------------------------------

  /** A box of known shape from the first paint. What goes in it is baked meanwhile, and runs in a frame of its own. */
  drawCustom(c: Component, s: Scope) {
    if (this.value(c.failed, s)) return nothing;
    const definition = this.definitions.get(this.value(c.use, s));
    const slot = this.frames.get(c.id) ?? { state: undefined };
    this.frames.set(c.id, slot);
    slot.state = { data: this.value(c.data, s), ...(c.items ? { items: this.value(c.items, s) ?? [] } : {}) };
    const box = slot.height ? { height: `${slot.height}px`, "max-height": "none" } : { "aspect-ratio": String(c.ratio).replace(":", " / ") };
    if (slot.error) return html`<div class="k-custom k-custom-broken" style=${styleMap(box)}>${this.icon("heart_broken")}<span class="k-text k-caption k-tone-muted">${slot.error}</span></div>`;
    return html`<div class="k-custom ${definition && slot.ready ? "" : "k-custom-baking"}" style=${styleMap(box)}>
      ${definition ? html`<iframe class="k-custom-frame" data-slot=${c.id} sandbox="allow-scripts" title=${definition.name} .srcdoc=${sandboxDocument(definition)}></iframe>` : nothing}
    </div>`;
  }

  // --- Input -----------------------------------------------------------------

  drawSearch(c: Component, s: Scope) {
    return html`<div class="k-search">${this.icon("search")}<span>${this.words(c.placeholder, s, 50)}</span></div>`;
  }

  drawChips(c: Component, s: Scope) {
    const items: unknown[] = this.value(c.items, s) ?? [];
    return html`<div class="k-chips">${items.map((label, i) => html`<span class="k-chip ${i === (c.active ?? 0) ? "k-checked" : ""}">${label}</span>`)}</div>`;
  }

  drawButton(c: Component, s: Scope) {
    const classes = `k-button k-${this.value(c.variant, s) ?? "secondary"} ${c.full ? "k-full" : ""} ${c.small ? "k-small" : ""}`;
    const fire = (e: Event) => {
      e.stopPropagation(); // a button on a list item acts on the item; it does not open it
      this.tap(c.event ?? "action", this.value(c.label, s), s, { variant: this.value(c.variant, s) });
    };
    return html`<button class=${classes} style=${this.flex(c)} @click=${fire}>${this.icon(this.value(c.icon, s))}<span>${this.words(c.label, s, 70)}</span></button>`;
  }

  drawSwitch(c: Component, s: Scope) {
    const flip = (e: Event) => (e.stopPropagation(), this.flip(s));
    return html`<span class="k-switch k-tappable ${this.value(c.on, s) ? "k-checked" : ""}" @click=${flip}><i></i></span>`;
  }

  drawCheckbox(c: Component, s: Scope) {
    const on = Boolean(this.value(c.on, s));
    const flip = (e: Event) => (e.stopPropagation(), this.flip(s));
    return html`<span class="k-check k-tappable ${on ? "k-checked" : ""}" @click=${flip}>${on ? this.icon("check") : nothing}</span>`;
  }

  drawField(c: Component, s: Scope) {
    const kind = this.value(c.kind, s) ?? "text";
    const placeholder = this.value(c.placeholder, s) ?? "";
    const options: unknown[] = this.value(c.options, s) ?? [];
    const label = html`<label class="k-text k-label">${this.words(c.label, s, 35)}</label>`;
    if (kind === "checkbox") return html`<div class="k-field k-inline"><span class="k-check"></span>${label}</div>`;
    if (kind === "chips" || kind === "multi") {
      return html`<div class="k-field">${label}
        <div class="k-chips">${options.map((o, i) => html`<span class="k-chip ${i === 0 ? "k-checked" : ""}">${o}</span>`)}</div>
      </div>`;
    }
    if (kind === "slider") {
      const [min, max] = [Number(this.value(c.min, s) ?? 0), Number(this.value(c.max, s) ?? 100)];
      return html`<div class="k-field">${label}
        <div class="k-slider"><i style="width:40%"></i><b style="left:40%"></b></div>
        <div class="k-slider-ends k-text k-caption k-tone-muted"><span>${min}</span><span>${max}</span></div>
      </div>`;
    }
    const trailing = { select: "expand_more", date: "calendar_today", dateTime: "calendar_today", time: "schedule", password: "visibility_off" }[kind as string];
    const shown = kind === "select" && options.length ? options[0] : placeholder;
    return html`<div class="k-field">${label}
      <div class="k-input ${kind === "long" ? "k-long" : ""}"><span class=${kind === "select" ? "" : "k-placeholder"}>${kind === "password" ? "••••••••" : shown}</span>${this.icon(trailing)}</div>
    </div>`;
  }
}
