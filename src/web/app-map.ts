import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Architecture } from "../shared/architecture.js";

/** A view of the canonical map. Selecting a dot only inspects; opening is a separate, explicit action. */
@customElement("app-map")
export class AppMapDrawer extends LitElement {
  @property({ attribute: false }) architecture?: Architecture;
  @property({ attribute: false }) made: string[] = [];
  @property({ attribute: false }) working: string[] = [];
  @property({ attribute: false }) titles: Record<string, string> = {};
  @property() current = "first";
  @property() selected = "first";
  @property() error = "";
  @property({ attribute: false }) issues: string[] = [];
  @property({ type: Boolean }) busy = false;
  private slots = new Map<string, number>();
  private seed?: Architecture["seed"];
  private send(type: string, destination?: string) { this.dispatchEvent(new CustomEvent(type, { detail: destination, bubbles: true, composed: true })); }
  static styles = css`
    :host { display:flex; flex-direction:column; width:284px; height:100%; background:var(--paper); color:var(--ink); border-left:1px solid var(--line); box-sizing:border-box; font:13px/1.45 system-ui,sans-serif; }
    * {box-sizing:border-box} button { font:inherit; color:inherit; cursor:pointer } button:focus-visible {outline:2px solid var(--accent); outline-offset:3px}
    header {display:flex; align-items:center; padding:16px 18px 10px; gap:8px} h3 {font-size:14px; margin:0; flex:1} .close {border:0; background:none; font-size:22px; line-height:24px; width:28px; border-radius:6px} .close:hover {background:var(--wash)}
    .summary {margin:0 18px 12px;color:var(--muted);font-size:12px} .scroll {overflow:auto; min-height:0; flex:1} .map-viewport {max-height:min(42vh,330px);overflow:auto} .field {position:relative; margin:0 12px; background:radial-gradient(var(--dots) 1px,transparent 1px);background-size:14px 14px; border-radius:12px}
    svg {position:absolute; width:100%; height:100%; overflow:visible} path {fill:none;stroke:var(--line);stroke-width:1.5} path.active {stroke:var(--accent);opacity:.5}
    .node {position:absolute; width:112px; height:65px; border:0; background:none; display:flex; flex-direction:column; align-items:center;gap:7px; border-radius:10px; animation:appear .18s ease-out; padding:8px 2px 4px; transition:background .15s}
    .node:hover,.node[aria-pressed="true"] {background:var(--accent-wash)} .node span {max-width:108px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:500}
    .dot {display:block; width:13px;height:13px;border:1.5px solid var(--faint);border-radius:50%;background:var(--paper)} .made .dot {background:var(--muted);border-color:var(--muted)} .current .dot {background:var(--accent);border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-wash)} .working .dot {animation:pulse 1s ease-in-out infinite}
    .legend {display:flex;gap:16px;color:var(--muted);font-size:11px;padding:12px 18px 16px}.legend span{display:flex;gap:6px;align-items:center}.legend .dot{width:8px;height:8px}
    .detail {padding:16px 18px;border-top:1px solid var(--line);background:var(--wash)} .eyebrow {color:var(--muted);font-size:11px;display:flex;justify-content:space-between} h4{font-size:17px;margin:8px 0} p{margin:8px 0;color:var(--muted)} .open{width:100%;margin:12px 0 4px;padding:9px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:var(--paper);font-weight:600}.open:disabled{opacity:.45;cursor:default}
    ul{list-style:none;margin:12px 0 0;padding:0}li{margin:7px 0;font-size:12px}.link{border:0;background:none;padding:2px 0;text-align:left;color:var(--accent)}small{color:var(--muted)} details{padding:12px 18px;border-top:1px solid var(--line)}summary{cursor:pointer;font-size:12px;color:var(--muted)}.error{padding:12px 18px;color:var(--warn)}.loading{padding:28px 18px}.loading b{display:block;color:var(--ink);margin-bottom:8px}
    @keyframes appear{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}} @keyframes pulse{50%{opacity:.25}} @media(prefers-reduced-motion:reduce){.node,.working .dot{animation:none}}
  `;
  render() {
    const state = this.architecture;
    if (this.seed?.brief !== state?.seed.brief) { this.slots.clear(); this.seed = state?.seed; }
    const nodes = state?.map.nodes ?? [];
    for (const node of nodes) if (!this.slots.has(node.id)) this.slots.set(node.id, this.slots.size);
    const position = (id: string) => { const slot = this.slots.get(id) ?? 0; return { x: slot % 2 ? 194 : 64, y: Math.floor(slot / 2) * 78 + 26 }; };
    const height = Math.max(160, Math.ceil(this.slots.size / 2) * 78 + 12);
    const title = (id: string) => this.titles[id] || nodes.find((n) => n.id === id)?.label || id;
    const chosen = nodes.find((n) => n.id === this.selected) ?? nodes.find((n) => n.id === this.current) ?? nodes[0];
    const issues = [...(state?.findings.map((f) => f.detail) ?? []), ...this.issues];
    return html`<header><h3>App map</h3><button class="close" aria-label="Collapse app map" @click=${() => this.send("map-close")}>›</button></header>
      <p class="summary" aria-live="polite">${state ? `${this.made.length} of ${nodes.length} screens made · ${(state.status === "reviewing" && !state.catalog) ? "Reviewing journeys…" : "Revision " + state.revision}` : this.error ? "App map unavailable" : "Planning your app…"}</p>
      <div class="scroll">${state ? html`<div class="map-viewport"><div class="field" style="height:${height}px">
        <svg viewBox="0 0 260 ${height}" aria-hidden="true">${nodes.flatMap((node) => node.actions.filter((a) => a.target && a.kind !== "back").map((a) => { const from = position(node.id), to = position(a.target!); return svg`<path class=${node.id === chosen?.id || a.target === chosen?.id ? "active" : ""} d="M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y}"/>`; }))}</svg>
        ${nodes.map((node) => { const at = position(node.id); return html`<button class="node ${this.made.includes(node.id) ? "made" : ""} ${node.id === this.current ? "current" : ""} ${this.working.includes(node.id) ? "working" : ""}" style="left:${at.x - 56}px;top:${at.y - 15}px" title=${title(node.id)} aria-pressed=${node.id === chosen?.id} aria-label=${`${title(node.id)}, ${node.id === this.current ? "current screen" : this.made.includes(node.id) ? "made" : "planned"}`} @click=${() => this.send("map-select", node.id)}><i class="dot"></i><span>${title(node.id)}</span></button>`; })}
      </div></div><div class="legend"><span><i class="dot"></i>Planned</span><span class="made"><i class="dot"></i>Made</span><span class="current"><i class="dot"></i>Showing</span></div>
      ${chosen ? html`<section class="detail"><div class="eyebrow"><span>${this.made.includes(chosen.id) ? "Made screen" : "Planned screen"}</span>${chosen.id === this.current ? html`<span>Showing now</span>` : nothing}</div><h4>${title(chosen.id)}</h4><p>${chosen.id === "first" ? state.seed.brief : chosen.purpose.split(". ")[0] + (chosen.purpose.includes(". ") ? "." : "")}</p>
      <button class="open" ?disabled=${this.busy || (state.status === "reviewing" && !state.catalog) || chosen.id === this.current} @click=${() => this.send("map-open", chosen.id)}>${chosen.id === this.current ? "Showing on canvas" : this.working.includes(chosen.id) ? "View progress" : this.made.includes(chosen.id) ? "Open screen" : "Generate screen"}</button>
      <ul>${chosen.actions.filter((a) => a.kind !== "remove" && (!state.catalog || a.target)).map((a) => html`<li>${a.target ? html`<button class="link" @click=${() => this.send("map-select", a.target!)}>${title(a.target!)} →</button>` : html`${a.label} <small>· ${a.kind === "complete" ? "completes here" : "stays here"}</small>`}</li>`)}</ul></section>` : nothing}
      ${issues.length ? html`<details><summary>${issues.length} map ${issues.length === 1 ? "note" : "notes"}</summary>${issues.map((issue) => html`<p>${issue}</p>`)}</details>` : nothing}
      ` : html`<p class="loading"><b>${this.error ? "Map planning did not finish" : "Finding the shape of your app"}</b>${this.error ? "Your generated screen is still on the canvas." : "Destinations appear here as the plan arrives."}</p>`}
      ${this.error ? html`<p class="error" role="status">${this.error}</p>` : nothing}</div>`;
  }
}
