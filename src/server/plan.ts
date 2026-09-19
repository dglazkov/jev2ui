// Stage 1 of the hybrid pipeline: everything Jev can decide from the prompt
// alone. One request, all questions in parallel. The answers pick which
// sections the surface has, which in turn determines the JSON schema Gemini
// is asked to fill.

import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import { IconApi } from "@a2ui/web_core/v0_9/basic_catalog";
import { choiceDecision, noulDecision } from "./models.js";
import type { Decision } from "../shared/events.js";

export const ICON_NAMES: string[] = (IconApi.schema.shape.name as any)._def.options[0].options;

export const SECTIONS = ["prose", "media", "facts", "steps", "collection", "form", "actions"] as const;
export type Section = (typeof SECTIONS)[number];

const CONTEXT = "One UI screen is being designed to respond to user_request. Judge what that screen should contain.";
const ask = (question: string) => ({ context: CONTEXT, question });

const SECTION_QUESTIONS: Record<Section, { q: string; yes: string; no: string }> = {
  prose: {
    q: "Should the screen contain a paragraph or more of explanatory text?",
    yes: "The request is for an explanation, article, summary, description or message that needs sentences of text.",
    no: "A title and short labels are enough; no body text is needed.",
  },
  media: {
    q: "Should the screen feature one large picture at the top?",
    yes: "The subject is visual (a place, a dish, a product, a person, an artwork) and a big photo would help.",
    no: "The screen is functional or textual; a large photo would be decoration.",
  },
  facts: {
    q: "Should the screen show a group of key facts, stats, metrics or label-value attributes?",
    yes: "There are several short data points (numbers, dates, prices, specs, statuses) worth showing at a glance.",
    no: "There are no discrete data points to highlight.",
  },
  steps: {
    q: "Should the screen show an ordered sequence of steps or instructions?",
    yes: "The request is a how-to, recipe, procedure, itinerary or plan where order matters.",
    no: "Nothing on the screen needs to be followed in order.",
  },
  collection: {
    q: "Should the screen show a list of several similar items?",
    yes: "The request is for results, options, products, recommendations, records or any set of comparable things.",
    no: "The screen is about one thing, not a set of similar things.",
  },
  form: {
    q: "Should the screen contain input controls that the user fills in or adjusts?",
    yes: "The request is for a form, survey, settings, booking, signup, filter, calculator input or any data entry.",
    no: "The user only reads or clicks buttons; nothing is typed, picked or toggled.",
  },
  actions: {
    q: "Should the screen offer action buttons other than submitting a form?",
    yes: "The user is expected to confirm, cancel, accept, decline, buy, open, share or take some next step.",
    no: "The screen is purely informational, or its only action is submitting its form.",
  },
};

/**
 * Section questions are answered independently, so on their own they
 * over-include: every section is a little bit plausible for every request.
 * The screen's purpose tells code which sections are expected (kept at even
 * odds) and which are extras (kept only when Jev is confident).
 */
const PURPOSES: Record<string, { criteria: string; expects: Section[] }> = {
  inform: { criteria: "Read about a topic, person, place or thing.", expects: ["prose", "media", "facts"] },
  browse: { criteria: "Look through several options or results and maybe pick one.", expects: ["collection"] },
  input: { criteria: "Enter data or change settings.", expects: ["form"] },
  decide: { criteria: "Confirm, approve or reject one specific thing.", expects: ["prose", "actions"] },
  howto: { criteria: "Follow instructions to get something done.", expects: ["steps", "prose"] },
  monitor: { criteria: "Check numbers, status or progress at a glance.", expects: ["facts"] },
};
const EXPECTED_THRESHOLD = 0.5;
const EXTRA_THRESHOLD = 0.8;

export interface Plan {
  purpose: string;
  sections: Section[];
  icon: string | null;
  card: boolean;
  factsLayout: "tiles" | "rows";
  collectionDirection: "vertical" | "horizontal";
  collectionImages: boolean;
  collectionItemAction: boolean;
}

export function planQuestions(): Questions {
  const questions: Questions = {};
  for (const section of SECTIONS) {
    const { q, yes, no } = SECTION_QUESTIONS[section];
    questions[`has_${section}`] = noul(ask(q), { true: yes, false: no });
  }
  questions.purpose = choice(
    ask("What is the user mainly going to do on this screen?"),
    Object.fromEntries(Object.entries(PURPOSES).map(([k, v]) => [k, v.criteria])),
  );
  questions.icon = choice(
    ask("Which icon best represents the subject of the screen?"),
    Object.fromEntries([...ICON_NAMES.map((n) => [n, null]), ["none", "No icon in the set relates to the subject."]]),
  );
  questions.card = noul(ask("Is this a small self-contained widget, such as a dialog, a card or a short form?"), {
    true: "Compact: fits in a single card.",
    false: "A full page with a lot of content.",
  });
  questions.facts_layout = choice(ask("If the screen shows key facts, how should they be laid out?"), {
    tiles: "A row of big-number tiles: there are only a few facts and they are numeric or glanceable, like a dashboard.",
    rows: "A table of label-value rows: there are many facts, or the values are words rather than numbers, like a spec sheet.",
  });
  questions.collection_direction = choice(ask("If the screen shows a list of items, which way should it scroll?"), {
    vertical: "Top to bottom: items carry text that needs width to read, like search results or records.",
    horizontal: "Side-scrolling carousel: items are visual and browsed casually, like photos, movies or products.",
  });
  questions.collection_images = noul(ask("If the screen shows a list of items, should every item have its own picture?"), {
    true: "Items are physical or visual things people choose partly by look.",
    false: "Items are abstract, textual or data records.",
  });
  questions.collection_item_action = noul(
    ask("If the screen shows a list of items, should every item have its own button?"),
    {
      true: "The user is expected to pick, book, buy, open or otherwise act on one individual item.",
      false: "The list is only for reading.",
    },
  );
  return questions;
}

export function readPlan(answers: Record<string, any>): { plan: Plan; decisions: Decision[] } {
  const decisions: Decision[] = [];
  const yes = (id: string, label: string) => {
    decisions.push(noulDecision(id, label, answers[id]));
    return answers[id].noul >= 0.5;
  };
  const pick = (id: string, label: string) => {
    decisions.push(choiceDecision(id, label, answers[id]));
    return answers[id].choice as string;
  };

  const purpose = pick("purpose", "screen purpose");
  const sections = SECTIONS.filter((section) => {
    const p: number = answers[`has_${section}`].noul;
    const expected = PURPOSES[purpose].expects.includes(section);
    const keep = p >= (expected ? EXPECTED_THRESHOLD : EXTRA_THRESHOLD);
    decisions.push({
      id: `has_${section}`,
      question: `${section} section?`,
      answer: keep ? "yes" : "no",
      p,
      ...(!keep && p >= EXPECTED_THRESHOLD ? { note: `extra for "${purpose}"; needs ${EXTRA_THRESHOLD}` } : {}),
    });
    return keep;
  });
  const icon = pick("icon", "header icon");
  const card = yes("card", "wrap in a card?");
  const has = (s: Section) => sections.includes(s);
  // Conditional decisions were asked speculatively; only read the relevant ones.
  const plan: Plan = {
    purpose,
    sections,
    icon: icon === "none" ? null : icon,
    card,
    factsLayout: has("facts") ? (pick("facts_layout", "facts layout") as Plan["factsLayout"]) : "rows",
    collectionDirection: has("collection")
      ? (pick("collection_direction", "list direction") as Plan["collectionDirection"])
      : "vertical",
    collectionImages: has("collection") && yes("collection_images", "pictures on items?"),
    collectionItemAction: has("collection") && yes("collection_item_action", "button on items?"),
  };
  return { plan, decisions };
}

// --- Content schema for Gemini -------------------------------------------

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  propertyOrdering: Object.keys(properties),
});
const list = (items: unknown, description: string, maxItems: number) => ({
  type: "array",
  items,
  description,
  maxItems,
});

const SECTION_SCHEMAS: Record<Section, unknown> = {
  prose: obj({ body: str("Body text. Simple markdown (bold, italics, short bullet lists) is allowed.") }),
  media: obj({ caption: str("One-line caption for the hero picture.") }),
  facts: list(obj({ label: str("Short label."), value: str("Short value, e.g. a number with unit.") }), "Key facts.", 8),
  steps: list(obj({ title: str("Imperative step title."), detail: str("One or two sentences.") }), "Ordered steps.", 10),
  collection: obj({
    heading: str("Heading above the list."),
    itemActionLabel: str("Verb for a per-item button, e.g. 'Book', 'View', 'Add to cart'."),
    items: list(
      obj({
        title: str("Item name."),
        subtitle: str("Secondary line: category, author, location, date..."),
        badge: str("Very short highlight such as a price, rating or status."),
        description: str("One sentence."),
      }),
      "The items.",
      8,
    ),
  }),
  form: obj({
    heading: str("Heading above the form."),
    submitLabel: str("Label of the submit button."),
    fields: list(
      obj(
        {
          label: str("Field label."),
          options: list(str("Option label."), "ONLY for fields where the user picks from three or more known choices. Never for yes/no or on/off fields.", 8),
          min: { type: "number", description: "ONLY for bounded numeric fields." },
          max: { type: "number", description: "ONLY for bounded numeric fields." },
        },
        ["label"],
      ),
      "The input fields.",
      10,
    ),
  }),
  actions: list(obj({ label: str("Button label.") }), "Action buttons, most important first. Never a form submit button.", 3),
};

export function contentSchema(sections: Section[]) {
  return obj({
    header: obj({ title: str("Screen title."), subtitle: str("One short supporting line.") }),
    ...Object.fromEntries(sections.map((s) => [s, SECTION_SCHEMAS[s]])),
  });
}

export const CONTENT_SYSTEM_PROMPT = `You write the content for one UI screen that responds to the user's request.
A separate system decides layout and widgets; you only supply the words and data, as JSON matching the schema.
Be specific and realistic: invent plausible concrete details rather than placeholders. Keep every string short.
Do not describe the UI, do not mention buttons or layout in text, and do not use HTML.`;
