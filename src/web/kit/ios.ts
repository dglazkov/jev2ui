// iOS's components, drawn (shared/ios.ts): the kit's, with iOS's screen and navigation bar. A screen arrives the way
// iOS presents it (a sheet, an action sheet, a full-screen cover), and the bar's ends can be words (Cancel, Done),
// which ios.css paints over kit.css.

import { html, nothing } from "lit";
import type { Component, Scope, Surface } from "../surface.js";
import type { Drawing } from "../sets.js";
import { KIT_DRAWING } from "./components.js";

export const IOS_DRAWING: Drawing = {
  ...KIT_DRAWING,

  Screen(this: Surface, c: Component, s: Scope) {
    return html`<div class="k-screen ${c.dialog ? "k-dialog" : ""} ${c.presentation ? `k-${c.presentation}` : ""}">
      ${this.node(c.appBar, s)}
      <div class="k-scroll"><div class="k-scroll-inner">${this.node(c.body, s)}</div></div>
      ${this.node(c.sticky, s)} ${this.node(c.navBar, s)}
    </div>`;
  },

  AppBar(this: Surface, c: Component, s: Scope) {
    const leading = { back: "arrow_back", close: "close" }[c.leading as string];
    const trailing = this.value(c.trailing, s);
    return html`<header class="k-appbar">
      ${leading ? html`<button class="k-iconbtn" aria-label=${c.leading} @click=${() => this.tap("back", c.leading)}>${this.icon(leading)}</button>` : nothing}
      ${c.leading === "cancel" ? html`<button class="k-wordbtn" aria-label="cancel" @click=${() => this.tap("back", "cancel")}>Cancel</button>` : nothing}
      <h1 class="k-appbar-title ${leading || c.leading === "cancel" ? "" : "k-large"}">${c.title === undefined ? nothing : this.words(c.title, s, 40)}</h1>
      ${(c.actions ?? []).map((name: string) => html`<button class="k-iconbtn" aria-label=${name} @click=${() => this.tap("appbar", name)}>${this.icon(name)}</button>`)}
      ${trailing ? html`<button class="k-wordbtn k-strong" aria-label=${String(trailing)} @click=${() => this.tap("appbar", String(trailing))}>${trailing}</button>` : nothing}
    </header>`;
  },
};
