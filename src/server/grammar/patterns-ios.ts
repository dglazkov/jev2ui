// iOS, as a catalog a graph can name: the kit's patterns, with a frame of its own,
// drawn the way the Human Interface Guidelines lay a screen out (docs/grammar.md).
//
// The frame's knobs are iOS's, not the kit's: how a screen is presented (pushed, a
// sheet, a full-screen cover, an alert, an action sheet), whether its title is large
// or inline, what leads the bar (a chevron, the word Cancel, a close button) and what
// word acts at its trailing edge (Done, Save, Edit). grammar/ios/screen.md is written
// to them. The rest of the idiom is the stylesheet's (src/web/kit/ios.css), over the
// same components, so what is baked into a slot is painted with it too.
//
// grammar/ios/catalog.md is written out from this by `npm run grammar:export`.

import type { KitComponent } from "../../shared/kit.js";
import type { Grammar } from "./format.js";
import type { Catalog, Pattern } from "./make.js";
import { KIT_PATTERNS, OPENINGS, YES_NO, at, bind, catalogOf, made, slots } from "./patterns.js";

type C = KitComponent;

const PRESENTATIONS = ["push", "sheet", "fullscreen", "alert", "actionsheet"] as const;
const TITLES = ["large", "inline"] as const;
const LEADINGS = ["back", "cancel", "close", "none"] as const;

const PAGE: Pattern = {
  name: "page",
  card: "A screen of an iOS app, however it is presented: pushed onto the one before it, under a navigation bar that leads back and may carry a word that acts; a tab's root, with a large title and the tab bar; a sheet risen from the bottom with Cancel and Done; a full-screen cover; an alert centred over the screen; or an action sheet of choices from the bottom (HIG navigation bars, tab bars, sheets, alerts, action sheets).",
  slots: slots(
    [
      "- `title` required — what the screen is called; on a profile, who it is about",
      "- `subtitle` — one line under it: a person's line, how it went, an introduction",
      "- `portrait` — the address of the person's picture, on a profile",
      "- `destinations` — the app's main destinations, for the tab bar",
      "  - `label` required",
      "  - `icon` — the name of a symbol",
      "- `active` — which of the destinations this screen is",
    ].join("\n"),
  ),
  knobs: {
    presentation: { takes: PRESENTATIONS, is: "how the screen arrives: pushed onto the one before it; as a sheet risen from the bottom, for a task the person completes and dismisses; as a full-screen cover; as an alert, a small card centred over the screen; or as an action sheet, choices stacked at the bottom with Cancel apart under them" },
    opening: { takes: OPENINGS, is: "how the screen opens: with its title; with the person it is about; or with how something went, a symbol and a headline in place of a title" },
    title: { takes: TITLES, is: "whether the title is large, under the bar, or inline in it. Unset, a tab's root has a large title and the rest inline (HIG large titles)" },
    leading: { takes: LEADINGS, is: "what leads the bar: a chevron back, the word Cancel, a close button, or nothing. A tab's root and a full-screen cover lead with nothing whatever is set; unset, a pushed screen leads back and a sheet with a close button" },
    trailing: { takes: [], is: "a word at the trailing edge of the bar that acts: Done, Save, Edit; or none" },
    action: { takes: [], is: "the symbol of the one action at the trailing edge of the bar, or none" },
    navigation: { takes: YES_NO, is: "whether the tab bar of the app's main destinations is shown: on a tab's root" },
    sticky: { takes: [], is: "the name of the part pinned to the bottom edge, so that a call to action is always in reach, or none" },
    intro: { takes: YES_NO, is: "a line of introduction under the title, from the subtitle: for a kind of screen its title does not explain" },
    symbol: { takes: [], is: "the symbol of what the screen is about, shown by an outcome, or none. An alert shows none" },
  },
  draw: (id, b, knobs, look, parts = []) => {
    const yes = (knob: string) => knobs[knob] === "yes" || knobs[knob] === true;
    const named = (knob: string) => (knobs[knob] === undefined || knobs[knob] === "none" ? undefined : String(knobs[knob]));
    const presentation = String(knobs.presentation ?? "push") as (typeof PRESENTATIONS)[number];
    const opening = String(knobs.opening ?? "title") as (typeof OPENINGS)[number];
    const title = bind(b.one("title"));
    const subtitle = bind(b.one("subtitle"));
    const symbol = look.icons ? named("symbol") : undefined;
    const sticky = named("sticky");
    const pinned = parts.find((part) => part.name === sticky);
    const inBody = parts.filter((part) => part !== pinned).map((part) => part.root);

    if (presentation === "alert" || presentation === "actionsheet") {
      // An alert leads with its title, not a symbol; an action sheet with its title as a caption, if it has one. The
      // stylesheet centres the one and stacks the other at the bottom, with Cancel, the last button, set apart.
      return [
        { id, component: "Screen", body: "dialog", dialog: true, ...(presentation === "actionsheet" ? { presentation } : {}) } as C,
        { id: "dialog", component: "Card", child: "dialog_body" },
        { id: "dialog_body", component: "Stack", gap: "md", children: ["dialog_title", ...inBody] },
        made({ id: "dialog_title", component: "Text", role: "headline", text: title }),
      ];
    }

    const navigation = yes("navigation");
    const cover = presentation === "fullscreen";
    // A tab's root and a full-screen cover lead with nothing, whatever the kind says; a pushed screen leads back, and a
    // sheet with a close button, unless the kind says the word Cancel (HIG navigation bars, sheets).
    const leading = navigation || cover ? "none" : knobs.leading === undefined ? (presentation === "sheet" ? "close" : "back") : String(knobs.leading);
    const trailing = named("trailing");
    const action = named("action");
    // A tab's root opens with a large title under the bar; the rest name themselves in the bar (HIG large titles).
    const large = opening === "title" && (knobs.title === undefined ? navigation : knobs.title === "large");
    const intro = opening === "title" && yes("intro");
    const body = [...(large ? ["large_title"] : []), ...(opening === "person" ? ["person"] : []), ...(opening === "outcome" ? ["outcome"] : []), ...(intro ? ["intro"] : []), ...inBody];
    const destinations = b.each("destinations");
    // A cover with nothing in its bar has no bar.
    const bar = !(cover && leading === "none" && !trailing && !action);
    return [
      { id, component: "Screen", ...(bar ? { appBar: "appbar" } : {}), body: "body", ...(pinned ? { sticky: "sticky" } : {}), ...(navigation ? { navBar: "navbar" } : {}), ...(presentation === "sheet" || cover ? { presentation } : {}) } as C,
      ...(bar
        ? [
            made({
              id: "appbar",
              component: "AppBar",
              title: opening === "title" && !large ? title : undefined,
              leading,
              actions: action ? [action] : [],
              trailing: trailing ? trailing[0].toUpperCase() + trailing.slice(1) : undefined,
            }),
          ]
        : []),
      { id: "body", component: "Stack", gap: "lg", children: body } as C,
      ...(large ? [made({ id: "large_title", component: "Text", role: "display", text: title })] : []),
      ...(opening === "person"
        ? [
            { id: "person", component: "Stack", gap: "xs", align: "center", children: ["person_avatar", "person_name", "person_line"] } as C,
            made({ id: "person_avatar", component: "Avatar", name: title, url: bind(b.one("portrait")), size: 88 }),
            made({ id: "person_name", component: "Text", role: "headline", text: title }),
            made({ id: "person_line", component: "Text", tone: "muted", text: subtitle }),
          ]
        : []),
      ...(opening === "outcome"
        ? [
            { id: "outcome", component: "Stack", gap: "sm", align: "center", children: [...(symbol ? ["outcome_icon"] : []), "outcome_title", "outcome_line"] } as C,
            ...(symbol ? [{ id: "outcome_icon", component: "Icon", name: symbol, boxed: true, size: 32 } as C] : []),
            made({ id: "outcome_title", component: "Text", role: "headline", text: title }),
            made({ id: "outcome_line", component: "Text", tone: "muted", text: subtitle }),
          ]
        : []),
      ...(intro ? [made({ id: "intro", component: "Text", tone: "muted", text: subtitle })] : []),
      ...(pinned ? [{ id: "sticky", component: "StickyBar", child: pinned.root } as C] : []),
      ...(navigation && destinations
        ? [made({ id: "navbar", component: "NavBar", items: at(destinations.path), active: bind(b.one("active")), icons: look.icons, icon: look.icons ? bind(destinations.bound.one("icon")) : undefined })]
        : []),
    ];
  },
};

/** The kit's patterns, with the frame drawn iOS's way. */
export const IOS_PATTERNS: Catalog = { ...KIT_PATTERNS, page: PAGE };

/** The iOS catalog as a file. */
export function iosCatalog(): Grammar {
  return catalogOf(
    "ios",
    "What the tool can draw the way iOS lays a screen out, for a graph to name. The patterns are the kit's (kit.md), drawn with the same components and painted by the idiom's stylesheet; the frame is the Human Interface Guidelines' and has knobs of its own: how the screen is presented (pushed, a sheet, a full-screen cover, an alert, an action sheet), a large or an inline title, what leads the bar and what word acts at its end. Written out from src/server/grammar/patterns-ios.ts by `npm run grammar:export`.",
    IOS_PATTERNS,
  );
}
