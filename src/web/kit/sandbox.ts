// Where baked components run (src/server/mock/bake.ts). The source is a model's,
// so it gets a frame of its own: scripts allowed, but no origin, no network and
// no way to reach the page. It is handed the kit's stylesheet, so its buttons
// and badges are the kit's, and the design's variables, so it is painted by the
// same DESIGN.md as everything around it. Both directions are messages:
//
//   in    { theme }   the `--k-*` variables; sent again when the design changes,
//                     so a remix repaints a running timer without restarting it
//         { state }   { data, items }: what the component draws
//   out   ready, drawn, error, select, open, openItem
//         overflow    what it drew is taller than its box; the slot grows to fit

import kitCss from "./kit.css?inline";
import type { Theme } from "../../shared/design.js";

export interface Definition {
  id: string;
  name: string;
  card: string;
  source: string;
}

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:";
const SYMBOLS = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0";

/** Runs inside the frame, before the component's source. Written as a function so that it is type-checked, sent as text. */
function host() {
  const post = (message: Record<string, unknown>) => parent.postMessage(message, "*");
  const fail = (error: unknown) => post({ type: "error", message: String((error as Error)?.message ?? error) });
  const root = document.getElementById("root")!;
  const kit = {
    select: (value: unknown) => post({ type: "select", value }),
    open: (label: unknown, data: unknown) => post({ type: "open", label: String(label ?? ""), data }),
    openItem: (item: unknown) => post({ type: "openItem", item }),
  };
  let state: unknown;
  let queued = false;
  let drawn = false;
  // The box is a reservation, not a promise the baker always keeps: a ring as wide as the box leaves no room for
  // the buttons under it. Clipping them would break the mock, so the frame says how tall its content came out.
  const measure = () => {
    if (root.scrollHeight > root.clientHeight + 1) post({ type: "overflow", height: root.scrollHeight });
  };
  const draw = () => {
    queued = false;
    if (state === undefined) return;
    try {
      const render = (window as any).render;
      if (typeof render !== "function") throw new Error("the source defines no render function");
      render(root, state, kit);
      if (!drawn) post({ type: "drawn", empty: !root.childElementCount });
      // Once laid out, and again when fonts and symbols have loaded and changed the heights.
      requestAnimationFrame(measure);
      if (!drawn) for (const ms of [400, 1500]) setTimeout(measure, ms);
      drawn = true;
    } catch (error) {
      fail(error);
    }
  };
  const schedule = () => {
    if (!queued) requestAnimationFrame(draw);
    queued = true;
  };
  window.addEventListener("error", (event) => fail(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => fail(event.reason));
  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const { theme, state: next } = event.data ?? {};
    if (theme) {
      const style = document.documentElement.style;
      for (const [name, value] of Object.entries(theme.vars as Record<string, string>)) style.setProperty(name, value);
      style.colorScheme = theme.colorScheme;
      document.body.style.fontFamily = theme.fontFamily;
      for (const family of theme.fonts as string[]) {
        const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
        if (document.querySelector(`link[href="${href}"]`)) continue;
        document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
      }
    }
    if (next !== undefined) state = next;
    schedule();
  });
  let size = "";
  new ResizeObserver(() => {
    const now = `${root.clientWidth}x${root.clientHeight}`;
    if (size && size !== now) schedule();
    size = now;
  }).observe(root);
  // The component's source comes next; by the time it has run, `render` exists.
  window.addEventListener("DOMContentLoaded", () => post({ type: "ready" }));
}

const documents = new Map<string, string>();

/** The frame's document. The same string every time for one definition, so that re-rendering never reloads the frame. */
export function sandboxDocument(definition: Definition): string {
  let html = documents.get(definition.id);
  if (!html) {
    const inline = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1");
    html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">
<link rel="stylesheet" href="${SYMBOLS}">
<style>${kitCss}</style>
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}kit-surface{display:block;height:100%}#root{position:relative;box-sizing:border-box;width:100%;height:100%;overflow:hidden}</style>
</head><body><kit-surface><div id="root"></div></kit-surface>
<script>(${inline(host.toString())})()</script>
<script>${inline(definition.source)}</script>
</body></html>`;
    documents.set(definition.id, html);
  }
  return html;
}

export function themeMessage(theme: Theme | undefined) {
  return theme ? { theme: { vars: theme.vars, colorScheme: theme.colorScheme, fontFamily: theme.fontFamily, fonts: theme.fonts } } : {};
}
