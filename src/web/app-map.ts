// The map of the app, as a view of the stage. What the planner makes is a graph, not a tree: the anchor map is
// already a cycle (server/ia/live.ts), every main section has a return to home (server/ia/bootstrap.ts), and
// identity resolution exists so several entry points reach one destination (server/ia/identity.ts). So destinations
// sit in columns by their distance from home, every edge is drawn, and the selected destination's own edges are the
// ones made legible. Selecting a destination only inspects it; opening it is a separate, explicit action.

import { LitElement, html, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { architectureIcon, type Architecture } from "../shared/architecture.js";
import type { AppMap, MapAction } from "../shared/ia-graph.js";
import { icon } from "./chrome.js";

interface Wire {
  d: string;
  kind: string;
}

/** Distance from home along the links a person follows forward; a return never shortens the way. */
function columnsOf(map: AppMap): string[][] {
  const links = (id: string, kinds: string[]) =>
    (map.nodes.find((n) => n.id === id)?.actions ?? []).filter((a) => a.target && kinds.includes(a.kind)).map((a) => a.target!);
  const depth = new Map<string, number>([[map.home, 0]]);
  for (let frontier = [map.home], d = 1; frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const target of links(id, ["navigate"])) if (!depth.has(target)) { depth.set(target, d); next.push(target); }
    frontier = next;
  }
  // A destination only a return reaches still has somewhere to sit: one column past whatever reaches it.
  for (let settling = true; settling; ) {
    settling = false;
    for (const node of map.nodes) {
      if (depth.has(node.id)) continue;
      const reaching = map.nodes.filter((n) => n.actions.some((a) => a.target === node.id)).flatMap((n) => { const at = depth.get(n.id); return at === undefined ? [] : [at]; });
      if (reaching.length) { depth.set(node.id, Math.min(...reaching) + 1); settling = true; }
    }
    if (!settling) for (const node of map.nodes) if (!depth.has(node.id)) depth.set(node.id, 0);
  }
  const columns: string[][] = [];
  for (const node of map.nodes) (columns[depth.get(node.id)!] ??= []).push(node.id);
  // Within a column, follow the destinations that lead here, so that edges cross as little as the graph allows.
  const declared = new Map(map.nodes.map((node, i) => [node.id, i]));
  const rows = new Map<string, number>();
  for (const ids of columns) {
    if (ids === columns[0]) { ids.forEach((id, row) => rows.set(id, row)); continue; }
    const pull = (id: string) => {
      const above = map.nodes.filter((n) => n.actions.some((a) => a.target === id && a.kind === "navigate")).flatMap((n) => { const row = rows.get(n.id); return row === undefined ? [] : [row]; });
      return above.length ? above.reduce((sum, row) => sum + row, 0) / above.length : Number.MAX_SAFE_INTEGER;
    };
    ids.sort((a, b) => pull(a) - pull(b) || declared.get(a)! - declared.get(b)!);
    ids.forEach((id, row) => rows.set(id, row));
  }
  return columns.filter((ids) => ids?.length);
}

@customElement("app-map")
export class AppMapView extends LitElement {
  @property({ attribute: false }) architecture?: Architecture;
  @property({ attribute: false }) made: string[] = [];
  @property({ attribute: false }) working: string[] = [];
  @property({ attribute: false }) titles: Record<string, string> = {};
  /** What a made screen turned out to be, which says more than the responsibility the map planned. */
  @property({ attribute: false }) icons: Record<string, string> = {};
  @property() current = "first";
  @property() selected = "first";
  @property() error = "";
  @property({ attribute: false }) issues: string[] = [];
  @property({ type: Boolean }) busy = false;
  /** Drawn from where the cards actually are, so an edge cannot come adrift from its destination. */
  @state() private wires: Wire[] = [];
  private drawn = "";
  private watching?: ResizeObserver;

  // Light DOM: the map is made of the same chrome as the rest of the tool (web/app.css), not a second design.
  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void document.fonts?.ready.then(() => this.measure());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.watching?.disconnect();
  }

  private send(type: string, destination: string) {
    this.dispatchEvent(new CustomEvent(type, { detail: destination, bubbles: true, composed: true }));
  }

  private called(id: string) {
    return this.titles[id] || this.architecture?.map.nodes.find((n) => n.id === id)?.label || id;
  }

  private glyph(id: string) {
    const state = this.architecture!;
    return id === state.map.home ? "home" : this.icons[id] ?? architectureIcon(state, id);
  }

  /** What a destination is right now, in the same words the conversation uses. A card has room for one mark. */
  private standing(id: string, full = false) {
    const state = this.architecture!;
    const marks = [id === state.map.home ? "home" : "", id === "first" ? "first screen" : "", state.navigation?.includes(id) ? "nav" : ""].filter(Boolean);
    const reached = state.map.nodes.filter((n) => n.actions.some((a) => a.target === id && a.kind === "navigate")).length;
    if (reached > 1) marks.push(`from ${reached}`);
    const made = id === this.current ? (full ? "Showing on canvas" : "Showing") : this.working.includes(id) ? "Generating…" : this.made.includes(id) ? "Made" : "Planned";
    return [made, ...(full ? marks : marks.slice(0, 1))].join(" · ");
  }

  protected updated() {
    this.measure();
    const content = this.querySelector<HTMLElement>(".mapcontent");
    if (!content) return;
    this.watching ??= new ResizeObserver(() => this.measure());
    this.watching.disconnect();
    this.watching.observe(content);
  }

  private measure() {
    const state = this.architecture, content = this.querySelector<HTMLElement>(".mapcontent");
    if (!state || !content) return;
    const origin = content.getBoundingClientRect();
    const box = (id: string) => this.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    const wires: Wire[] = [];
    for (const node of state.map.nodes) {
      for (const action of node.actions) {
        if (!action.target || !["navigate", "back"].includes(action.kind)) continue;
        const from = box(node.id), to = box(action.target);
        if (!from || !to) continue;
        const back = action.kind === "back";
        const touches = action.target === this.selected || node.id === this.selected;
        // A return is never an entry point: it stands out when it touches the selection, but keeps its own quiet line.
        const kind = back ? (touches ? "back lit" : "back") : touches ? (action.target === this.selected ? "in" : "out") : "";
        const ay = from.top + from.height / 2 - origin.top, by = to.top + to.height / 2 - origin.top;
        if (Math.abs(from.left - to.left) < 4) {
          // Two destinations the same distance from home: a detail and the screen that opens it.
          const x = from.right - origin.left, bulge = 34 + Math.abs(ay - by) / 5;
          wires.push({ kind, d: `M ${x} ${ay} C ${x + bulge} ${ay}, ${x + bulge} ${by}, ${x} ${by}` });
          continue;
        }
        const x1 = (back ? from.left : from.right) - origin.left, x2 = (back ? to.right : to.left) - origin.left;
        const y1 = ay + (back ? 10 : -3), y2 = by + (back ? 10 : -3);
        const bend = Math.max(24, Math.abs(x2 - x1) / 2);
        wires.push({ kind, d: back ? `M ${x1} ${y1} C ${x1 - bend} ${y1}, ${x2 + bend} ${y2}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` });
      }
    }
    // Measuring happens after a paint, so only a real change is allowed to ask for another one.
    const drawn = JSON.stringify(wires);
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    this.wires = wires;
  }

  render() {
    const state = this.architecture;
    if (!state) {
      return html`<div class="mapboard">
        <p class="empty">
          ${icon("account_tree")}<b>${this.error ? "Map planning did not finish" : "Finding the shape of your app"}</b>
          ${this.error ? "Your generated screen is still on the canvas." : "Destinations appear here as the plan arrives."}
          ${this.error ? html`<span class="wrong" role="status">${this.error}</span>` : nothing}
        </p>
      </div>`;
    }
    const nodes = state.map.nodes;
    const chosen = nodes.find((n) => n.id === this.selected) ?? nodes.find((n) => n.id === this.current) ?? nodes[0]!;
    const reviewing = state.status === "reviewing" && !state.catalog;
    const into = nodes.flatMap((node) => node.actions.filter((a) => a.target === chosen.id && a.kind === "navigate").map((a) => ({ node, action: a })));
    const notes = [...state.findings.map((f) => f.detail), ...this.issues];
    return html`<div class="mapboard">
      <div class="mapfield">
        <div class="mapcontent">
          <svg class="wires" aria-hidden="true">${this.wires.map((wire) => svg`<path class=${wire.kind} d=${wire.d}></path>`)}</svg>
          <div class="layers">
            ${columnsOf(state.map).map((ids) => html`<div>
              ${ids.map((id) => html`<button class="mapcard ${this.made.includes(id) ? "made" : "planned"} ${this.working.includes(id) ? "working" : ""}"
                data-node=${id} aria-current=${id === this.current} aria-pressed=${id === chosen.id}
                aria-label=${`${this.called(id)}: ${this.standing(id, true)}`} @click=${() => this.send("map-select", id)}>
                <span class="glyph">${icon(this.glyph(id), "s")}</span>
                <span class="words"><b>${this.called(id)}</b><small>${this.standing(id)}</small></span>
              </button>`)}
            </div>`)}
          </div>
        </div>
      </div>
      ${this.wires.length
        ? html`<div class="maplegend" aria-hidden="true">
            <span><i class="in"></i>Leads here</span><span><i class="out"></i>Leads on</span>
            <span><i class="back"></i>Returns</span><span><i></i>Other links</span>
          </div>`
        : nothing}
      <aside class="mapside">
        <header class="map-head"><h2>${this.called(chosen.id)}</h2></header>
        <div class="mapscroll">
          <p class="standing">${this.standing(chosen.id, true)}</p>
          <p class="purpose">${chosen.id === "first" ? state.seed.brief : chosen.purpose.split(". ")[0] + (chosen.purpose.includes(". ") ? "." : "")}</p>
          <button class="btn ${chosen.id === this.current ? "" : "primary"} open" ?disabled=${this.busy || reviewing || chosen.id === this.current} @click=${() => this.send("map-open", chosen.id)}>
            ${icon("open_in_full", "xs")}${chosen.id === this.current ? "Showing on canvas" : this.working.includes(chosen.id) ? "View progress" : this.made.includes(chosen.id) ? "Open screen" : "Generate screen"}
          </button>
          ${into.length
            ? html`<h3 class="groupname">Reached from <span>${into.length === 1 ? "1 screen" : `${into.length} screens`}</span></h3>
                <ul class="edgelist">
                  ${into.map(({ node, action }) => html`<li><button class="edge" @click=${() => this.send("map-select", node.id)}>
                    ${icon("arrow_back", "xs")}<span class="words"><b>${this.called(node.id)}</b><small>“${action.label}”</small></span>
                  </button></li>`)}
                </ul>`
            : nothing}
          ${this.outward(chosen.actions, reviewing, state)}
        </div>
        <footer class="mapfoot">
          <p aria-live="polite">${this.made.length} of ${nodes.length} screens made · ${reviewing ? "Reviewing journeys…" : `Revision ${state.revision}`}</p>
          ${notes.length ? html`<details><summary>${notes.length} map ${notes.length === 1 ? "note" : "notes"}</summary>${notes.map((note) => html`<p>${note}</p>`)}</details>` : nothing}
          ${this.error ? html`<p class="wrong" role="status">${this.error}</p>` : nothing}
        </footer>
      </aside>
    </div>`;
  }

  /** Everything a destination's actions do: open another destination, return, stay, or finish here. */
  private outward(actions: MapAction[], reviewing: boolean, state: Architecture) {
    const shown = actions.filter((a) => a.kind !== "remove" && (!state.catalog || a.target || a.kind !== "navigate"));
    if (!shown.length) return nothing;
    return html`<h3 class="groupname">Leads to</h3>
      <ul class="edgelist">
        ${shown.map((action) => {
          if (!action.target) {
            return html`<li><span class="edge quiet">
              ${icon(action.kind === "complete" ? "check_circle" : "radio_button_unchecked", "xs")}
              <span class="words"><b>${action.label}</b><small>${action.kind === "complete" ? "Completes here" : "Stays here"}</small></span>
            </span></li>`;
          }
          const back = action.kind === "back";
          return html`<li><button class="edge ${back ? "quiet" : ""}" ?disabled=${reviewing} @click=${() => this.send("map-select", action.target!)}>
            ${icon(back ? "undo" : "arrow_forward", "xs")}
            <span class="words"><b>${back ? `Back to ${this.called(action.target)}` : this.called(action.target)}</b><small>${back ? "Returns" : `${this.made.includes(action.target) ? "Made" : "Planned"} · “${action.label}”`}</small></span>
          </button></li>`;
        })}
      </ul>`;
  }
}
