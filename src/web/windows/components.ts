// Windows's components, drawn (shared/windows.ts): WinUI's controls as plain HTML under `w-` classes, painted by
// windows.css. Each is drawn on the general surface (../surface.ts), which binds, stamps templates, reports taps and
// runs what is baked; nothing here is the kit's. Taps are reported in the surface's words (item, row, nav, appbar,
// action, submit, back), which is what the app map follows (docs/grammar.md, item 64).

import { html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import "../kit/picture.js";
import { orderedNavigation } from "../../shared/navigation.js";
import type { Component, Scope, Surface } from "../surface.js";
import type { Drawing } from "../sets.js";

const CAPTION = html`<span class="w-captionbuttons" aria-hidden="true">
  <i><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></i>
  <i><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" /></svg></i>
  <i class="w-close"><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></i>
</span>`;

const SEVERITY_ICON: Record<string, string> = { informational: "info", success: "check_circle", warning: "warning", error: "cancel" };

const initials = (name: unknown) =>
  String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** A list at a binding, as the surface reads it. */
function list(surface: Surface, v: unknown, s: Scope): any[] {
  const value = surface.value(v, s);
  return Array.isArray(value) ? value : [];
}

/** The elements of a bound list, each with the scope its own bindings resolve in; shimmering stand-ins until it is written. */
function elements(surface: Surface, v: any, s: Scope, ghosts = 3): Scope[] {
  const base = surface.absolute(v.path, s);
  const items = surface.read(base);
  if (Array.isArray(items) && items.length) return items.map((_, index) => ({ base: `${base}/${index}`, index }));
  return Array.from({ length: ghosts }, (_, index) => ({ base: `${base}/${index}`, index, ghost: true }));
}

export const WINDOWS_DRAWING: Drawing = {
  // --- The window ------------------------------------------------------------

  Window(this: Surface, c: Component, s: Scope) {
    return html`<div class="w-window w-mode-${c.mode}">
      ${this.node(c.titleBar, s)} ${c.mode === "top" ? this.node(c.navigation, s) : nothing} ${this.node(c.menuBar, s)}
      <div class="w-client">
        ${c.mode === "left" ? this.node(c.navigation, s) : nothing}
        <main class="w-layer"><div class="w-page">${this.node(c.body, s)}</div></main>
      </div>
    </div>`;
  },

  TitleBar(this: Surface, c: Component, s: Scope) {
    const app = this.value(c.title, s);
    const tabs = c.tabs ? list(this, c.tabs, s) : [];
    return html`<header class="w-titlebar ${c.search ? "w-tall" : ""}">
      ${c.back === "none" ? nothing : html`<button class="w-back" ?disabled=${c.back === "off"} aria-label="Back" @click=${() => this.tap("back", "back")}>${this.icon("arrow_back")}</button>`}
      <span class="w-appicon" aria-hidden="true">${initials(app).slice(0, 1) || html`<span class="k-skel" style="width:60%"></span>`}</span>
      ${c.tabs
        ? html`<div class="w-tabs">
            ${tabs.length ? tabs.map((tab, i) => html`<span class="w-tab ${i === 0 ? "w-selected" : ""}">${tab}<i class="w-tab-close">${this.icon("close")}</i></span>`) : html`<span class="w-tab w-selected"><span class="k-skel" style="width:60px"></span></span>`}
            <span class="w-tab-add">${this.icon("add")}</span>
          </div>`
        : html`<span class="w-apptitle">${c.document !== undefined ? html`${this.words(c.document, s, 30)} <span class="w-dim">–</span> ` : nothing}${this.words(c.title, s, 20)}</span>`}
      ${c.search ? html`<span class="w-search"><span>Search</span>${this.icon("search")}</span>` : nothing}
      <span class="w-drag"></span>
      ${CAPTION}
    </header>`;
  },

  NavigationView(this: Surface, c: Component, s: Scope) {
    const items: any[] = list(this, c.items, s);
    const selected = c.footer ? -1 : Number(this.value(c.selected, s) ?? 0);
    const base = this.absolute(c.items.path, s);
    const at = (index: number): Scope => ({ base: `${base}/${index}`, index });
    const labelOf = (index: number) => (c.label ? this.value(c.label, at(index)) : items[index]?.label);
    const iconOf = (index: number) => (c.icon ? this.value(c.icon, at(index)) : undefined);
    // Settings is not one of the sections: a left pane keeps it at its foot, whatever the app map calls it.
    const isSettings = (index: number) => /^(settings|preferences)$/i.test(String(labelOf(index) ?? ""));
    const settingsAt = items.findIndex((_, index) => isSettings(index));
    const go = (index: number) => index !== selected && this.tap("nav", labelOf(index), undefined, { index, source: `nav:${items[index]?.destination}` });
    const entry = (index: number) => {
      const symbol = iconOf(index);
      const shown = symbol && symbol !== "circle" ? symbol : (this.navigationIcons[items[index]?.destination] ?? symbol ?? "circle");
      return html`<a class="w-navitem ${index === selected ? "w-selected" : ""}" title=${String(labelOf(index) ?? "")} @click=${() => go(index)}>
        ${c.icon || c.mode === "left" ? html`<span class="w-navicon">${this.icon(shown)}</span>` : nothing}<span class="w-navlabel">${labelOf(index) ?? ""}</span>
      </a>`;
    };
    const shown = orderedNavigation(items).filter(({ index }) => index !== settingsAt);
    if (c.mode === "top") {
      return html`<nav class="w-topnav">${items.length ? shown.map(({ index }) => entry(index)) : html`<span class="k-skel" style="width:40%"></span>`}</nav>`;
    }
    return html`<nav class="w-pane">
      <span class="w-hamburger">${this.icon("menu")}</span>
      <div class="w-navitems">${items.length ? shown.map(({ index }) => entry(index)) : [0, 1, 2, 3].map(() => html`<span class="w-navitem"><span class="k-skel" style="width:70%"></span></span>`)}</div>
      ${c.settings
        ? settingsAt >= 0
          ? html`<div class="w-navfooter">${entry(settingsAt)}</div>`
          : html`<div class="w-navfooter"><a class="w-navitem ${c.footer ? "w-selected" : ""}" title="Settings" @click=${() => !c.footer && this.tap("appbar", "settings")}><span class="w-navicon">${this.icon("settings")}</span><span class="w-navlabel">Settings</span></a></div>`
        : nothing}
    </nav>`;
  },

  MenuBar(this: Surface, c: Component, s: Scope) {
    const menus = list(this, c.items, s);
    return html`<nav class="w-menubar">${menus.length ? menus.map((menu) => html`<span class="w-menu">${menu}</span>`) : html`<span class="k-skel" style="width:30%"></span>`}</nav>`;
  },

  ContentDialog(this: Surface, c: Component, s: Scope) {
    return html`<div class="w-smoke">
      <div class="w-dialog" role="dialog">
        <div class="w-dialog-title">${this.words(c.title, s, 60)}</div>
        ${(c.children as string[]).map((child) => this.node(child, s))}
      </div>
    </div>`;
  },

  // --- Layout and text --------------------------------------------------------

  StackPanel(this: Surface, c: Component, s: Scope) {
    return html`<div class="w-stack w-${c.orientation ?? "vertical"}" style="gap:${c.spacing ?? 0}px">${this.kids(c.children, s)}</div>`;
  },

  TextBlock(this: Surface, c: Component, s: Scope) {
    return html`<div class="w-text w-${c.style ?? "body"}">${this.words(c.text, s, 40)}</div>`;
  },

  RichTextBlock(this: Surface, c: Component, s: Scope) {
    const text = this.value(c.text, s);
    if (typeof text !== "string" || !text) return html`<div class="w-rich">${this.words(c.text, s, 90)}<br />${this.words(undefined, s, 70)}</div>`;
    return html`<div class="w-rich">${text.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div>`;
  },

  // --- Commands and status ----------------------------------------------------

  CommandBar(this: Surface, c: Component, s: Scope) {
    const scopes = elements(this, c.commands, s, 4);
    const secondary = (scope: Scope) => this.value(c.overflow, scope) === "secondary";
    const bar = scopes.filter((scope) => !secondary(scope));
    const more = scopes.filter(secondary);
    return html`<div class="w-commandbar">
      ${bar.map(
        (scope) => html`<button class="w-command" @click=${() => this.tap("appbar", this.value(c.label, scope), scope.ghost ? scope : undefined)}>
          ${c.icon ? this.icon(this.value(c.icon, scope) && this.value(c.icon, scope) !== "circle" ? this.value(c.icon, scope) : "circle") : nothing}<span>${this.words(c.label, scope, 50)}</span>
        </button>`,
      )}
      ${more.length ? html`<button class="w-command w-more" title=${more.map((scope) => this.value(c.label, scope)).join(", ")} aria-label="See more">${this.icon("more_horiz")}</button>` : nothing}
    </div>`;
  },

  InfoBar(this: Surface, c: Component, s: Scope) {
    const severity = String(this.value(c.severity, s) ?? "informational");
    return html`<div class="w-infobar w-${severity}" role="status">
      <span class="w-infoicon">${this.icon(SEVERITY_ICON[severity] ?? "info", "k-fill")}</span>
      <span class="w-infotext"><b>${this.words(c.title, s, 30)}</b> <span>${this.words(c.message, s, 60)}</span></span>
      ${this.has(c.action, s) ? html`<button class="w-button" @click=${() => this.tap("action", this.value(c.action, s), s)}>${this.value(c.action, s)}</button>` : nothing}
      <span class="w-infoclose">${this.icon("close")}</span>
    </div>`;
  },

  BreadcrumbBar(this: Surface, c: Component, s: Scope) {
    const crumbs = list(this, c.items, s);
    if (!crumbs.length) return html`<nav class="w-breadcrumb"><span class="k-skel" style="width:40%"></span></nav>`;
    // The current level is last, and not a link.
    return html`<nav class="w-breadcrumb">
      ${crumbs.map((crumb, i) =>
        i === crumbs.length - 1 ? html`<span class="w-crumb w-current">${crumb}</span>` : html`<a class="w-crumb" @click=${() => this.tap("back", crumb)}>${crumb}</a><span class="w-chevron">${this.icon("chevron_right")}</span>`,
      )}
    </nav>`;
  },

  SelectorBar(this: Surface, c: Component, s: Scope) {
    const views = list(this, c.items, s);
    return html`<div class="w-selectorbar">${views.length ? views.map((view, i) => html`<span class="w-selector ${i === 0 ? "w-selected" : ""}">${view}</span>`) : html`<span class="k-skel" style="width:30%"></span>`}</div>`;
  },

  Button(this: Surface, c: Component, s: Scope) {
    const event = c.event ?? "action";
    return html`<button class="w-button ${c.style === "accent" ? "w-accent" : ""}" @click=${() => this.tap(event, this.value(c.label, s), s, { source: `${event}:${s.base || c.id}` })}>${this.words(c.label, s, 60)}</button>`;
  },

  // --- Collections --------------------------------------------------------------

  FlipView(this: Surface, c: Component, s: Scope) {
    const [first] = elements(this, c.items, s, 1);
    const count = Math.max(list(this, c.items, s).length, 3);
    return html`<div class="w-flipview">
      <kit-picture class="w-flip-picture" .src=${this.value(c.picture, first)} .alt=${this.value(c.caption, first) ?? ""} .icon=${c.placeholder ?? "image"}></kit-picture>
      ${c.caption ? html`<div class="w-flip-caption">${this.words(c.caption, first, 40)}</div>` : nothing}
      <span class="w-flip-arrow w-prev">${this.icon("chevron_left")}</span><span class="w-flip-arrow w-next">${this.icon("chevron_right")}</span>
      <span class="w-pips">${Array.from({ length: count }, (_, i) => html`<i class=${i === 0 ? "w-on" : ""}></i>`)}</span>
    </div>`;
  },

  ScrollView(this: Surface, c: Component, s: Scope) {
    return html`<section class="w-scrollview">
      ${c.header !== undefined ? html`<div class="w-text w-subtitle">${this.words(c.header, s, 30)}</div>` : nothing}
      <div class="w-shelf">${this.kids(c.children, s, 5)}</div>
    </section>`;
  },

  ItemsView(this: Surface, c: Component, s: Scope) {
    return html`<section class="w-itemsview w-layout-${c.layout} ${c.selection === "multiple" ? "w-multiple" : ""}">
      ${c.header !== undefined ? html`<div class="w-text w-subtitle">${this.words(c.header, s, 30)}</div>` : nothing}
      <div class="w-items">${this.kids(c.children, s, c.layout === "stack" ? 4 : 8)}</div>
    </section>`;
  },

  ItemContainer(this: Surface, c: Component, s: Scope) {
    const picture = c.picture !== undefined;
    const symbol = this.value(c.symbol, s);
    return html`<div class="w-item ${picture ? "w-tile" : "w-row"}" @click=${() => this.tap("item", this.value(c.name, s), s)}>
      <span class="w-check" aria-hidden="true"></span>
      ${picture ? html`<kit-picture class="w-item-picture" .src=${this.value(c.picture, s)} .alt=${this.value(c.name, s) ?? ""} .icon=${c.placeholder ?? "image"}></kit-picture>` : nothing}
      ${!picture && c.symbol !== undefined ? html`<span class="w-item-symbol">${this.icon(symbol && symbol !== "circle" ? symbol : "description")}</span>` : nothing}
      <span class="w-item-text">
        <span class="w-item-name">${this.words(c.name, s, 60)}</span>
        ${c.detail !== undefined ? html`<span class="w-item-detail">${this.words(c.detail, s, 45)}</span>` : nothing}
      </span>
      ${c.meta !== undefined && this.has(c.meta, s) ? html`<span class="w-item-meta">${this.value(c.meta, s)}</span>` : nothing}
    </div>`;
  },

  TableView(this: Surface, c: Component, s: Scope) {
    const columns = list(this, c.columns, s);
    const width = Math.max(columns.length, 4);
    const rows = elements(this, c.rows, s, 6);
    const multiple = c.selection === "multiple";
    // The name gets the room; the rest share what is left.
    const template = `${multiple ? "18px " : ""}minmax(160px, 2fr) repeat(${width - 1}, minmax(70px, 1fr))`;
    return html`<div class="w-table ${multiple ? "w-multiple" : ""}" style=${styleMap({ "--w-template": template })}>
      <div class="w-tr w-th">${multiple ? html`<span class="w-check"></span>` : nothing}${columns.length ? columns.map((column, i) => html`<span>${column}${i === 0 ? html`<i class="w-sort">${this.icon("arrow_upward")}</i>` : nothing}</span>`) : Array.from({ length: width }, () => html`<span><span class="k-skel" style="width:60%"></span></span>`)}</div>
      ${rows.map((row) => {
        const cells = list(this, c.cells, row);
        return html`<div class="w-tr" @click=${() => this.tap("item", cells[0], row)}>
          ${multiple ? html`<span class="w-check"></span>` : nothing}
          ${cells.length ? Array.from({ length: width }, (_, i) => html`<span class=${i === 0 ? "w-first" : ""}>${cells[i] ?? ""}</span>`) : Array.from({ length: width }, () => html`<span><span class="k-skel" style="width:70%"></span></span>`)}
        </div>`;
      })}
    </div>`;
  },

  ListDetailsView(this: Surface, c: Component, s: Scope) {
    const rows = elements(this, c.items, s, 6);
    return html`<div class="w-listdetails">
      <div class="w-ld-list">
        ${rows.map(
          (row, i) => html`<div class="w-ld-item ${i === 0 ? "w-selected" : ""}" @click=${() => i !== 0 && this.tap("item", this.value(c.name, row), row)}>
            <span class="w-person">${initials(this.value(c.name, row))}</span>
            <span class="w-ld-text">
              <span class="w-ld-top"><b>${this.words(c.name, row, 50)}</b>${c.meta ? html`<small>${this.value(c.meta, row) ?? ""}</small>` : nothing}</span>
              ${c.summary ? html`<span class="w-ld-summary">${this.words(c.summary, row, 80)}</span>` : nothing}
            </span>
          </div>`,
        )}
      </div>
      <article class="w-ld-details">
        <div class="w-text w-subtitle">${this.words(c.heading, s, 60)}</div>
        ${c.byline !== undefined ? html`<div class="w-ld-byline">${this.words(c.byline, s, 40)}</div>` : nothing}
        <div class="w-rich">${typeof this.value(c.body, s) === "string" ? String(this.value(c.body, s)).split(/\n{2,}/).map((p) => html`<p>${p}</p>`) : html`${this.words(c.body, s, 90)}<br />${this.words(undefined, s, 80)}`}</div>
      </article>
    </div>`;
  },

  PropertyGrid(this: Surface, c: Component, s: Scope) {
    const rows = elements(this, c.items, s, 4);
    return html`<section class="w-properties">
      ${c.header !== undefined ? html`<div class="w-text w-subtitle">${this.words(c.header, s, 30)}</div>` : nothing}
      <dl>${rows.map((row) => html`<dt>${this.words(c.name, row, 60)}</dt><dd>${this.words(c.value, row, 50)}</dd>`)}</dl>
    </section>`;
  },

  // --- Settings -----------------------------------------------------------------

  SettingsSection(this: Surface, c: Component, s: Scope) {
    const header = this.value(c.header, s);
    return html`<section class="w-settings-section">
      <div class="w-text w-bodyStrong">${this.words(c.header, s, 25)}</div>
      <div class="w-cards">${this.kids(c.children, typeof header === "string" ? { ...s, group: header } : s)}</div>
    </section>`;
  },

  SettingsCard(this: Surface, c: Component, s: Scope) {
    const control = String(this.value(c.control, s) ?? "link");
    const value = this.value(c.value, s);
    const on = Boolean(this.value(c.on, s));
    const icon = this.value(c.icon, s);
    const press = () => (control === "toggle" ? this.flip(s) : control === "link" ? this.tap("row", this.value(c.header, s), s) : control === "button" ? this.tap("row", value ?? this.value(c.header, s), s) : undefined);
    return html`<div class="w-card ${control === "link" ? "w-clickable" : ""}" @click=${press}>
      ${icon && icon !== "circle" ? html`<span class="w-card-icon">${this.icon(icon)}</span>` : nothing}
      <span class="w-card-text">
        <span class="w-card-header">${this.words(c.header, s, 45)}</span>
        ${c.description !== undefined ? html`<span class="w-card-description">${this.words(c.description, s, 70)}</span>` : nothing}
      </span>
      <span class="w-card-control">
        ${control === "toggle"
          ? html`<span class="w-toggle-label">${on ? "On" : "Off"}</span><span class="w-toggle ${on ? "w-on" : ""}"><i></i></span>`
          : control === "combobox"
            ? html`<span class="w-combobox"><span>${value ?? ""}</span>${this.icon("expand_more")}</span>`
            : control === "button"
              ? html`<span class="w-button">${value ?? "Go"}</span>`
              : html`${value ? html`<span class="w-card-value">${value}</span>` : nothing}${this.icon("chevron_right", "w-card-chevron")}`}
      </span>
    </div>`;
  },

  SettingsExpander(this: Surface, c: Component, s: Scope) {
    const links = c.links ? list(this, c.links, s) : [];
    return html`<section class="w-settings-section">
      <div class="w-text w-bodyStrong">About</div>
      <div class="w-expander">
        <div class="w-card w-expander-head">
          <span class="w-card-icon">${this.icon(c.icon ?? "info")}</span>
          <span class="w-card-text"><span class="w-card-header">${this.words(c.header, s, 35)}</span>${c.description !== undefined ? html`<span class="w-card-description">${this.words(c.description, s, 25)}</span>` : nothing}</span>
          <span class="w-card-control">${this.icon("expand_less")}</span>
        </div>
        ${links.map((link) => html`<div class="w-card w-expander-row"><a class="w-link">${link}</a></div>`)}
      </div>
    </section>`;
  },

  // --- Entering things ----------------------------------------------------------

  InputControl(this: Surface, c: Component, s: Scope) {
    const control = String(this.value(c.control, s) ?? "textbox");
    const placeholder = this.value(c.placeholder, s) ?? "";
    const options: unknown[] = c.options ? list(this, c.options, s) : [];
    const header = html`<label class="w-header">${this.words(c.header, s, 30)}${this.value(c.required, s) === true ? html`<span class="w-required"> *</span>` : nothing}</label>`;
    if (control === "checkbox") return html`<div class="w-field w-inline"><span class="w-checkbox"></span>${header}</div>`;
    if (control === "toggle") return html`<div class="w-field">${header}<span class="w-toggle-row"><span class="w-toggle"><i></i></span><span>Off</span></span></div>`;
    if (control === "radio") return html`<div class="w-field">${header}<div class="w-radios">${(options.length ? options : ["", ""]).map((option, i) => html`<span class="w-radio ${i === 0 ? "w-on" : ""}"><i></i>${option}</span>`)}</div></div>`;
    const trailing = { combobox: "expand_more", date: "calendar_today", time: "schedule", password: "visibility", number: "unfold_more" }[control];
    const shown = control === "combobox" && options.length ? String(options[0]) : control === "password" ? "••••••••" : placeholder;
    return html`<div class="w-field">${header}
      <span class="w-textbox ${control === "multiline" ? "w-multiline" : ""} ${control === "combobox" ? "w-combo" : ""}"><span class=${control === "combobox" && options.length ? "" : "w-placeholder"}>${shown}</span>${trailing ? this.icon(trailing) : nothing}</span>
    </div>`;
  },

  DialogCommands(this: Surface, c: Component, s: Scope) {
    const primary = this.value(c.primary, s);
    const secondary = this.value(c.secondary, s);
    const accent = this.value(c.default, s) === "primary";
    // Microsoft's order: the primary response, the secondary, and the close response last; close only goes back.
    return html`<div class="w-dialog-commands">
      ${primary ? html`<button class="w-button ${accent ? "w-accent" : ""}" @click=${() => this.tap("action", primary, s, { source: `action:${c.id}_primary` })}>${primary}</button>` : c.primary !== undefined && !this.has(c.close, s) ? html`<button class="w-button"><span class="k-skel" style="width:60%"></span></button>` : nothing}
      ${secondary ? html`<button class="w-button" @click=${() => this.tap("action", secondary, s, { source: `action:${c.id}_secondary` })}>${secondary}</button>` : nothing}
      <button class="w-button ${!primary && !secondary ? "w-accent" : ""}" @click=${() => this.tap("back", this.value(c.close, s), s)}>${this.words(c.close, s, 50)}</button>
    </div>`;
  },

  // --- Documents ----------------------------------------------------------------

  RichEditBox(this: Surface, c: Component, s: Scope) {
    const lines = list(this, c.lines, s);
    return html`<div class="w-editor ${c.mono ? "w-mono" : ""}">
      ${lines.length ? lines.map((line) => html`<div class="w-line">${line || " "}</div>`) : Array.from({ length: 8 }, (_, i) => html`<div class="w-line"><span class="k-skel" style="width:${40 + ((i * 37) % 50)}%"></span></div>`)}<span class="w-caret"></span>
    </div>`;
  },

  CanvasSlot(this: Surface, c: Component, s: Scope) {
    return this.baked(c, s, { "aspect-ratio": String(c.ratio).replace(":", " / ") });
  },
};
