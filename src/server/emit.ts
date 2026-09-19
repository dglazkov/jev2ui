// Deterministic assembly of A2UI components from Jev's decisions. Nothing in
// here is model output: every component comes from a builder that only
// produces catalog-valid shapes, and all content is bound by data path.

import type { Plan, Section } from "./plan.js";

export type Component = { id: string; component: string } & Record<string, unknown>;

export const WIDGETS = [
  "shortText",
  "longText",
  "number",
  "obscured",
  "date",
  "time",
  "dateTime",
  "checkbox",
  "singleChoice",
  "multiChoice",
  "slider",
] as const;
export type Widget = (typeof WIDGETS)[number];

export interface FieldContent {
  label: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface FieldDesign {
  widget: Widget;
  required: boolean;
  email: boolean;
}

export const path = (p: string) => ({ path: p });

// Input values live outside /form, so streaming updates to /form never clobber them.
const VALUES_PATH = "/values";
export const fieldKey = (i: number) => `f${i}`;
export const valuePath = (i: number) => `${VALUES_PATH}/${fieldKey(i)}`;
export const text = (id: string, p: string, variant?: string): Component => ({
  id,
  component: "Text",
  text: path(p),
  ...(variant ? { variant } : {}),
});

/**
 * Every section can ship before any content exists: display sections bind to
 * data by template, and the form and actions start as empty shells that grow
 * one child at a time as content streams in.
 */
const SKELETON_BUILDERS: Record<Section, (plan: Plan) => Component[]> = {
  form: () => formShell(),

  actions: () => [actionsContainer([])],

  media: () => [
    { id: "media", component: "Column", children: ["media_image", "media_caption"] },
    {
      id: "media_image",
      component: "Image",
      url: path("/media/imageUrl"),
      description: path("/media/caption"),
      variant: "header",
      fit: "cover",
    },
    text("media_caption", "/media/caption", "caption"),
  ],

  prose: () => [text("prose", "/prose/body")],

  facts: (plan) =>
    plan.factsLayout === "tiles"
      ? [factTilesContainer(0)]
      : [
          { id: "facts", component: "Column", children: { path: "/facts", componentId: "fact" } },
          { id: "fact", component: "Row", children: ["fact_label", "fact_value"], justify: "spaceBetween" },
          text("fact_label", "label", "caption"),
          text("fact_value", "value"),
        ],

  steps: () => [
    { id: "steps", component: "List", children: { path: "/steps", componentId: "step" }, listStyle: "ordered" },
    { id: "step", component: "Column", children: ["step_title", "step_detail"] },
    text("step_title", "title", "h4"),
    text("step_detail", "detail"),
  ],

  collection: (plan) => {
    // A carousel is sized by its pictures; without them its cards collapse, so the list runs down the page.
    const horizontal = plan.collectionDirection === "horizontal" && plan.collectionImages;
    // Picture and text share a row; the button sits under them, so the text keeps its width on a phone.
    const mainChildren = [...(plan.collectionImages ? ["item_image"] : []), "item_text"];
    const bodyChildren = ["item_main", ...(plan.collectionItemAction ? ["item_button_row"] : [])];
    const components: Component[] = [
      { id: "collection", component: "Column", children: ["collection_heading", "collection_list"] },
      text("collection_heading", "/collection/heading", "h3"),
      // A vertical list is a Column: the List component indents its items to make room for numbers.
      horizontal
        ? { id: "collection_list", component: "List", children: { path: "/collection/items", componentId: "item" }, direction: "horizontal", listStyle: "none" }
        : { id: "collection_list", component: "Column", children: { path: "/collection/items", componentId: "item" } },
      // A design that keeps content out of cards gets rows parted by a rule, like a printed list.
      ...(plan.contained
        ? [{ id: "item", component: "Card", child: "item_body" }]
        : [
            { id: "item", component: "Column", children: ["item_body", "item_rule"] },
            { id: "item_rule", component: "Divider" },
          ]),
      { id: "item_body", component: "Column", children: bodyChildren },
      horizontal
        ? { id: "item_main", component: "Column", children: mainChildren }
        : { id: "item_main", component: "Row", children: mainChildren, align: "start" },
      { id: "item_text", component: "Column", children: ["item_head", "item_subtitle", "item_description"], weight: 1 },
      { id: "item_head", component: "Row", children: ["item_title", "item_badge"], justify: "spaceBetween", align: "center" },
      text("item_title", "title", "h4"),
      text("item_badge", "badge", "caption"),
      text("item_subtitle", "subtitle", "caption"),
      text("item_description", "description"),
    ];
    if (plan.collectionItemAction) components.push({ id: "item_button_row", component: "Row", children: ["item_button"], justify: "end" });
    if (plan.collectionImages) {
      components.push({
        id: "item_image",
        component: "Image",
        url: path("imageUrl"),
        description: path("title"),
        variant: horizontal ? "mediumFeature" : "smallFeature",
        fit: "cover",
      });
    }
    if (plan.collectionItemAction) {
      components.push(
        {
          id: "item_button",
          component: "Button",
          child: "item_button_label",
          action: { event: { name: "itemAction", context: { item: path("title") } } },
        },
        text("item_button_label", "/collection/itemActionLabel"),
      );
    }
    return components;
  },
};

function shell(plan: Plan, sectionIds: string[]): Component[] {
  const header: Component[] = [
    {
      id: "header",
      component: "Row",
      children: [...(plan.icon ? ["header_icon"] : []), "header_titles"],
      align: "center",
    },
    { id: "header_titles", component: "Column", children: ["title", "subtitle"], weight: 1 },
    text("title", "/header/title", "h2"),
    text("subtitle", "/header/subtitle", "caption"),
  ];
  if (plan.icon) header.push({ id: "header_icon", component: "Icon", name: plan.icon });
  const main = { component: "Column", children: ["header", ...sectionIds] };
  return plan.card && plan.contained
    ? [{ id: "root", component: "Card", child: "main" }, { id: "main", ...main }, ...header]
    : [{ id: "root", ...main }, ...header];
}

/** Components that depend only on the plan. Sent before Gemini has produced anything. */
export function skeleton(plan: Plan): Component[] {
  return [...shell(plan, plan.sections), ...plan.sections.flatMap((s) => SKELETON_BUILDERS[s](plan))];
}

/** An empty form: heading and submit button, waiting for fields to be attached. */
export function formShell(): Component[] {
  return [
    formContainer(0),
    text("form_heading", "/form/heading", "h4"),
    {
      id: "form_submit",
      component: "Button",
      child: "form_submit_label",
      variant: "primary",
      action: { event: { name: "submitForm", context: { values: path(VALUES_PATH) } } },
    },
    text("form_submit_label", "/form/submitLabel"),
  ];
}

/** The form container with its first `count` fields attached. */
export function formContainer(count: number): Component {
  const fields = Array.from({ length: count }, (_, i) => `field_${i}`);
  return { id: "form", component: "Column", children: ["form_heading", ...fields, "form_submit"] };
}

/**
 * Tiles are laid out two to a row, so they fit a phone. A template cannot do
 * that, so tiles attach one by one as facts arrive, the way form fields do.
 */
const TILES_PER_ROW = 2;

/** The tiles container, and its rows, with the first `count` tiles attached. */
export function factTilesContainer(count: number): Component {
  const rows = Array.from({ length: Math.ceil(count / TILES_PER_ROW) }, (_, r) => `facts_row_${r}`);
  return { id: "facts", component: "Column", children: rows };
}

export function factTileComponents(i: number, count: number, contained: boolean): Component[] {
  const row = Math.floor(i / TILES_PER_ROW);
  const inRow = Array.from({ length: Math.min(TILES_PER_ROW, count - row * TILES_PER_ROW) }, (_, k) => `fact_${row * TILES_PER_ROW + k}`);
  const body = { component: "Column", children: [`fact_${i}_value`, `fact_${i}_label`], align: contained ? "center" : "start" };
  return [
    { id: `facts_row_${row}`, component: "Row", children: inRow },
    ...(contained
      ? [{ id: `fact_${i}`, component: "Card", child: `fact_${i}_body`, weight: 1 }, { id: `fact_${i}_body`, ...body }]
      : [{ id: `fact_${i}`, ...body, weight: 1 }]),
    text(`fact_${i}_value`, `/facts/${i}/value`, "h3"),
    text(`fact_${i}_label`, `/facts/${i}/label`, "caption"),
  ];
}

/** The actions row holding the buttons for these indices into /actions. */
export function actionsContainer(attached: number[]): Component {
  return { id: "actions", component: "Row", children: attached.map((i) => `action_${i}`), justify: "end" };
}

export function actionComponents(i: number, label: string, primary: boolean): Component[] {
  return [
    {
      id: `action_${i}`,
      component: "Button",
      child: `action_${i}_label`,
      variant: primary ? "primary" : "default",
      action: { event: { name: "action", context: { label } } },
    },
    text(`action_${i}_label`, `/actions/${i}/label`),
  ];
}

export function fieldComponent(i: number, field: FieldContent, design: FieldDesign): Component {
  const id = `field_${i}`;
  const label = path(`/form/fields/${i}/label`);
  const value = path(valuePath(i));
  const checks: unknown[] = [];
  if (design.required) {
    checks.push({
      condition: { call: "required", args: { value }, returnType: "boolean" },
      message: "This field is required.",
    });
  }
  if (design.email) {
    checks.push({
      condition: { call: "email", args: { value }, returnType: "boolean" },
      message: "Enter a valid email address.",
    });
  }
  const checkable = checks.length ? { checks } : {};

  switch (design.widget) {
    case "checkbox":
      return { id, component: "CheckBox", label, value };
    case "singleChoice":
    case "multiChoice":
      return {
        id,
        component: "ChoicePicker",
        label,
        value,
        variant: design.widget === "multiChoice" ? "multipleSelection" : "mutuallyExclusive",
        displayStyle: (field.options?.length ?? 0) <= 5 ? "chips" : "checkbox",
        options: (field.options ?? []).map((o) => ({ label: o, value: o })),
      };
    case "slider":
      return { id, component: "Slider", label, value, min: field.min ?? 0, max: field.max ?? 100 };
    case "date":
    case "time":
    case "dateTime":
      return {
        id,
        component: "DateTimeInput",
        label,
        value,
        enableDate: design.widget !== "time",
        enableTime: design.widget !== "date",
        ...checkable,
      };
    default:
      return { id, component: "TextField", label, value, variant: design.widget, ...checkable };
  }
}

export function initialFieldValue(field: FieldContent, design: FieldDesign): unknown {
  switch (design.widget) {
    case "checkbox":
      return false;
    case "singleChoice":
    case "multiChoice":
      return [];
    case "slider":
      return field.min ?? 0;
    default:
      return "";
  }
}

/** A widget is only usable if the content Gemini wrote can actually back it. */
export function widgetFits(widget: Widget, field: FieldContent): boolean {
  if (widget === "singleChoice" || widget === "multiChoice") return (field.options?.length ?? 0) >= 2;
  if (widget === "slider") return typeof field.min === "number" && typeof field.max === "number" && field.min < field.max;
  return true;
}
