// The kit: the component catalog of the mock pipeline. A humble fork of A2UI.
//
// Kept from A2UI: a surface is a flat list of components addressed by id,
// structure (updateComponents) is separate from content (updateDataModel),
// any value can be bound to a data path, and a container can stamp a template
// once per element of an array. That split is what lets structure ship before
// a word has been written.
//
// Changed: the vocabulary. A2UI's basic catalog stops at atoms (Text, Row,
// Card). These are molecules, with the anatomy other people have already
// worked out:
//   layout      Stack, Cluster, Grid, Reel            Every Layout's primitives
//   list item   leading / overline, headline,         Material 3 lists
//               supporting / meta, trailing
//   chrome      AppBar, NavBar                        Material 3 top app bar, navigation bar
//   Group       inset rows under a quiet heading      iOS grouped lists
//   Stat        label, value, delta                   the KPI card (Tremor, shadcn/ui blocks)
//   Banner      tone, icon, title, text               Polaris
//   Text roles  display … caption                     the DESIGN.md typography scale itself
//
// Added: a catalog that grows while it is in use. A `Custom` component is a slot
// for something no catalog has (a map, a timer face, a seating plan). What fills
// it arrives later, in a `defineComponent` message, the way the pixels of an
// Image arrive after the box that holds them. Which definition a slot uses is
// data (`use` is bound), so the tree still ships before anything is baked.
//
// The schemas are shared: the server validates what it emits against them,
// and the renderer (src/web/kit) draws them.

import { z } from "zod";

export const KIT_CATALOG_ID = "https://github.com/dglazkov/jev2ui/catalogs/kit/v1";

const bound = z.object({ path: z.string() }).strict();
const str = z.union([z.string(), bound]);
const num = z.union([z.number(), bound]);
const bool = z.union([z.boolean(), bound]);
const id = z.string();
/** Explicit children, or one template stamped per element of the array at `path`. */
const children = z.union([z.array(id), z.object({ path: z.string(), componentId: id }).strict()]);

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
  Screen: z.object({ appBar: id.optional(), body: id, sticky: id.optional(), navBar: id.optional(), dialog: z.boolean().optional() }),
  AppBar: z.object({ title: str.optional(), leading: z.enum(["none", "back", "close", "menu"]).optional(), actions: z.array(z.string()).max(3).optional() }),
  NavBar: z.object({ items: bound, active: num.optional(), icons: z.boolean().optional() }),
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

/**
 * A baked component, whole: its source to run in a sandbox (src/web/kit/sandbox.ts), and what it takes to use it
 * again on another screen (src/server/mock/bake.ts). `card` says when, in the words a Choice would offer Jev;
 * `dataSchema` is what a writer fills; `contract` is what Jev asked for when it was baked.
 *
 * Its `id` is a hash of what it is (the source and the schema), so it means the same component wherever it turns
 * up: on another screen, in another session, in a saved app that somebody else opens. Nothing hands ids out.
 */
export const BAKED = z
  .object({
    id: z.string().regex(/^[a-f0-9]{16}$/),
    name: z.string().max(80),
    card: z.string().max(400),
    source: z.string().max(60_000),
    dataSchema: z.record(z.unknown()),
    contract: z.object({ use: z.enum(["watch", "pick", "adjust", "read"]), size: z.enum(["strip", "wide", "square", "tall"]), linked: z.boolean() }).strict(),
  })
  .strict();
export type Baked = z.infer<typeof BAKED>;

/**
 * The message that extends the catalog. It carries the whole component and not only what the renderer runs, so the
 * messages of a screen are everything there is to know about it: the app's shelf is the components its screens define.
 */
export const DEFINE_COMPONENT = BAKED.extend({ surfaceId: z.string() }).strict();

export type KitName = keyof typeof KIT;
export type KitComponent = { id: string; component: KitName } & Record<string, unknown>;

/** Props that name other components, for checking that every reference resolves. */
export function kitRefs(c: Record<string, any>): string[] {
  const refs: unknown[] = [c.child, c.appBar, c.body, c.sticky, c.navBar, c.leading, c.trailing, c.below];
  if (Array.isArray(c.children)) refs.push(...c.children);
  else if (c.children?.componentId) refs.push(c.children.componentId);
  // `leading` is an enum on AppBar, not a reference.
  return refs.filter((r): r is string => typeof r === "string" && !(c.component === "AppBar" && r === c.leading));
}
