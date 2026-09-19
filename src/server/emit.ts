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

const path = (p: string) => ({ path: p });
const text = (id: string, p: string, variant?: string): Component => ({
  id,
  component: "Text",
  text: path(p),
  ...(variant ? { variant } : {}),
});

/** Sections whose components bind to data by template, so they can ship before any content exists. */
const SKELETON_BUILDERS: Partial<Record<Section, (plan: Plan) => Component[]>> = {
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

const DATA_DEPENDENT: Section[] = ["form", "actions"];

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
  const early = plan.sections.filter((s) => !DATA_DEPENDENT.includes(s));
  return [...shell(plan, early), ...early.flatMap((s) => SKELETON_BUILDERS[s]!(plan))];
}

const fieldKey = (i: number) => `f${i}`;
const valuePath = (i: number) => `/form/values/${fieldKey(i)}`;

function fieldComponent(i: number, field: FieldContent, design: FieldDesign): Component {
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

export interface FinalDesign {
  fields: FieldDesign[];
  /** Index into content.actions of the primary button, or -1. */
  primaryAction: number;
}

/**
 * The data-dependent remainder: form and actions, plus a re-issued container
 * so the new sections are attached to the tree.
 */
export function completion(plan: Plan, content: any, design: FinalDesign): Component[] {
  const components: Component[] = [];
  const hasForm = plan.sections.includes("form") && content.form?.fields?.length > 0;
  const hasActions = plan.sections.includes("actions") && content.actions?.length > 0;
  if (!hasForm && !hasActions) return components;

  if (hasForm) {
    const fields: FieldContent[] = content.form.fields;
    components.push(
      {
        id: "form",
        component: "Column",
        children: ["form_heading", ...fields.map((_, i) => `field_${i}`), "form_submit"],
      },
      text("form_heading", "/form/heading", "h4"),
      ...fields.map((f, i) => fieldComponent(i, f, design.fields[i])),
      {
        id: "form_submit",
        component: "Button",
        child: "form_submit_label",
        variant: "primary",
        action: {
          event: {
            name: "submitForm",
            context: Object.fromEntries(fields.map((_, i) => [fieldKey(i), path(valuePath(i))])),
          },
        },
      },
      text("form_submit_label", "/form/submitLabel"),
    );
  }

  if (hasActions) {
    const actions: Array<{ label: string }> = content.actions;
    components.push({
      id: "actions",
      component: "Row",
      children: actions.map((_, i) => `action_${i}`),
      justify: "end",
    });
    actions.forEach((action, i) => {
      components.push(
        {
          id: `action_${i}`,
          component: "Button",
          child: `action_${i}_label`,
          // A form's submit button is already the primary call to action.
          variant: !hasForm && i === design.primaryAction ? "primary" : "default",
          action: { event: { name: "action", context: { label: action.label } } },
        },
        text(`action_${i}_label`, `/actions/${i}/label`),
      );
    });
  }

  const sectionIds = plan.sections.filter(
    (s) => !DATA_DEPENDENT.includes(s) || (s === "form" ? hasForm : hasActions),
  );
  const container = shell(plan, sectionIds)[plan.card ? 1 : 0];
  return [container, ...components];
}
