// From a plan to a tree of kit components, and to the schema of the words that
// fill it. Nothing here is model output. Every block binds to its own corner of
// the data model, so the whole tree can be sent before any text exists; and the
// content schema is built from the same anatomy, so Gemini is asked for exactly
// the slots the tree has.

import type { KitComponent } from "../../shared/kit.js";
import type { Block, ScreenPlan } from "./plan.js";
import { ARCHETYPES } from "./plan.js";

const at = (path: string) => ({ path });
type C = KitComponent;

const BUILDERS: Record<Block, (plan: ScreenPlan) => C[]> = {
  banner: () => [{ id: "banner", component: "Banner", title: at("/banner/title"), text: at("/banner/text"), tone: at("/banner/tone") }],

  hero: () => [{ id: "hero", component: "Image", url: at("/hero/imageUrl"), ratio: "16:9" }],

  filters: (plan) => [
    { id: "filters", component: "Stack", gap: "sm", children: [...(plan.search ? ["filters_search"] : []), "filters_chips"] },
    ...(plan.search ? [{ id: "filters_search", component: "Search", placeholder: at("/filters/searchPlaceholder") } as C] : []),
    { id: "filters_chips", component: "Chips", items: at("/filters/chips") },
  ],

  stats: (plan) => [
    { id: "stats", component: "Grid", min: 140, children: { path: "/stats", componentId: "stat" } },
    { id: "stat", component: "Stat", label: at("label"), value: at("value"), ...(plan.statDeltas ? { delta: at("delta"), tone: at("tone") } : {}), flat: !plan.contained },
  ],

  list: (plan) => {
    const { layout, leading, trailing, parts } = plan.list;
    const has = (part: string) => parts.includes(part as any);
    const pictured = layout !== "rows";
    // On a feed the list is the screen, and the bar has already named it.
    const headed = plan.archetype !== "feed";
    const out: C[] = [
      { id: "list", component: "Stack", gap: "sm", children: [...(headed ? ["list_heading"] : []), "list_items"] },
      { id: "list_heading", component: "Text", role: "title", text: at("/list/heading") },
    ];
    const items = { path: "/list/items", componentId: pictured ? "item_card" : "item" };
    if (layout === "rows") out.push({ id: "list_items", component: "Group", children: items, flat: !plan.contained });
    if (layout === "cards") out.push({ id: "list_items", component: "Stack", gap: "md", children: items });
    if (layout === "grid") out.push({ id: "list_items", component: "Grid", min: 150, gap: "sm", children: items });
    if (layout === "reel") out.push({ id: "list_items", component: "Reel", itemWidth: 230, gap: "sm", children: items });
    if (pictured) {
      out.push(
        { id: "item_card", component: "Card", pad: "none", child: "item_card_body" },
        { id: "item_card_body", component: "Stack", gap: "none", children: ["item_picture", "item_card_text"] },
        { id: "item_picture", component: "Image", url: at("imageUrl"), alt: at("title"), ratio: layout === "grid" ? "1:1" : layout === "reel" ? "4:3" : "16:9", bleed: true },
        { id: "item_card_text", component: "Stack", gap: "none", pad: "sm", children: ["item"] },
      );
    }

    // Material 3 list item. The meta slot takes the one figure people compare on; the rest goes below.
    const meta = has("price") ? "price" : has("time") ? "time" : undefined;
    const chips = [...(has("rating") ? ["item_rating"] : []), ...(has("status") ? ["item_status"] : []), ...(has("time") && meta !== "time" ? ["item_time"] : [])];
    const below = [...(chips.length ? ["item_chips"] : []), ...(has("progress") ? ["item_progress"] : [])];
    const compact = layout === "grid";
    out.push({
      id: "item",
      component: "ListItem",
      headline: at("title"),
      ...(has("description") && !compact ? { overline: at("subtitle"), supporting: at("description") } : { supporting: at("subtitle") }),
      ...(meta ? { meta: at(meta) } : {}),
      ...(!pictured && leading !== "none" ? { leading: "item_leading" } : {}),
      ...(trailing !== "none" && !compact ? { trailing: "item_trailing" } : {}),
      ...(below.length ? { below: "item_below" } : {}),
    });
    if (below.length) out.push({ id: "item_below", component: "Stack", gap: "xs", children: below });
    if (chips.length) out.push({ id: "item_chips", component: "Cluster", gap: "sm", children: chips });
    if (has("rating")) out.push({ id: "item_rating", component: "Rating", value: at("rating"), count: at("reviews") });
    if (has("status")) out.push({ id: "item_status", component: "Badge", text: at("status"), tone: at("tone") });
    if (chips.includes("item_time")) out.push({ id: "item_time", component: "Text", role: "caption", tone: "muted", text: at("time") });
    if (has("progress")) out.push({ id: "item_progress", component: "Progress", value: at("progress"), tone: at("tone") });

    if (!pictured) {
      if (leading === "avatar") out.push({ id: "item_leading", component: "Avatar", name: at("title"), size: 44 });
      if (leading === "thumbnail") out.push({ id: "item_leading", component: "Image", url: at("imageUrl"), alt: at("title"), ratio: "1:1", width: 64 });
      if (leading === "icon") out.push({ id: "item_leading", component: "Icon", name: at("icon"), boxed: true });
      if (leading === "number") out.push({ id: "item_leading", component: "Numeral" });
    }
    if (trailing === "chevron") out.push({ id: "item_trailing", component: "Icon", name: "chevron_right", tone: "muted", size: 20 });
    if (trailing === "button") out.push({ id: "item_trailing", component: "Button", label: at("/list/actionLabel"), small: true, event: "item" });
    if (trailing === "switch") out.push({ id: "item_trailing", component: "Switch", on: at("on") });
    if (trailing === "checkbox") out.push({ id: "item_trailing", component: "Checkbox", on: at("on") });
    return out;
  },

  groups: (plan) => [
    { id: "groups", component: "Stack", gap: "lg", children: { path: "/groups", componentId: "group" } },
    // A template inside a template: rows resolve against the group they are in.
    { id: "group", component: "Group", title: at("title"), children: { path: "rows", componentId: "setting" }, flat: !plan.contained },
    {
      id: "setting",
      component: "SettingRow",
      ...(plan.icons ? { icon: at("icon") } : {}),
      label: at("label"),
      detail: at("detail"),
      value: at("value"),
      control: at("control"),
      on: at("on"),
    },
  ],

  facts: (plan) => [
    { id: "facts", component: "Card", child: "facts_rows", flat: !plan.contained },
    { id: "facts_rows", component: "Stack", gap: "none", children: { path: "/facts", componentId: "fact" } },
    { id: "fact", component: "KeyValue", label: at("label"), value: at("value"), strong: at("strong") },
  ],

  prose: () => [{ id: "prose", component: "Text", markdown: true, text: at("/prose/body") }],

  steps: () => [
    { id: "steps", component: "Stack", gap: "sm", children: { path: "/steps", componentId: "step" } },
    { id: "step", component: "Step", title: at("title"), detail: at("detail") },
  ],

  form: () => [
    { id: "form", component: "Stack", gap: "md", children: ["form_heading", "form_fields", "form_submit"] },
    { id: "form_heading", component: "Text", role: "title", text: at("/form/heading") },
    { id: "form_fields", component: "Stack", gap: "md", children: { path: "/form/fields", componentId: "field" } },
    { id: "field", component: "Field", label: at("label"), kind: at("kind"), placeholder: at("placeholder"), options: at("options"), min: at("min"), max: at("max") },
    { id: "form_submit", component: "Button", variant: "primary", full: true, label: at("/form/submitLabel"), event: "submit" },
  ],

  actions: () => [
    { id: "actions", component: "Cluster", gap: "sm", justify: "end", children: { path: "/actions", componentId: "action" } },
    { id: "action", component: "Button", label: at("label"), variant: at("variant"), event: "action" },
  ],
};

/** The whole tree, from the plan alone. */
export function screen(plan: ScreenPlan, screenIcon: string | null): C[] {
  const shape = ARCHETYPES[plan.archetype];
  const sticky = !!shape.stickyActions && plan.blocks.includes("actions");
  const inBody = plan.blocks.filter((b) => !(sticky && b === "actions"));
  const blocks = plan.blocks.flatMap((b) => BUILDERS[b](plan));

  if (shape.dialog) {
    const icon = plan.icons && screenIcon;
    return [
      { id: "root", component: "Screen", body: "dialog", dialog: true },
      { id: "dialog", component: "Card", child: "dialog_body" },
      { id: "dialog_body", component: "Stack", gap: "md", children: [...(icon ? ["dialog_icon"] : []), "dialog_title", ...inBody] },
      ...(icon ? [{ id: "dialog_icon", component: "Icon", name: icon, boxed: true } as C] : []),
      { id: "dialog_title", component: "Text", role: "headline", text: at("/header/title") },
      ...blocks,
    ];
  }

  // A feed, a dashboard and a settings page are named by their bar; the others earn a line of introduction.
  // A profile opens with the person instead, and a lead photograph would compete with them.
  const intro = !plan.person && !["feed", "dashboard", "settings"].includes(plan.archetype);
  const body = [...(plan.person ? ["person"] : []), ...(intro ? ["intro"] : []), ...inBody.filter((b) => !(plan.person && b === "hero"))];
  return [
    { id: "root", component: "Screen", appBar: "appbar", body: "body", ...(sticky ? { sticky: "sticky" } : {}), ...(plan.topLevel ? { navBar: "navbar" } : {}) },
    {
      id: "appbar",
      component: "AppBar",
      // On a profile the person is the title.
      ...(plan.person ? {} : { title: at("/header/title") }),
      leading: plan.topLevel ? "none" : plan.archetype === "form" ? "close" : "back",
      actions: plan.appBarAction ? [plan.appBarAction] : [],
    },
    { id: "body", component: "Stack", gap: "lg", children: body },
    ...(plan.person
      ? ([
          { id: "person", component: "Stack", gap: "xs", align: "center", children: ["person_avatar", "person_name", "person_line"] },
          { id: "person_avatar", component: "Avatar", name: at("/header/title"), size: 88 },
          { id: "person_name", component: "Text", role: "headline", text: at("/header/title") },
          { id: "person_line", component: "Text", tone: "muted", text: at("/header/subtitle") },
        ] as C[])
      : []),
    ...(intro ? [{ id: "intro", component: "Text", tone: "muted", text: at("/header/subtitle") } as C] : []),
    ...(sticky ? [{ id: "sticky", component: "StickyBar", child: "actions" } as C] : []),
    ...(plan.topLevel ? [{ id: "navbar", component: "NavBar", items: at("/nav/items"), active: at("/nav/active"), icons: plan.icons } as C] : []),
    ...blocks,
  ];
}

// --- What Gemini is asked to write ----------------------------------------------

export type Part = "header" | "nav" | Exclude<Block, "hero">;

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, propertyOrdering: Object.keys(properties) });
const list = (items: unknown, description: string, maxItems: number, minItems = 1) => ({ type: "array", items, description, maxItems, minItems });

function itemSchema(plan: ScreenPlan) {
  const has = (part: string) => plan.list.parts.includes(part as any);
  return obj({
    title: str("The item's name."),
    subtitle: str("A short secondary line: category, author, place, variant."),
    ...(has("description") ? { description: str("One sentence.") } : {}),
    ...(has("price") ? { price: str("Price or amount with currency, e.g. '$24.00'.") } : {}),
    ...(has("rating") ? { rating: { type: "number", description: "Rating out of 5, one decimal." }, reviews: str("Number of reviews, e.g. '128'.") } : {}),
    ...(has("status") ? { status: str("One or two words: the item's current state.") } : {}),
    ...(has("time") ? { time: str("Short date, time or duration, e.g. 'Today 7:15 pm', '42 min'.") } : {}),
    ...(has("progress") ? { progress: { type: "number", description: "Percent from 0 to 100." } } : {}),
    ...(plan.list.trailing === "switch" || plan.list.trailing === "checkbox" ? { on: { type: "boolean", description: "Whether it is currently on or ticked." } } : {}),
  });
}

export function partSchema(part: Part, plan: ScreenPlan | null): unknown {
  const schemas: Record<Part, () => unknown> = {
    header: () => obj({ title: str("Screen title, at most four words."), subtitle: str("One short supporting line.") }),
    nav: () => obj({ items: list(obj({ label: str("One word.") }), "The app's three to five main destinations.", 5, 3), active: { type: "integer", description: "Index of the destination this screen belongs to." } }),
    banner: () => obj({ title: str("What needs attention, in a few words."), text: str("One sentence of detail.") }),
    filters: () => obj({ searchPlaceholder: str("Placeholder of the search field."), chips: list(str("One or two words."), "Filter categories. The first is the one currently selected, usually 'All'.", 6, 3) }),
    stats: () =>
      list(
        obj({ label: str("Short label."), value: str("The figure with its unit, e.g. '24.2 kWh'."), ...(plan?.statDeltas ? { delta: str("Change against the previous period, signed, e.g. '+12%' or '-0.4 kW'.") } : {}) }),
        "Headline numbers.",
        6,
        2,
      ),
    list: () =>
      obj({
        heading: str("Heading above the list."),
        ...(plan?.list.trailing === "button" ? { actionLabel: str("One word for the button on every item, e.g. 'Book', 'Add', 'Play'.") } : {}),
        items: list(itemSchema(plan!), "The items.", 8, 3),
      }),
    groups: () =>
      list(
        obj({
          title: str("Group heading, one or two words."),
          rows: list(
            obj(
              {
                label: str("The setting or option."),
                detail: str("ONLY if the label needs explaining: one short line."),
                value: str("ONLY for a setting with one current value picked from several: that value, e.g. 'English', 'High quality', '15 seconds'. Never for on/off settings."),
              },
              ["label"],
            ),
            "Rows in this group.",
            6,
          ),
        }),
        "Groups of related settings. The last group holds account-level actions if there are any.",
        5,
        2,
      ),
    facts: () => list(obj({ label: str("Short label."), value: str("Short value.") }), plan?.factsTotal ? "Label-value details. The last one is the total." : "Label-value details.", 8, 2),
    prose: () => obj({ body: str("Body text. Simple markdown (bold, short bullet lists) is allowed.") }),
    steps: () => list(obj({ title: str("Imperative step title."), detail: str("One or two sentences.") }), "Ordered steps.", 8, 2),
    form: () =>
      obj({
        heading: str("Heading above the fields."),
        submitLabel: str("Label of the submit button."),
        fields: list(
          obj(
            {
              label: str("Field label."),
              placeholder: str("Example of what a person would enter, e.g. 'Jane Appleseed', 'name@example.com'."),
              options: list(str("Option label."), "ONLY for fields where the person picks from three or more known choices. Never for yes/no fields.", 8, 2),
              min: { type: "number", description: "ONLY for bounded numeric fields." },
              max: { type: "number", description: "ONLY for bounded numeric fields." },
            },
            ["label", "placeholder"],
          ),
          "The input fields.",
          8,
        ),
      }),
    actions: () => list(obj({ label: str("Button label, one to three words.") }), "One or two buttons, most important first.", 2),
  };
  return obj({ [part]: schemas[part]() });
}

export const SYSTEM_PROMPT = `You write the sample content for one part of a mock-up of an app screen.
A separate system has already decided the layout and the components; you supply only the words and figures, as JSON matching the schema.
Write what the real app would show to a typical signed-in person: specific, plausible names, numbers and dates, never placeholders or lorem ipsum.
Other parts of the same screen are written separately, so stay strictly within your part and do not repeat the screen title.
Keep every string short. Do not describe the UI, do not mention buttons or layout, and do not use HTML.`;

export function partPrompt(description: string, part: Part, plan: ScreenPlan | null, voice: string, agreeWith?: unknown): string {
  const parts = plan ? `The screen is a ${plan.archetype} screen with these parts: header, ${plan.blocks.join(", ")}.\n` : "";
  // The Overview of a DESIGN.md describes the brand; the words should sound like it.
  const brand = voice ? `The product's brand, for tone of voice only:\n${voice}\n` : "";
  const given = agreeWith ? `Already on the screen, which your figures must agree with:\n${JSON.stringify(agreeWith)}\n` : "";
  return `Screen description: ${description}\n${parts}${brand}${given}Write the "${part}" part.`;
}
