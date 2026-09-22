// iOS, as a catalog a graph can name: the kit's patterns, with the frame drawn the
// way the Human Interface Guidelines lay a screen out (docs/grammar.md).
//
// The frame's knobs are the kit's page's, to the name, so a grammar written for one
// is read by the other; what differs is what each makes of a setting. Here a main
// screen is a tab's root and opens with a large title under a bar that carries only
// what leads and acts; a pushed screen names itself in the bar beside the way back;
// the destinations are a tab bar; and a dialog is an alert, which leads with no
// symbol and stacks its buttons. The rest of the idiom is the stylesheet's
// (src/web/kit/ios.css), over the same components, so what is baked into a slot
// is painted with it too.
//
// grammar/ios/catalog.md is written out from this by `npm run grammar:export`.

import type { KitComponent } from "../../shared/kit.js";
import type { Grammar } from "./format.js";
import type { Catalog, Pattern } from "./make.js";
import { KIT_PATTERNS, LEADINGS_OF_BAR, OPENINGS, YES_NO, at, bind, catalogOf, made, slots } from "./patterns.js";

type C = KitComponent;

const PAGE: Pattern = {
  name: "page",
  card: "A screen of an iOS app: a navigation bar with what leads and the one action, a large title on a main screen or the title in the bar on a pushed one, the parts below, a tab bar of the app's main destinations on a main screen, a call to action pinned to the bottom edge, or an alert over it all (HIG navigation bar, tab bar, alert).",
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
    opening: { takes: OPENINGS, is: "how the screen opens: with its title, large on a main screen and in the bar on a pushed one; with the person it is about; or with how something went, a symbol and a headline in place of a title" },
    leading: { takes: LEADINGS_OF_BAR, is: "what leads the bar on a screen that is not a main one: a back chevron, or a close button, or nothing. A main screen is a tab's root and its bar leads with nothing whatever is set; unset, the rest lead with a back chevron" },
    action: { takes: [], is: "the symbol of the one action at the trailing edge of the bar, or none" },
    navigation: { takes: YES_NO, is: "whether the tab bar of the app's main destinations is shown: on a main screen" },
    sticky: { takes: [], is: "the name of the part pinned to the bottom edge, so that a call to action is always in reach, or none" },
    dialog: { takes: YES_NO, is: "an alert over the screen: the title and the parts centred in a small card, the buttons stacked under a hairline, and no bar" },
    intro: { takes: YES_NO, is: "a line of introduction under the title, from the subtitle: for a kind of screen its title does not explain" },
    symbol: { takes: [], is: "the symbol of what the screen is about, shown by an outcome, or none. An alert shows none" },
  },
  draw: (id, b, knobs, look, parts = []) => {
    const yes = (knob: string) => knobs[knob] === "yes" || knobs[knob] === true;
    const named = (knob: string) => (knobs[knob] === undefined || knobs[knob] === "none" ? undefined : String(knobs[knob]));
    const opening = String(knobs.opening ?? "title") as (typeof OPENINGS)[number];
    const title = bind(b.one("title"));
    const subtitle = bind(b.one("subtitle"));
    const symbol = look.icons ? named("symbol") : undefined;
    const sticky = named("sticky");
    const pinned = parts.find((part) => part.name === sticky);
    const inBody = parts.filter((part) => part !== pinned).map((part) => part.root);

    if (yes("dialog")) {
      // An alert leads with its title, not a symbol (HIG alerts); the stylesheet centres it and stacks the buttons.
      return [
        { id, component: "Screen", body: "dialog", dialog: true },
        { id: "dialog", component: "Card", child: "dialog_body" },
        { id: "dialog_body", component: "Stack", gap: "md", children: ["dialog_title", ...inBody] },
        made({ id: "dialog_title", component: "Text", role: "headline", text: title }),
      ];
    }

    const navigation = yes("navigation");
    // A main screen is a tab's root: its bar leads with nothing, whatever the kind says. The rest are pushed onto it and
    // lead with a chevron back, unless the kind says a close button (HIG navigation bars).
    const leading = navigation ? "none" : knobs.leading === undefined ? "back" : String(knobs.leading);
    const action = named("action");
    // A main screen opens with a large title under the bar; a pushed screen names itself in the bar (HIG large titles).
    const large = navigation && opening === "title";
    const intro = opening === "title" && yes("intro");
    const body = [...(large ? ["large_title"] : []), ...(opening === "person" ? ["person"] : []), ...(opening === "outcome" ? ["outcome"] : []), ...(intro ? ["intro"] : []), ...inBody];
    const destinations = b.each("destinations");
    return [
      { id, component: "Screen", appBar: "appbar", body: "body", ...(pinned ? { sticky: "sticky" } : {}), ...(navigation ? { navBar: "navbar" } : {}) } as C,
      made({
        id: "appbar",
        component: "AppBar",
        title: opening === "title" && !large ? title : undefined,
        leading,
        actions: action ? [action] : [],
      }),
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
    "What the tool can draw the way iOS lays a screen out, for a graph to name. The patterns are the kit's (kit.md), drawn with the same components and painted by the idiom's stylesheet; the frame is the Human Interface Guidelines': a navigation bar, a large title on a main screen, a tab bar, an alert. Written out from src/server/grammar/patterns-ios.ts by `npm run grammar:export`.",
    IOS_PATTERNS,
  );
}
