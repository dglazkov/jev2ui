// From job profile to screen. This file is where design knowledge lives: Jev
// says who the person is and what they are trying to get done; the rules here
// say which pattern serves that job, what it contains, and what Gemini is
// asked to write for it.

import { formShell, path, text, type Component } from "./emit.js";
import { partSchema } from "./plan.js";
import type { Anxiety, Criterion, JobProfile, Stage } from "./job-profile.js";

export type Pattern = "confirm" | "form" | "answer" | "compare" | "browse" | "article" | "guide";

export function choosePattern(p: JobProfile): { pattern: Pattern; because: string } {
  // Stage is the strongest single signal but not a reliable one on its own, so rules that
  // other answers contradict are overruled first.
  const reading = p.flow === "system_to_person";
  if (p.done === "configured" && !reading && !p.detailsComplete) {
    return { pattern: "form", because: "they want settings to be a certain way and have not said which, so give them the controls" };
  }
  if (p.stage === "committing" && reading) {
    // Nothing to enter or confirm, whatever stage says: "How do I make sourdough starter?" reads as committing.
    return p.done === "finished_task"
      ? { pattern: "guide", because: "they will be reading, and done means a finished hands-on task, so give steps" }
      : { pattern: "answer", because: "they will be reading, not entering anything, so lead with the answer" };
  }

  switch (p.stage) {
    case "committing":
      return p.detailsComplete
        ? { pattern: "confirm", because: "they have decided and said everything needed, so restate it and ask for the go-ahead" }
        : { pattern: "form", because: "they have decided but details are missing, so collect only those" };
    case "deciding":
      return { pattern: "answer", because: "they are about to say yes or no, so lead with a verdict and offer both ways out" };
    case "checking":
      return { pattern: "answer", because: "they want to know how something stands, so lead with the verdict, then the evidence" };
    case "comparing":
      return { pattern: "compare", because: "they are weighing a few candidates, so put them side by side with aligned attributes" };
    case "doing":
      return { pattern: "guide", because: "they are mid-task, so give steps they can follow with their hands busy" };
    case "exploring":
      if (p.cardinality === "many") return { pattern: "browse", because: "they are looking around a large set, so give a list to scan" };
      if (p.cardinality === "few" || p.done === "picked")
        return { pattern: "compare", because: "they want to end up with one pick from a handful, so put a shortlist side by side" };
      return { pattern: "article", because: "they want to understand one subject, so explain it" };
  }
}

// --- What Gemini is asked to write -------------------------------------------

export interface PartSpec {
  part: string;
  schema: unknown;
  /** Extra guidance for this part, on top of the person's situation. */
  brief?: string;
  /**
   * A part this one must not contradict. It is written only once that part is finished, and is shown it.
   * Parts are otherwise written in parallel by requests that cannot see each other.
   */
  after?: string;
}

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  propertyOrdering: Object.keys(properties),
});
const list = (items: unknown, description: string, maxItems: number) => ({ type: "array", items, description, maxItems });
const wrap = (part: string, schema: unknown) => obj({ [part]: schema });
const facts = (description: string, max: number) => list(obj({ label: str("Short label."), value: str("Short value.") }), description, max);

/** Selection criteria that show up as text on an item. `looks` shows up as a picture instead. */
const CRITERION_FIELDS: Record<Exclude<Criterion, "looks">, { field: string; description: string }> = {
  price: { field: "price", description: "Price or price range." },
  quality: { field: "rating", description: "Rating or quality signal, e.g. '4.6 ★ (342)'." },
  location: { field: "location", description: "Distance or neighbourhood." },
  time: { field: "availability", description: "When it is available, e.g. 'Tonight 7:30 pm'." },
};

const WORRIES: Record<Anxiety, string> = {
  cost: "how much this will cost",
  commitment: "being locked into something",
  loss: "losing something they cannot get back",
  mistake: "doing it wrong",
  safety: "their safety, health or security",
};

export const textCriteria = (p: JobProfile) => p.criteria.filter((c): c is Exclude<Criterion, "looks"> => c !== "looks");
export const showsPictures = (p: JobProfile) => p.criteria.includes("looks");
const showsRecords = (p: JobProfile) => p.cardinality === "few" || p.cardinality === "many";
const hasButtons = (pattern: Pattern, p: JobProfile) => pattern === "confirm" || (pattern === "answer" && p.stage === "deciding");
const hasIntro = (p: JobProfile) => p.urgency < 1.5;

const HEADER: PartSpec = { part: "header", schema: partSchema("header") };
const VERDICT: PartSpec = {
  part: "verdict",
  schema: wrap(
    "verdict",
    obj({
      headline: str("The direct answer in at most eight words, e.g. 'No surprises: about $68 this month'."),
      detail: str("One or two sentences explaining the answer."),
    }),
  ),
};

/** Every pattern opens with one of these, so both can be requested before the pattern is known. */
export const OPENING_PARTS = [HEADER, VERDICT];

export function partsFor(pattern: Pattern, p: JobProfile): PartSpec[] {
  const parts: PartSpec[] = [];
  const add = (part: string, schema: unknown, brief?: string, after?: string) => parts.push({ part, schema, brief, after });
  const reuse = (part: "form" | "prose" | "facts" | "steps" | "media", brief?: string) => add(part, partSchema(part), brief);

  if (pattern !== "answer") parts.push(HEADER);

  switch (pattern) {
    case "confirm":
      add("summary", wrap("summary", facts("Exactly what will happen: who, what, when, how much.", 5)));
      add("consequence", wrap("consequence", obj({ text: str("One sentence on what happens next, or on what cannot be undone.") })));
      break;
    case "form":
      reuse("form", "Ask only for details the person has not already given.");
      break;
    case "answer":
      parts.push(VERDICT);
      if (showsRecords(p)) {
        add(
          "records",
          wrap(
            "records",
            obj({
              items: list(
                obj({ title: str("Record name."), subtitle: str("When, where or who."), badge: str("Very short status or value.") }),
                "The records the answer is about.",
                8,
              ),
            }),
          ),
          undefined,
          "verdict",
        );
      } else {
        add("evidence", wrap("evidence", facts("The few facts that back up the answer.", p.attention < 1 ? 3 : 5)), undefined, "verdict");
      }
      break;
    case "compare":
    case "browse": {
      const fields = Object.fromEntries(textCriteria(p).map((c) => [CRITERION_FIELDS[c].field, str(CRITERION_FIELDS[c].description)]));
      add(
        "items",
        wrap(
          "items",
          obj({
            heading: str("Heading above the options."),
            pickLabel: str(pattern === "compare" ? "Verb for choosing one, e.g. 'Reserve', 'Choose'." : "Verb for opening one, e.g. 'View'."),
            items: list(
              obj({ title: str("Option name."), ...fields, description: str("One sentence on why it fits this person.") }),
              "The options.",
              pattern === "compare" ? 3 : 8,
            ),
          }),
        ),
        pattern === "compare" ? "Offer exactly the number of options asked for, or three." : undefined,
      );
      break;
    }
    case "article":
      if (p.visual) reuse("media");
      reuse("prose");
      reuse("facts");
      break;
    case "guide":
      if (hasIntro(p)) reuse("prose", "Two sentences at most: what this achieves and what is needed before starting.");
      reuse("steps", p.urgency >= 1.5 ? "The person is in a hurry. Keep each step to one short sentence." : undefined);
      break;
  }

  if (hasButtons(pattern, p)) {
    add(
      "buttons",
      wrap(
        "buttons",
        obj({
          confirmLabel: str("Label for going ahead, naming the action, e.g. 'Delete account', 'Send $50'."),
          cancelLabel: str("Label for not going ahead, e.g. 'Keep my account', 'Not now'."),
        }),
      ),
    );
  }
  if (p.anxiety) {
    add(
      "reassurance",
      wrap("reassurance", obj({ text: str("One short sentence.") })),
      `Honestly address the person's likely worry about ${WORRIES[p.anxiety]}. Do not promise what you cannot know.`,
    );
  }
  return parts;
}

const STAGE_SITUATION: Record<Stage, string> = {
  exploring: "The person does not have a particular thing in mind yet and wants to see what is out there.",
  comparing: "The person has a few candidates in mind and wants to weigh them.",
  deciding: "The person is about to say yes or no to one specific thing and wants to be sure first.",
  committing: "The person has decided and wants to make it happen.",
  doing: "The person is in the middle of a hands-on task.",
  checking: "Something already happened or is under way, and the person wants to know how it stands.",
};

/** The job, in words, so that what Gemini writes fits it. */
export function situation(p: JobProfile): string {
  const lines = [STAGE_SITUATION[p.stage]];
  if (p.stakes >= 2) lines.push("What happens next would be hard or impossible to undo.");
  if (p.urgency >= 1.5) lines.push("They need this right now.");
  if (p.attention < 1) lines.push("They want to take it in at a glance.");
  if (p.habitual) lines.push("They have done this many times before; skip the basics.");
  if (p.anxiety) lines.push(`They may be worried about ${WORRIES[p.anxiety]}.`);
  return lines.join(" ");
}

// --- The component tree ------------------------------------------------------

const RUNNER_UP_LABEL: Record<Stage, string> = {
  exploring: "Show me what else is out there",
  comparing: "Compare a few options",
  deciding: "Help me decide",
  committing: "Go ahead with this",
  doing: "Walk me through it",
  checking: "Check how it stands",
};

const button = (id: string, labelPath: string, event: string, variant: "primary" | "default" | "borderless", context = {}): Component[] => [
  { id, component: "Button", child: `${id}_label`, variant, action: { event: { name: event, context } } },
  text(`${id}_label`, labelPath),
];

const factRows = (id: string, dataPath: string): Component[] => [
  { id, component: "Column", children: { path: dataPath, componentId: `${id}_row` } },
  { id: `${id}_row`, component: "Row", children: [`${id}_label`, `${id}_value`], justify: "spaceBetween" },
  text(`${id}_label`, "label", "caption"),
  text(`${id}_value`, "value"),
];

const factTiles = (id: string, dataPath: string): Component[] => [
  { id, component: "Row", children: { path: dataPath, componentId: `${id}_tile` }, justify: "spaceEvenly" },
  { id: `${id}_tile`, component: "Card", child: `${id}_tile_body`, weight: 1 },
  { id: `${id}_tile_body`, component: "Column", children: [`${id}_value`, `${id}_label`], align: "center" },
  text(`${id}_value`, "value", "h3"),
  text(`${id}_label`, "label", "caption"),
];

function itemCard(pattern: "compare" | "browse", p: JobProfile): Component[] {
  const [badge, ...others] = textCriteria(p).map((c) => CRITERION_FIELDS[c].field);
  const attributes = others.map((field) => text(`item_${field}`, field, "caption"));
  const picture: Component[] = showsPictures(p)
    ? [
        {
          id: "item_image",
          component: "Image",
          url: path("imageUrl"),
          description: path("title"),
          variant: pattern === "compare" ? "mediumFeature" : "smallFeature",
          fit: "cover",
        },
      ]
    : [];
  const pick = button("item_pick", "/items/pickLabel", "pickItem", pattern === "compare" ? "primary" : "default", { item: path("title") });

  if (pattern === "compare") {
    // Every card has the same rows in the same order, so attributes line up across cards.
    return [
      { id: "item", component: "Card", child: "item_body" },
      {
        id: "item_body",
        component: "Column",
        children: [...picture.map((c) => c.id), "item_title", ...(badge ? ["item_badge"] : []), ...attributes.map((c) => c.id), "item_description", "item_pick"],
      },
      text("item_title", "title", "h4"),
      ...(badge ? [text("item_badge", badge, "h5")] : []),
      ...attributes,
      text("item_description", "description"),
      ...picture,
      ...pick,
    ];
  }
  return [
    { id: "item", component: "Card", child: "item_body" },
    { id: "item_body", component: "Row", children: [...picture.map((c) => c.id), "item_text", "item_pick"], align: "center" },
    { id: "item_text", component: "Column", children: ["item_head", ...(attributes.length ? ["item_attributes"] : []), "item_description"], weight: 1 },
    { id: "item_head", component: "Row", children: ["item_title", ...(badge ? ["item_badge"] : [])], justify: "spaceBetween" },
    text("item_title", "title", "h5"),
    ...(badge ? [text("item_badge", badge, "caption")] : []),
    ...(attributes.length ? [{ id: "item_attributes", component: "Row", children: attributes.map((c) => c.id), justify: "start" } as Component] : []),
    ...attributes,
    text("item_description", "description"),
    ...picture,
    ...pick,
  ];
}

/** The whole tree for a pattern. Everything binds to data paths, so it ships before any text exists. */
export function jobSkeleton(pattern: Pattern, p: JobProfile): Component[] {
  const irreversible = p.stakes >= 2.5;
  const icon = pattern === "confirm" && irreversible ? "warning" : p.icon;
  const components: Component[] = [];
  const sections: string[] = [];
  const section = (id: string, built: Component[]) => {
    sections.push(id);
    components.push(...built);
  };

  if (pattern === "answer") {
    // Verdict first: the answer is the headline, not a title followed by an answer.
    section("verdict", [
      { id: "verdict", component: "Row", children: [...(icon ? ["verdict_icon"] : []), "verdict_text"], align: "center" },
      ...(icon ? [{ id: "verdict_icon", component: "Icon", name: icon }] : []),
      { id: "verdict_text", component: "Column", children: ["verdict_headline", "verdict_detail"], weight: 1 },
      text("verdict_headline", "/verdict/headline", "h2"),
      text("verdict_detail", "/verdict/detail"),
    ]);
  } else {
    section("header", [
      { id: "header", component: "Row", children: [...(icon ? ["header_icon"] : []), "header_titles"], align: "center" },
      ...(icon ? [{ id: "header_icon", component: "Icon", name: icon }] : []),
      { id: "header_titles", component: "Column", children: ["title", "subtitle"], weight: 1 },
      text("title", "/header/title", "h2"),
      text("subtitle", "/header/subtitle", "caption"),
    ]);
  }

  const reassurance = () => {
    if (!p.anxiety) return;
    section("reassurance", [
      { id: "reassurance", component: "Row", children: ["reassurance_icon", "reassurance_text"], align: "center" },
      { id: "reassurance_icon", component: "Icon", name: p.anxiety === "safety" ? "lock" : "info" },
      { ...text("reassurance_text", "/reassurance/text", "caption"), weight: 1 },
    ]);
  };

  const buttons = () => {
    // When it cannot be undone, the safe way out is the emphasised one. While the person is
    // still deciding, neither way is pushed.
    const goAhead = irreversible || p.stage === "deciding" ? "default" : "primary";
    section("buttons", [
      { id: "buttons", component: "Row", children: ["cancel", "confirm"], justify: "end" },
      ...button("cancel", "/buttons/cancelLabel", "cancel", irreversible ? "primary" : "borderless"),
      ...button("confirm", "/buttons/confirmLabel", "confirm", goAhead),
    ]);
  };

  switch (pattern) {
    case "confirm":
      section("summary", factRows("summary", "/summary"));
      section("consequence", [text("consequence", "/consequence/text")]);
      reassurance();
      buttons();
      break;
    case "form":
      reassurance();
      section("form", formShell());
      break;
    case "answer":
      if (showsRecords(p)) {
        section("records", [
          { id: "records", component: "List", children: { path: "/records/items", componentId: "record" }, listStyle: "none" },
          { id: "record", component: "Card", child: "record_body" },
          { id: "record_body", component: "Row", children: ["record_text", "record_badge"], align: "center" },
          { id: "record_text", component: "Column", children: ["record_title", "record_subtitle"], weight: 1 },
          text("record_title", "title", "h5"),
          text("record_subtitle", "subtitle", "caption"),
          text("record_badge", "badge", "caption"),
        ]);
      } else {
        section("evidence", p.attention < 1 ? factTiles("evidence", "/evidence") : factRows("evidence", "/evidence"));
      }
      reassurance();
      if (hasButtons(pattern, p)) buttons();
      break;
    case "compare":
    case "browse":
      section("items", [
        { id: "items", component: "Column", children: ["items_heading", "items_list"] },
        text("items_heading", "/items/heading", "h4"),
        {
          id: "items_list",
          component: "List",
          children: { path: "/items/items", componentId: "item" },
          direction: pattern === "compare" ? "horizontal" : "vertical",
          listStyle: "none",
        },
        ...itemCard(pattern, p),
      ]);
      reassurance();
      break;
    case "article":
      if (p.visual) {
        section("media", [
          { id: "media", component: "Column", children: ["media_image", "media_caption"] },
          { id: "media_image", component: "Image", url: path("/media/imageUrl"), description: path("/media/caption"), variant: "header", fit: "cover" },
          text("media_caption", "/media/caption", "caption"),
        ]);
      }
      section("prose", [text("prose", "/prose/body")]);
      section("facts", factRows("facts", "/facts"));
      break;
    case "guide":
      if (hasIntro(p)) section("prose", [text("prose", "/prose/body")]);
      section("steps", [
        { id: "steps", component: "List", children: { path: "/steps", componentId: "step" }, listStyle: "ordered" },
        { id: "step", component: "Column", children: ["step_title", "step_detail"] },
        // In a hurry, step titles are what gets read.
        text("step_title", "title", p.urgency >= 1.5 ? "h4" : "h5"),
        text("step_detail", "detail"),
      ]);
      reassurance();
      break;
  }

  if (p.runnerUp) {
    // Jev was split between two jobs: serve the likelier, leave a door open to the other.
    section("runner_up", [
      { id: "runner_up", component: "Row", children: ["runner_up_button"], justify: "start" },
      {
        id: "runner_up_button",
        component: "Button",
        child: "runner_up_label",
        variant: "borderless",
        action: { event: { name: "switchJob", context: { stage: p.runnerUp } } },
      },
      { id: "runner_up_label", component: "Text", text: RUNNER_UP_LABEL[p.runnerUp] },
    ]);
  }

  // Small, focused jobs get a card; reading and browsing get the page.
  const card = pattern === "confirm" || pattern === "form" || (pattern === "answer" && p.attention < 1.5);
  const main = { component: "Column", children: sections };
  return card
    ? [{ id: "root", component: "Card", child: "main" }, { id: "main", ...main }, ...components]
    : [{ id: "root", ...main }, ...components];
}
