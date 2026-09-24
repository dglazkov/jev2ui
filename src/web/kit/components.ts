// The kit's components, drawn (shared/kit.ts): the tool's own set, and the one the iOS idiom's frame is drawn over
// (ios.ts). Each is drawn on the general surface (../surface.ts), which binds, stamps templates, reports taps and runs
// what is baked; what is here is only how each of the kit's components looks, as plain HTML under the `k-` classes
// kit.css paints.

import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { styleMap } from "lit/directives/style-map.js";
import "./picture.js";
import { orderedNavigation } from "../../shared/navigation.js";
import type { Component, Scope, Surface } from "../surface.js";
import type { Drawing } from "../sets.js";

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

export const KIT_DRAWING: Drawing = {
  // --- Frame -----------------------------------------------------------------

  Screen(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-screen ${c.dialog ? "k-dialog" : ""}">
      ${this.node(c.appBar, s)}
      <div class="k-scroll"><div class="k-scroll-inner">${this.node(c.body, s)}</div></div>
      ${this.node(c.sticky, s)} ${this.node(c.navBar, s)}
    </div>`;
  },

  AppBar(this: Surface, c: Component, s: Scope) {
    const leading = { back: "arrow_back", close: "close", menu: "menu" }[c.leading as string];
    return html`<header class="k-appbar">
      ${leading ? html`<button class="k-iconbtn" aria-label=${c.leading} @click=${() => this.tap("back", c.leading)}>${this.icon(leading)}</button>` : nothing}
      <h1 class="k-appbar-title ${leading ? "" : "k-large"}">${c.title === undefined ? nothing : this.words(c.title, s, 40)}</h1>
      ${(c.actions ?? []).map((name: string) => html`<button class="k-iconbtn" aria-label=${name} @click=${() => this.tap("appbar", name)}>${this.icon(name)}</button>`)}
    </header>`;
  },

  NavBar(this: Surface, c: Component, s: Scope) {
    const items: any[] = this.value(c.items, s) ?? [];
    const active = Number(this.value(c.active, s) ?? 0);
    if (!items.length) return html`<nav class="k-navbar"><span class="k-skel" style="width:70%"></span></nav>`;
    if (items.length === 1 && active === 0) return nothing;
    const symbolOf = (item: any): string | undefined => (c.icon?.path ? this.value(c.icon, { base: `${this.absolute(c.items.path, s)}/${items.indexOf(item)}`, index: items.indexOf(item) }) : item?.icon);
    return html`<nav class="k-navbar">
      ${orderedNavigation(items).slice(0, 5).map(
        ({ item, index: i }) => html`<a class=${i === active ? "k-active" : ""} @click=${() => i !== active && this.tap("nav", item?.label, undefined, { index: i, source: `nav:${item?.destination}` })}>
          ${c.icons === false ? nothing : html`<span class="k-navpill">${this.icon(symbolOf(item) && symbolOf(item) !== "circle" ? symbolOf(item) : this.navigationIcons[item?.destination] ?? symbolOf(item) ?? "circle")}</span>`}
          <span>${item?.label ?? ""}</span>
        </a>`,
      )}
    </nav>`;
  },

  StickyBar(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-sticky">${this.node(c.child, s)}</div>`;
  },

  // --- Layout ----------------------------------------------------------------

  Stack(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-stack k-gap-${c.gap ?? "md"} k-pad-${c.pad ?? "none"}" style="${this.flex(c)}align-items:${c.align ?? "stretch"}">${this.kids(c.children, s)}</div>`;
  },

  Cluster(this: Surface, c: Component, s: Scope) {
    const justify = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" }[(c.justify as string) ?? "start"];
    return html`<div class="k-cluster k-gap-${c.gap ?? "sm"}" style="${this.flex(c)}justify-content:${justify};align-items:${c.align ?? "center"}">
      ${this.kids(c.children, s, 1)}
    </div>`;
  },

  Grid(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-grid k-gap-${c.gap ?? "sm"}" style="--k-min:${c.min ?? 140}px">${this.kids(c.children, s, 4)}</div>`;
  },

  Reel(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-reel k-gap-${c.gap ?? "sm"}" style="--k-item:${c.itemWidth ?? 220}px">${this.kids(c.children, s)}</div>`;
  },

  Card(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-card ${c.flat ? "k-flat" : ""} k-pad-${c.pad ?? "md"}" style=${this.flex(c)}>${this.node(c.child, s)}</div>`;
  },

  Group(this: Surface, c: Component, s: Scope) {
    // A tap on a row says which section it was in.
    const title = this.value(c.title, s);
    return html`<section class="k-group ${c.flat ? "k-flat" : ""}">
      ${c.title !== undefined ? html`<h3 class="k-group-title">${this.words(c.title, s, 30)}</h3>` : nothing}
      <div class="k-group-rows">${this.kids(c.children, typeof title === "string" ? { ...s, group: title } : s)}</div>
    </section>`;
  },

  Divider(this: Surface) {
    return html`<hr class="k-divider" />`;
  },

  // --- Content ---------------------------------------------------------------

  Text(this: Surface, c: Component, s: Scope) {
    const text = this.value(c.text, s);
    const cls = `k-text k-${c.role ?? "body"} k-tone-${c.tone ?? "default"}`;
    if (c.markdown && typeof text === "string") return html`<div class="${cls} k-prose" style=${this.flex(c)}>${unsafeHTML(markdown(text))}</div>`;
    return html`<div class=${cls} style=${this.flex(c)}>${this.words(c.text, s)}</div>`;
  },

  Icon(this: Surface, c: Component, s: Scope) {
    const name = this.value(c.name, s);
    const size = c.size ? `font-size:${c.size}px;` : "";
    return html`<span class="k-icon-wrap ${c.boxed ? "k-boxed" : ""} k-tone-${c.tone ?? "default"}" style=${size}>${this.icon(name ?? "circle")}</span>`;
  },

  Image(this: Surface, c: Component, s: Scope) {
    const url = this.value(c.url, s);
    const style = { "aspect-ratio": (c.ratio ?? "16:9").replace(":", " / "), ...(c.width ? { width: `${c.width}px`, flex: "none" } : {}) };
    return html`<kit-picture class="k-image ${c.bleed ? "k-bleed" : ""}" style=${styleMap(style)} .src=${url} .alt=${this.value(c.alt, s) ?? ""} .icon=${this.value(c.icon, s) ?? "image"}></kit-picture>`;
  },

  Avatar(this: Surface, c: Component, s: Scope) {
    const name = this.value(c.name, s);
    const url = this.value(c.url, s);
    return html`<span class="k-avatar" style="--k-size:${c.size ?? 40}px">${initials(String(name ?? ""))}${url ? html`<img src=${url} alt="" @load=${(e: Event) => (e.target as HTMLElement).classList.add("k-in")} />` : nothing}</span>`;
  },

  Numeral(this: Surface, _c: Component, s: Scope) {
    return html`<span class="k-numeral">${s.index + 1}</span>`;
  },

  Badge(this: Surface, c: Component, s: Scope) {
    if (!this.has(c.text, s)) return nothing;
    return html`<span class="k-badge k-on-${this.value(c.tone, s) ?? "neutral"}">${this.value(c.text, s)}</span>`;
  },

  Rating(this: Surface, c: Component, s: Scope) {
    const value = Number(this.value(c.value, s));
    if (!Number.isFinite(value)) return nothing;
    const count = this.value(c.count, s);
    return html`<span class="k-rating">${this.icon("star", "k-fill")}<b>${value.toFixed(1)}</b>${count ? html`<span>(${count})</span>` : nothing}</span>`;
  },

  Progress(this: Surface, c: Component, s: Scope) {
    const value = Math.min(100, Math.max(0, Number(this.value(c.value, s)) || 0));
    return html`<div class="k-progress k-on-${this.value(c.tone, s) ?? "accent"}" role="progressbar" aria-valuenow=${value}><i style="width:${value}%"></i></div>`;
  },

  Stat(this: Surface, c: Component, s: Scope) {
    const tone = this.value(c.tone, s) ?? "neutral";
    const delta = this.value(c.delta, s);
    const arrow = typeof delta === "string" && /^\s*[-−▼↓]/.test(delta) ? "arrow_downward" : typeof delta === "string" && /^\s*[+▲↑]/.test(delta) ? "arrow_upward" : "";
    return html`<div class="k-stat ${c.flat ? "k-flat" : ""}">
      <div class="k-text k-label k-tone-muted">${this.words(c.label, s, 50)}</div>
      <div class="k-stat-value">${this.words(c.value, s, 40)}</div>
      ${delta ? html`<span class="k-delta k-on-${tone}">${this.icon(arrow)}${String(delta).replace(/^\s*[+\-−▲▼↑↓]\s*/, "")}</span>` : nothing}
    </div>`;
  },

  KeyValue(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-kv ${this.value(c.strong, s) ? "k-strong" : ""}">
      <span>${this.words(c.label, s, 30)}</span><span>${this.words(c.value, s, 20)}</span>
    </div>`;
  },

  Step(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-step">
      <span class="k-numeral">${s.index + 1}</span>
      <div>
        <div class="k-text k-title">${this.words(c.title, s, 50)}</div>
        ${c.detail !== undefined ? html`<div class="k-text k-body k-tone-muted">${this.words(c.detail, s, 90)}</div>` : nothing}
      </div>
    </div>`;
  },

  Banner(this: Surface, c: Component, s: Scope) {
    const tone = this.value(c.tone, s) ?? "accent";
    const fallback = { danger: "error", warning: "warning", success: "check_circle" }[tone as string] ?? "info";
    return html`<div class="k-banner k-on-${tone}">
      ${this.icon(this.value(c.icon, s) ?? fallback)}
      <div>
        <div class="k-text k-title">${this.words(c.title, s, 50)}</div>
        ${c.text !== undefined ? html`<div class="k-text k-body">${this.words(c.text, s, 90)}</div>` : nothing}
      </div>
    </div>`;
  },

  ListItem(this: Surface, c: Component, s: Scope) {
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
  },

  SettingRow(this: Surface, c: Component, s: Scope) {
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
  },

  // --- Custom ----------------------------------------------------------------

  /** The slot a baked component runs in, a box of the ratio the graph asked for from the first paint (../surface.ts). */
  Custom(this: Surface, c: Component, s: Scope) {
    return this.baked(c, s, { "aspect-ratio": String(c.ratio).replace(":", " / ") });
  },

  // --- Input -----------------------------------------------------------------

  Search(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-search">${this.icon("search")}<span>${this.words(c.placeholder, s, 50)}</span></div>`;
  },

  Chips(this: Surface, c: Component, s: Scope) {
    const items: unknown[] = this.value(c.items, s) ?? [];
    return html`<div class="k-chips">${items.map((label, i) => html`<span class="k-chip ${i === (c.active ?? 0) ? "k-checked" : ""}">${label}</span>`)}</div>`;
  },

  Button(this: Surface, c: Component, s: Scope) {
    const classes = `k-button k-${this.value(c.variant, s) ?? "secondary"} ${c.full ? "k-full" : ""} ${c.small ? "k-small" : ""}`;
    const fire = (e: Event) => {
      e.stopPropagation(); // a button on a list item acts on the item; it does not open it
      if (this.value(c.closes, s) === true) return this.tap("back", this.value(c.label, s), s);
      this.tap(c.event ?? "action", this.value(c.label, s), s, { variant: this.value(c.variant, s), source: c.id === "form_submit" ? "submit:form_submit" : `${c.event ?? "action"}:${s?.base ?? c.id}` });
    };
    return html`<button class=${classes} style=${this.flex(c)} @click=${fire}>${this.icon(this.value(c.icon, s))}<span>${this.words(c.label, s, 70)}</span></button>`;
  },

  Switch(this: Surface, c: Component, s: Scope) {
    const flip = (e: Event) => (e.stopPropagation(), this.flip(s));
    return html`<span class="k-switch k-tappable ${this.value(c.on, s) ? "k-checked" : ""}" @click=${flip}><i></i></span>`;
  },

  Checkbox(this: Surface, c: Component, s: Scope) {
    const on = Boolean(this.value(c.on, s));
    const flip = (e: Event) => (e.stopPropagation(), this.flip(s));
    return html`<span class="k-check k-tappable ${on ? "k-checked" : ""}" @click=${flip}>${on ? this.icon("check") : nothing}</span>`;
  },

  Field(this: Surface, c: Component, s: Scope) {
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
  },
};
