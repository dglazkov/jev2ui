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

  actions: () => [actionsContainer(0)],

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
      ? [
          { id: "facts", component: "Row", children: { path: "/facts", componentId: "fact" }, justify: "spaceEvenly" },
          { id: "fact", component: "Card", child: "fact_body", weight: 1 },
          { id: "fact_body", component: "Column", children: ["fact_value", "fact_label"], align: "center" },
          text("fact_value", "value", "h3"),
          text("fact_label", "label", "caption"),
        ]
      : [
          { id: "facts", component: "Column", children: { path: "/facts", componentId: "fact" } },
          { id: "fact", component: "Row", children: ["fact_label", "fact_value"], justify: "spaceBetween" },
          text("fact_label", "label", "caption"),
          text("fact_value", "value"),
        ],

  steps: () => [
    { id: "steps", component: "List", children: { path: "/steps", componentId: "step" }, listStyle: "ordered" },
    { id: "step", component: "Column", children: ["step_title", "step_detail"] },
    text("step_title", "title", "h5"),
    text("step_detail", "detail"),
  ],

  collection: (plan) => {
    const horizontal = plan.collectionDirection === "horizontal";
    const itemChildren = [
      ...(plan.collectionImages ? ["item_image"] : []),
      "item_text",
      ...(plan.collectionItemAction ? ["item_button"] : []),
    ];
    const components: Component[] = [
      { id: "collection", component: "Column", children: ["collection_heading", "collection_list"] },
      text("collection_heading", "/collection/heading", "h4"),
      {
        id: "collection_list",
        component: "List",
        children: { path: "/collection/items", componentId: "item" },
        direction: plan.collectionDirection,
        listStyle: "none",
      },
      { id: "item", component: "Card", child: "item_body" },
      horizontal
        ? { id: "item_body", component: "Column", children: itemChildren }
        : { id: "item_body", component: "Row", children: itemChildren, align: "center" },
      { id: "item_text", component: "Column", children: ["item_head", "item_subtitle", "item_description"], weight: 1 },
      { id: "item_head", component: "Row", children: ["item_title", "item_badge"], justify: "spaceBetween" },
      text("item_title", "title", "h5"),
      text("item_badge", "badge", "caption"),
      text("item_subtitle", "subtitle", "caption"),
      text("item_description", "description"),
    ];
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
  return plan.card
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

/** The actions row with its first `count` buttons attached. */
export function actionsContainer(count: number): Component {
  const buttons = Array.from({ length: count }, (_, i) => `action_${i}`);
  return { id: "actions", component: "Row", children: buttons, justify: "end" };
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
