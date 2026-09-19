// Decisions that need generated content. Each is its own small Jev request,
// fired the moment its input exists, so no field waits for the rest of the form.

import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import { ranked } from "./models.js";
import { WIDGETS, widgetFits, type FieldContent, type FieldDesign, type Widget } from "./emit.js";
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

/** State is `{ user_request, form_field }`. */
export function fieldQuestions(): Questions {
  return {
    widget: choice("Which input control suits form_field best?", WIDGET_CRITERIA),
    required: noul("Must the user fill in form_field for the form to make sense?"),
    email: noul("Does form_field hold an email address?"),
  };
}

export function readField(answers: Record<string, any>, field: FieldContent): { design: FieldDesign; decisions: Decision[] } {
  // Constraint-aware argmax: walk Jev's ranking until a widget the content can back.
  const ranking = ranked(answers.widget);
  const [picked, p] = ranking.find(([w]) => widgetFits(w as Widget, field)) ?? ["shortText", 0];
  const widget = (WIDGETS as readonly string[]).includes(picked) ? (picked as Widget) : "shortText";
  const [top] = ranking[0];
  const required = answers.required.noul >= 0.6;
  const email = answers.email.noul >= 0.7 && widget === "shortText";

  const decisions: Decision[] = [
    {
      id: "widget",
      question: "input control",
      answer: widget,
      p,
      ...(widget !== top ? { note: `top pick "${top}" is not backed by the content` } : {}),
    },
  ];
  if (required) decisions.push({ id: "required", question: "required?", answer: "yes", p: answers.required.noul });
  if (email) decisions.push({ id: "email", question: "email check?", answer: "yes", p: answers.email.noul });
  return { design: { widget, required, email }, decisions };
}

/** State is `{ user_request, actions }`. */
export function primaryActionQuestions(actions: Array<{ label: string }>): Questions {
  return {
    primary: choice(
      "Which of the actions is the main thing the user came to this screen to do?",
      Object.fromEntries([
        ...actions.map((a, i) => [`action_${i}`, `The button labelled "${a.label}".`]),
        [NO_PRIMARY, "No action stands out; they are all equally secondary."],
      ]),
    ),
  };
}

/** Index of the primary action, or -1. */
export function readPrimaryAction(
  answers: Record<string, any>,
  actions: Array<{ label: string }>,
): { primary: number; decisions: Decision[] } {
  const picked: string = answers.primary.choice;
  const primary = picked === NO_PRIMARY ? -1 : Number(picked.replace("action_", ""));
  return {
    primary,
    decisions: [
      {
        id: "primary",
        question: "primary button",
        answer: primary >= 0 ? actions[primary].label : "none",
        p: answers.primary.probabilities[picked],
      },
    ],
  };
}
