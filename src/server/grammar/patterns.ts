// The kit, as a catalog a graph can name (docs/grammar.md).
//
// A pattern is a molecule the kit can draw: a list of things, a row of headline
// numbers, a form. It has slots, which a graph's fields fill, and knobs, which a
// graph's answers turn. It never sees a ScreenPlan: what reaches it is where the
// data for each slot is, what each knob is set to, and the look of the design.
//
// These are the builders of mock/screen.ts said over again against that interface,
// and a test holds each to the builder it was taken from. What a pattern knows is
// the kit's own business and stays here: that the meta slot takes the first figure
// offered and the rest go below, that a grid is too tight for a second line.
//
// grammar/kit.md is written out from the declarations below, so that a graph can be
// checked against the catalog by someone who has only the files.

import type { KitComponent } from "../../shared/kit.js";
import { parseGrammar, type Field, type Grammar } from "./format.js";
import type { Bound, Catalog, Pattern } from "./make.js";

type C = KitComponent;
const at = (path: string) => ({ path });
/** A slot nobody filled is a prop that is not there. */
const bind = (path: string | undefined) => (path === undefined ? undefined : at(path));
const made = (component: Record<string, unknown>) => Object.fromEntries(Object.entries(component).filter(([, value]) => value !== undefined)) as C;
const slots = (text: string): Field[] => parseGrammar(`## slots\n${text}`).nodes[0].fields;
const need = (found: ReturnType<Bound["each"]>, pattern: string, slot: string) => {
  if (!found) throw new Error(`"${pattern}" cannot be drawn without "${slot}"`);
  return found;
};

const LAYOUTS = ["rows", "cards", "grid", "reel"] as const;
const LEADINGS = ["avatar", "thumbnail", "icon", "number", "none"] as const;
const TRAILINGS = ["chevron", "button", "switch", "checkbox", "none"] as const;
const RATIOS = ["3:1", "16:9", "1:1", "3:4"] as const;

const PATTERNS: Pattern[] = [
  {
    name: "banner",
    card: "One thing that needs attention before anything else, set apart in a tinted band (Polaris).",
    slots: slots("- `title` required — what needs attention\n- `text` — a sentence of detail\n- `tone` — success, warning, danger or accent"),
    knobs: {},
    draw: (id, b) => [made({ id, component: "Banner", title: bind(b.one("title")), text: bind(b.one("text")), tone: bind(b.one("tone")) })],
  },
  {
    name: "picture",
    card: "One large picture that leads, the full width of what it is in.",
    slots: slots("- `picture` required — the address of the picture"),
    knobs: {},
    draw: (id, b, _, look) => [made({ id, component: "Image", url: bind(b.one("picture")), icon: look.symbol, ratio: "16:9" })],
  },
  {
    name: "filters",
    card: "Ways to narrow down what is shown: a row of category chips, under a search field when there is one.",
    slots: slots("- `search` — the placeholder of a search field; with none, there is no field\n- `chips` required — the categories"),
    knobs: {},
    draw: (id, b) => {
      const search = b.one("search");
      return [
        { id, component: "Stack", gap: "sm", children: [...(search ? [`${id}_search`] : []), `${id}_chips`] },
        ...(search ? [{ id: `${id}_search`, component: "Search", placeholder: at(search) } as C] : []),
        made({ id: `${id}_chips`, component: "Chips", items: bind(b.one("chips")) }),
      ];
    },
  },
  {
    name: "slot",
    card: "A box of a fixed shape for something no catalog has. What fills it arrives later, the way a picture does.",
    slots: slots("- `use` required — which definition fills it\n- `data` — what the definition draws\n- `selection` — what the person picked in it\n- `failed` — that nothing could be made to fill it\n- `items` — a list from elsewhere on the screen, when it draws those"),
    knobs: { ratio: RATIOS },
    draw: (id, b, knobs) => [made({ id, component: "Custom", use: bind(b.one("use")), ratio: knobs.ratio, data: bind(b.one("data")), selection: bind(b.one("selection")), failed: bind(b.one("failed")), items: bind(b.one("items")) })],
  },
  {
    name: "stats",
    card: "A few headline numbers at a glance, as tiles that reflow (the KPI card: Tremor, shadcn/ui).",
    slots: slots("- `stats` required\n  - `label` required\n  - `value` required — the figure, with its unit\n  - `delta` — the change against last time\n  - `tone` — whether that change is good news"),
    knobs: {},
    draw: (id, b, _, look) => {
      const stats = need(b.each("stats"), "stats", "stats");
      const s = stats.bound;
      return [
        { id, component: "Grid", min: 140, children: { path: stats.path, componentId: `${id}_stat` } },
        made({ id: `${id}_stat`, component: "Stat", label: bind(s.one("label")), value: bind(s.one("value")), delta: bind(s.one("delta")), tone: bind(s.one("tone")), flat: !look.contained }),
      ];
    },
  },
  {
    name: "collection",
    card: "Several similar things to look through: dense rows, large picture cards, a grid of tiles or a sideways reel (Material 3 list item; NN/g on cards and grids).",
    slots: slots(
      [
        "- `heading` — a title above them",
        "- `action` — the label of the one button every item has, when trailing is button",
        "- `items` required",
        "  - `headline` required — the name of the thing",
        "  - `supporting` — up to two lines; of two, the first goes above the headline",
        "  - `meta` — the one figure people compare on; any more are set below as captions",
        "  - `rating` — a number out of five",
        "  - `count` — how many ratings",
        "  - `badge` — a word or two of state",
        "  - `progress` — a percentage",
        "  - `tone` — what colours the badge and the progress",
        "  - `picture` — the address of the item's picture, or portrait",
        "  - `icon` — the name of a symbol, when leading is icon",
        "  - `on` — whether it is switched on or ticked",
      ].join("\n"),
    ),
    knobs: { layout: LAYOUTS, leading: LEADINGS, trailing: TRAILINGS },
    draw: (id, b, knobs, look) => {
      const layout = (knobs.layout ?? "rows") as (typeof LAYOUTS)[number];
      const leading = (knobs.leading ?? "none") as (typeof LEADINGS)[number];
      const trailing = (knobs.trailing ?? "none") as (typeof TRAILINGS)[number];
      const items = need(b.each("items"), "collection", "items");
      const i = items.bound;
      const heading = b.one("heading");
      const pictured = layout !== "rows";
      const compact = layout === "grid";
      const name = (part: string) => `${id}_item${part ? `_${part}` : ""}`;
      const out: C[] = [{ id, component: "Stack", gap: "sm", children: [...(heading ? [`${id}_heading`] : []), `${id}_items`] }];
      if (heading) out.push({ id: `${id}_heading`, component: "Text", role: "title", text: at(heading) });
      const stamped = { path: items.path, componentId: pictured ? name("card") : name("") };
      if (layout === "rows") out.push({ id: `${id}_items`, component: "Group", children: stamped, flat: !look.contained });
      if (layout === "cards") out.push({ id: `${id}_items`, component: "Stack", gap: "md", children: stamped });
      if (layout === "grid") out.push({ id: `${id}_items`, component: "Grid", min: 150, gap: "sm", children: stamped });
      if (layout === "reel") out.push({ id: `${id}_items`, component: "Reel", itemWidth: 230, gap: "sm", children: stamped });
      if (pictured) {
        out.push(
          { id: name("card"), component: "Card", pad: "none", child: name("card_body") },
          { id: name("card_body"), component: "Stack", gap: "none", children: [name("picture"), name("card_text")] },
          made({ id: name("picture"), component: "Image", url: bind(i.one("picture")), alt: bind(i.one("headline")), icon: look.symbol, ratio: layout === "grid" ? "1:1" : layout === "reel" ? "4:3" : "16:9", bleed: true }),
          { id: name("card_text"), component: "Stack", gap: "none", pad: "sm", children: [name("")] },
        );
      }

      // Material 3 list item. The meta slot takes the first figure offered; the rest go below.
      const supporting = i.all("supporting");
      const two = supporting.length > 1 && !compact;
      const [meta, ...captions] = i.all("meta");
      const chips = [...(i.one("rating") ? [name("rating")] : []), ...(i.one("badge") ? [name("badge")] : []), ...captions.map((_, n) => name(`caption${n || ""}`))];
      const below = [...(chips.length ? [name("chips")] : []), ...(i.one("progress") ? [name("progress")] : [])];
      const led = !pictured && leading !== "none";
      const trailed = trailing !== "none" && !compact;
      out.push(
        made({
          id: name(""),
          component: "ListItem",
          headline: bind(i.one("headline")),
          ...(two ? { overline: at(supporting[0]), supporting: at(supporting[1]) } : { supporting: bind(supporting[0]) }),
          meta: bind(meta),
          leading: led ? name("leading") : undefined,
          trailing: trailed ? name("trailing") : undefined,
          below: below.length ? name("below") : undefined,
        }),
      );
      if (below.length) out.push({ id: name("below"), component: "Stack", gap: "xs", children: below });
      if (chips.length) out.push({ id: name("chips"), component: "Cluster", gap: "sm", children: chips });
      if (i.one("rating")) out.push(made({ id: name("rating"), component: "Rating", value: bind(i.one("rating")), count: bind(i.one("count")) }));
      if (i.one("badge")) out.push(made({ id: name("badge"), component: "Badge", text: bind(i.one("badge")), tone: bind(i.one("tone")) }));
      captions.forEach((path, n) => out.push({ id: name(`caption${n || ""}`), component: "Text", role: "caption", tone: "muted", text: at(path) }));
      if (i.one("progress")) out.push(made({ id: name("progress"), component: "Progress", value: bind(i.one("progress")), tone: bind(i.one("tone")) }));

      if (led) {
        // Initials until the person's photograph arrives, and for good if the design has no photographs.
        if (leading === "avatar") out.push(made({ id: name("leading"), component: "Avatar", name: bind(i.one("headline")), url: bind(i.one("picture")), size: 44 }));
        if (leading === "thumbnail") out.push(made({ id: name("leading"), component: "Image", url: bind(i.one("picture")), alt: bind(i.one("headline")), icon: look.symbol, ratio: "1:1", width: 64 }));
        if (leading === "icon") out.push(made({ id: name("leading"), component: "Icon", name: bind(i.one("icon")), boxed: true }));
        if (leading === "number") out.push({ id: name("leading"), component: "Numeral" });
      }
      if (trailed) {
        if (trailing === "chevron") out.push({ id: name("trailing"), component: "Icon", name: "chevron_right", tone: "muted", size: 20 });
        if (trailing === "button") out.push(made({ id: name("trailing"), component: "Button", label: bind(b.one("action")), small: true, event: "itemAction" }));
        if (trailing === "switch") out.push(made({ id: name("trailing"), component: "Switch", on: bind(i.one("on")) }));
        if (trailing === "checkbox") out.push(made({ id: name("trailing"), component: "Checkbox", on: bind(i.one("on")) }));
      }
      return out;
    },
  },
  {
    name: "groups",
    card: "Rows of settings or options under quiet headings, each ending in the control it needs (iOS inset grouped lists).",
    slots: slots("- `groups` required\n  - `title` — the heading of a group\n  - `rows` required\n    - `label` required\n    - `detail` — a line of explanation\n    - `value` — the setting's current value\n    - `icon` — the name of a symbol\n    - `control` — switch, value, nav, check or danger\n    - `on` — whether it is switched on or chosen"),
    knobs: {},
    draw: (id, b, _, look) => {
      const groups = need(b.each("groups"), "groups", "groups");
      const rows = need(groups.bound.each("rows"), "groups", "rows");
      const r = rows.bound;
      return [
        { id, component: "Stack", gap: "lg", children: { path: groups.path, componentId: `${id}_group` } },
        // A template inside a template: rows resolve against the group they are in.
        made({ id: `${id}_group`, component: "Group", title: bind(groups.bound.one("title")), children: { path: rows.path, componentId: `${id}_row` }, flat: !look.contained }),
        made({ id: `${id}_row`, component: "SettingRow", icon: look.icons ? bind(r.one("icon")) : undefined, label: bind(r.one("label")), detail: bind(r.one("detail")), value: bind(r.one("value")), control: bind(r.one("control")), on: bind(r.one("on")) }),
      ];
    },
  },
  {
    name: "details",
    card: "Label-and-value details in one card: specifications, a summary, a bill whose last line is its total.",
    slots: slots("- `rows` required\n  - `label` required\n  - `value` required\n  - `strong` — that this row is the one the others add up to"),
    knobs: {},
    draw: (id, b, _, look) => {
      const rows = need(b.each("rows"), "details", "rows");
      const r = rows.bound;
      return [
        { id, component: "Card", child: `${id}_rows`, flat: !look.contained },
        { id: `${id}_rows`, component: "Stack", gap: "none", children: { path: rows.path, componentId: `${id}_row` } },
        made({ id: `${id}_row`, component: "KeyValue", label: bind(r.one("label")), value: bind(r.one("value")), strong: bind(r.one("strong")) }),
      ];
    },
  },
  {
    name: "prose",
    card: "A paragraph or more of running text; simple markdown is drawn.",
    slots: slots("- `body` required"),
    knobs: {},
    draw: (id, b) => [made({ id, component: "Text", markdown: true, text: bind(b.one("body")) })],
  },
  {
    name: "steps",
    card: "Steps to follow in order, numbered.",
    slots: slots("- `steps` required\n  - `title` required\n  - `detail`"),
    knobs: {},
    draw: (id, b) => {
      const steps = need(b.each("steps"), "steps", "steps");
      return [
        { id, component: "Stack", gap: "sm", children: { path: steps.path, componentId: `${id}_step` } },
        made({ id: `${id}_step`, component: "Step", title: bind(steps.bound.one("title")), detail: bind(steps.bound.one("detail")) }),
      ];
    },
  },
  {
    name: "form",
    card: "Fields the person fills in and submits together, under a heading, ending in the one button that submits them.",
    slots: slots("- `heading` required\n- `submit` required — the label of the button\n- `fields` required\n  - `label` required\n  - `kind` — text, long, number, password, date, time, dateTime, select, chips, multi, slider or checkbox\n  - `placeholder`\n  - `options` — what there is to pick from\n  - `min`\n  - `max`"),
    knobs: {},
    draw: (id, b) => {
      const fields = need(b.each("fields"), "form", "fields");
      const f = fields.bound;
      return [
        { id, component: "Stack", gap: "md", children: [`${id}_heading`, `${id}_fields`, `${id}_submit`] },
        made({ id: `${id}_heading`, component: "Text", role: "title", text: bind(b.one("heading")) }),
        { id: `${id}_fields`, component: "Stack", gap: "md", children: { path: fields.path, componentId: `${id}_field` } },
        made({ id: `${id}_field`, component: "Field", label: bind(f.one("label")), kind: bind(f.one("kind")), placeholder: bind(f.one("placeholder")), options: bind(f.one("options")), min: bind(f.one("min")), max: bind(f.one("max")) }),
        made({ id: `${id}_submit`, component: "Button", variant: "primary", full: true, label: bind(b.one("submit")), event: "submit" }),
      ];
    },
  },
  {
    name: "actions",
    card: "One or two buttons that act on the whole of what is shown, the main one marked.",
    slots: slots("- `actions` required\n  - `label` required\n  - `variant` — primary, secondary, text or danger"),
    knobs: {},
    draw: (id, b) => {
      const actions = need(b.each("actions"), "actions", "actions");
      return [
        { id, component: "Cluster", gap: "sm", justify: "end", children: { path: actions.path, componentId: `${id}_action` } },
        made({ id: `${id}_action`, component: "Button", label: bind(actions.bound.one("label")), variant: bind(actions.bound.one("variant")), event: "action" }),
      ];
    },
  },
];

export const KIT_PATTERNS: Catalog = Object.fromEntries(PATTERNS.map((pattern) => [pattern.name, pattern]));

/** The catalog as a file. A pattern is a heading: what it is for, its slots, and under it each knob with what it can be set to. */
export function kitCatalog(): Grammar {
  return {
    name: "kit",
    prose: [
      "What the kit can draw, for a graph to name: a part says `→ collection` after its heading, its fields say `as headline`, and a question under it says `→ layout`. Each pattern below is what it is for, the slots a graph's fields can fill, and the knobs a graph's answers can turn. Written out from src/server/grammar/patterns.ts by `npm run grammar:export`.",
    ],
    options: [],
    nodes: PATTERNS.map((pattern) => ({
      name: pattern.name,
      block: false,
      traits: [],
      prose: [pattern.card],
      fields: pattern.slots,
      children: Object.entries(pattern.knobs).map(([knob, values]) => ({ name: knob, block: false, traits: [], prose: [], fields: [], asking: { type: "choice" as const, options: values.map((value) => ({ name: value, criteria: null })) }, children: [] })),
    })),
    rules: [],
    examples: [],
  };
}
