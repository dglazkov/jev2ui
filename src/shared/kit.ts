// The kit: the tool's own components, the set the kit idiom draws with. A humble fork of A2UI.
//
// What a surface is (a flat list of components by id, structure apart from content, bindings, templates) is every
// set's, and is said in components.ts. What is the kit's is the vocabulary. A2UI's basic catalog stops at atoms
// (Text, Row, Card). These are molecules, with the anatomy other people have already worked out:
//   layout      Stack, Cluster, Grid, Reel            Every Layout's primitives
//   list item   leading / overline, headline,         Material 3 lists
//               supporting / meta, trailing
//   chrome      AppBar, NavBar                        Material 3 top app bar, navigation bar
//   Group       inset rows under a quiet heading      iOS grouped lists
//   Stat        label, value, delta                   the KPI card (Tremor, shadcn/ui blocks)
//   Banner      tone, icon, title, text               Polaris
//   Text roles  display … caption                     the DESIGN.md typography scale itself
//
// `Custom` is the slot a baked component arrives in (components.ts): which definition fills it is data (`use` is
// bound), so the tree still ships before anything is baked.
//
// Another idiom brings a set of its own (ios.ts takes these and redraws the frame); nothing here is any other
// idiom's. The server checks what it sends against the set its surface names (sets.ts), and the browser draws the
// kit's with src/web/kit/components.ts.

import { z } from "zod";
import { bool, bound, childRefs, children, id, num, str, type ComponentSet } from "./components.js";
import { IDIOMS } from "./idioms.js";

/** The id a surface is created with when the kit's own idiom draws it. Another idiom's catalog has its own (idioms.ts). */
export const KIT_CATALOG_ID = IDIOMS.kit.catalogId;

export const SPACE = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const TEXT_ROLES = ["display", "headline", "title", "body", "label", "caption"] as const;
export const TONES = ["neutral", "accent", "success", "warning", "danger"] as const;
/** What sits at the end of a settings row. Decided per row, from its content. */
export const CONTROLS = ["switch", "value", "nav", "check", "danger"] as const;
export const FIELD_KINDS = ["text", "long", "number", "password", "date", "time", "dateTime", "select", "chips", "multi", "slider", "checkbox"] as const;

const gap = z.enum(SPACE).optional();
const weight = z.number().optional();

export const KIT = {
  // --- Frame ---------------------------------------------------------------
  /** `dialog` is a card over the screen, with no bar. */
  Screen: z.object({ appBar: id.optional(), body: id, sticky: id.optional(), navBar: id.optional(), dialog: z.boolean().optional() }),
  AppBar: z.object({ title: str.optional(), leading: z.enum(["none", "back", "close", "menu"]).optional(), actions: z.array(z.string()).max(3).optional() }),
  /** `icon` is where each destination's symbol is, relative to the destination; without it, the bar looks under `icon`. */
  NavBar: z.object({ items: bound, active: num.optional(), icons: z.boolean().optional(), icon: bound.optional() }),
  StickyBar: z.object({ child: id }),

  // --- Layout --------------------------------------------------------------
  Stack: z.object({ children, gap, pad: z.enum(SPACE).optional(), align: z.enum(["stretch", "start", "center", "end"]).optional(), weight }),
  Cluster: z.object({ children, gap, justify: z.enum(["start", "center", "end", "between"]).optional(), align: z.enum(["start", "center", "end", "baseline"]).optional(), weight }),
  Grid: z.object({ children, min: z.number().optional(), gap }),
  Reel: z.object({ children, itemWidth: z.number().optional(), gap }),
  Card: z.object({ child: id, flat: z.boolean().optional(), pad: z.enum(SPACE).optional(), weight }),
  Group: z.object({ title: str.optional(), children, flat: z.boolean().optional() }),
  Divider: z.object({}),

  // --- Content -------------------------------------------------------------
  Text: z.object({ text: str, role: z.enum(TEXT_ROLES).optional(), tone: z.enum(["default", "muted", "accent", "danger"]).optional(), markdown: z.boolean().optional(), weight }),
  Icon: z.object({ name: str, tone: z.enum(["default", "muted", "accent"]).optional(), size: z.number().optional(), boxed: z.boolean().optional() }),
  /** `icon` stands in, on a ground painted from the palette, until the picture has loaded. */
  Image: z.object({ url: str, alt: str.optional(), icon: str.optional(), ratio: z.enum(["21:9", "16:9", "4:3", "1:1", "3:4"]).optional(), width: z.number().optional(), bleed: z.boolean().optional() }),
  Avatar: z.object({ name: str, url: str.optional(), size: z.number().optional() }),
  Numeral: z.object({}),
  Badge: z.object({ text: str, tone: str.optional() }),
  Rating: z.object({ value: num, count: str.optional() }),
  Progress: z.object({ value: num, tone: str.optional() }),
  Stat: z.object({ label: str, value: str, delta: str.optional(), tone: str.optional(), flat: z.boolean().optional() }),
  KeyValue: z.object({ label: str, value: str, strong: bool.optional() }),
  Step: z.object({ title: str, detail: str.optional() }),
  Banner: z.object({ title: str, text: str.optional(), tone: str.optional(), icon: str.optional() }),
  ListItem: z.object({
    leading: id.optional(),
    overline: str.optional(),
    headline: str,
    supporting: str.optional(),
    meta: str.optional(),
    trailing: id.optional(),
    below: id.optional(),
    weight,
  }),
  SettingRow: z.object({ icon: str.optional(), label: str, detail: str.optional(), value: str.optional(), control: str, on: bool.optional() }),

  /** `use` names a definition; `data` is what the definition draws; `items` are the list's items when it draws those. */
  Custom: z.object({ use: str, ratio: z.enum(["3:1", "16:9", "1:1", "3:4"]), data: bound.optional(), items: bound.optional(), selection: bound.optional(), failed: bool.optional() }),

  // --- Input ---------------------------------------------------------------
  Search: z.object({ placeholder: str }),
  Chips: z.object({ items: bound, active: z.number().optional() }),
  Button: z.object({
    label: str,
    /** primary | secondary | text | danger. Bindable, because which button is primary is decided from the labels. */
    variant: str.optional(),
    /** A tap only closes what the button is on and goes back, as Cancel does. Bindable, because which button that is is decided from the labels. */
    closes: bool.optional(),
    icon: str.optional(),
    full: z.boolean().optional(),
    small: z.boolean().optional(),
    event: z.string().optional(),
    weight,
  }),
  Switch: z.object({ on: bool.optional() }),
  Checkbox: z.object({ on: bool.optional() }),
  Field: z.object({ label: str, kind: str, placeholder: str.optional(), options: bound.optional(), min: num.optional(), max: num.optional() }),
} as const;

for (const [name, schema] of Object.entries(KIT)) (KIT as any)[name] = schema.strict();

export type KitName = keyof typeof KIT;
export type KitComponent = { id: string; component: KitName } & Record<string, unknown>;

/** Props that name other components, for checking that every reference resolves. */
export function kitRefs(c: Record<string, any>): string[] {
  const refs: unknown[] = [...childRefs(c), c.appBar, c.body, c.sticky, c.navBar, c.leading, c.trailing, c.below];
  // `leading` is an enum on AppBar and `trailing` a word, not references; on a ListItem both are.
  return refs.filter((r): r is string => typeof r === "string" && !(c.component === "AppBar" && (r === c.leading || r === c.trailing)));
}

export const KIT_SET: ComponentSet = { schemas: KIT, refs: kitRefs };
