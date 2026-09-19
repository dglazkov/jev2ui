// Stage 3 of the hybrid pipeline: decisions that need the generated content.
// Again one Jev request; per-field questions fan out in parallel.

import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import { ranked } from "./models.js";
import { WIDGETS, widgetFits, type FieldContent, type FieldDesign, type FinalDesign, type Widget } from "./emit.js";
import type { Decision } from "../shared/events.js";

const WIDGET_CRITERIA: Record<Widget, string> = {
  shortText: "A single line of free text: names, emails, phone numbers, addresses, titles.",
  longText: "Several lines of free text: messages, comments, descriptions, notes.",
  number: "A typed number with no natural upper bound: quantity, age, amount.",
  obscured: "A secret that must be hidden while typing: password, PIN, security code.",
  date: "A calendar date without a time of day.",
  time: "A time of day without a date.",
  dateTime: "A specific date together with a time, such as an appointment.",
  checkbox: "A single yes/no toggle: consent, opt-in, agreement, enabling or disabling a setting. Also when the only options are on/off or yes/no.",
  singleChoice: "Exactly one pick from the field's listed options.",
  multiChoice: "Any number of picks from the field's listed options.",
  slider: "A number dragged within the field's min and max, where precision matters little: rating, volume, budget, intensity.",
};

const NO_PRIMARY = "none";

export function designQuestions(fields: FieldContent[], actions: Array<{ label: string }>): Questions {
  const questions: Questions = {};
  fields.forEach((field, i) => {
    const about = { form_field: `form_fields[${i}]`, label: field.label };
    questions[`f${i}_widget`] = choice(
      { ...about, question: "Which input control suits this form field best?" },
      WIDGET_CRITERIA,
    );
    questions[`f${i}_required`] = noul({
      ...about,
      question: "Must the user fill in this field for the form to make sense?",
    });
    questions[`f${i}_email`] = noul({ ...about, question: "Does this field hold an email address?" });
  });
  if (actions.length > 1) {
    questions.primary_action = choice(
      { question: "Which of the actions is the main thing the user came to this screen to do?" },
      Object.fromEntries([
        ...actions.map((a, i) => [`action_${i}`, `The button labelled "${a.label}".`]),
        [NO_PRIMARY, "No action stands out; they are all equally secondary."],
      ]),
    );
  }
  return questions;
}

export function readDesign(
  answers: Record<string, any>,
  fields: FieldContent[],
  actions: Array<{ label: string }>,
): { design: FinalDesign; decisions: Decision[] } {
  const decisions: Decision[] = [];

  const fieldDesigns: FieldDesign[] = fields.map((field, i) => {
    // Constraint-aware argmax: walk Jev's ranking until a widget the content can back.
    const ranking = ranked(answers[`f${i}_widget`]);
    const [widget, p] = ranking.find(([w]) => widgetFits(w as Widget, field)) ?? ["shortText", 0];
    const [top] = ranking[0];
    decisions.push({
      id: `f${i}_widget`,
      question: `control for "${field.label}"`,
      answer: widget,
      p,
      ...(widget !== top ? { note: `top pick "${top}" is not backed by the content` } : {}),
    });
    const required = answers[`f${i}_required`].noul >= 0.6;
    const email = answers[`f${i}_email`].noul >= 0.7 && widget === "shortText";
    if (required) decisions.push({ id: `f${i}_required`, question: `"${field.label}" required?`, answer: "yes", p: answers[`f${i}_required`].noul });
    if (email) decisions.push({ id: `f${i}_email`, question: `"${field.label}" is an email?`, answer: "yes", p: answers[`f${i}_email`].noul });
    return { widget: (WIDGETS as readonly string[]).includes(widget) ? (widget as Widget) : "shortText", required, email };
  });

  let primaryAction = actions.length === 1 ? 0 : -1;
  if (answers.primary_action) {
    const picked: string = answers.primary_action.choice;
    primaryAction = picked === NO_PRIMARY ? -1 : Number(picked.replace("action_", ""));
    decisions.push({
      id: "primary_action",
      question: "primary button",
      answer: primaryAction >= 0 ? actions[primaryAction].label : "none",
      p: answers.primary_action.probabilities[picked],
    });
  }
  return { design: { fields: fieldDesigns, primaryAction }, decisions };
}
