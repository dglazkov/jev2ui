// The idioms' stylesheets (shared/idioms.ts), and which one the page is painted with.
//
// Each idiom's are layered over the general surface's (../surface.css), which paints what
// the surface draws itself whatever the set: unwritten text, symbols, the slot a baked
// component runs in. The kit's and iOS's paint the same class names, so only one idiom's
// paint can be on at a time: the page's, and the frame of every baked component on it
// (sandbox.ts).

import surfaceCss from "../surface.css?inline";
import kitCss from "./kit.css?inline";
import iosCss from "./ios.css?inline";
import windowsCss from "../windows/windows.css?inline";
import { IDIOMS, type IdiomId } from "../../shared/idioms.js";

const SHEETS: Record<string, string> = { "kit/kit.css": kitCss, "kit/ios.css": iosCss, "windows/windows.css": windowsCss };

/** The general surface's stylesheet, then the idiom's, in the order named, as one. */
export function stylesOf(idiom: IdiomId): string {
  return [surfaceCss, ...IDIOMS[idiom].stylesheets
    .map((sheet) => {
      const css = SHEETS[sheet];
      if (css === undefined) throw new Error(`no stylesheet "${sheet}" is bundled for the ${idiom} idiom (src/web/kit/idioms.ts)`);
      return css;
    })]
    .join("\n");
}

/** Paints the page with one idiom's stylesheets, in place of whichever it had. */
export function paintIn(idiom: IdiomId) {
  let style = document.getElementById("k-idiom") as HTMLStyleElement | null;
  if (!style) document.head.append((style = Object.assign(document.createElement("style"), { id: "k-idiom" })));
  if (style.dataset.idiom === idiom) return;
  style.dataset.idiom = idiom;
  style.textContent = stylesOf(idiom);
}
