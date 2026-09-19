// The job profile: what Jev can tell about the person behind a request.
//
// Every question is about the person and their situation, never about the
// screen. Choice options are first-person job statements, so matching a
// request to one is a single semantic hop. Wording here was tuned with
// `npm run probe:jtbd`; see docs/jtbd-probe.md before changing it.

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { ICON_NAMES } from "./plan.js";
import type { Decision } from "../shared/events.js";

const CONTEXT = "A person sent user_request to an assistant. Judge the person's situation, not the wording.";
const ask = (question: string) => ({ context: CONTEXT, question });

export const CHOICES = {
  stage: {
    q: "Where is the person in getting what they want?",
    options: {
      // A reworded pair ("I don't know what the options are yet" / "a small number of options to weigh") was
      // tried and was worse: "My car won't start, what do I do?" became exploring.
      exploring: "I don't have a particular thing in mind yet. Show me what is out there.",
      comparing: "I have a few candidates in mind and want to weigh them against each other.",
      deciding: "I am about to say yes or no to one specific thing, and want to be sure first.",
      committing: "I have decided. Let me give the details or the go-ahead and make it happen.",
      doing: "I am in the middle of a hands-on task and need guidance while I do it.",
      checking: "Something already happened or is under way. I want to see how it stands.",
    },
  },
  done: {
    q: "What is true for the person when this goes well?",
    options: {
      know: "I understand something I did not understand before.",
      picked: "I have settled on one option out of several.",
      handed_over: "I have given my details or my go-ahead, and the thing is now in motion.",
      finished_task: "I have completed a hands-on task out in the real world.",
      reassured: "I have stopped worrying about something.",
      // Was "Something now behaves the way I want it to", which a car that won't start also satisfies.
      configured: "A product's settings or preferences are now set the way I like them.",
    },
  },
  // v1 asked "who holds the information that matters", which Jev read literally: my spending is *my* information.
  flow: {
    q: "Once the assistant responds, what will the person mostly be doing?",
    options: {
      system_to_person: "Reading or looking at what the assistant shows me.",
      person_to_system: "Typing, picking or toggling things myself.",
      both: "Reading first, then entering or confirming something.",
    },
  },
  // v1 asked "how many things is the person dealing with": someone shopping for a laptop wants *one* laptop.
  cardinality: {
    q: "How many separate items would the assistant need to show the person?",
    options: {
      one: "A single item: one record, one answer, one thing.",
      few: "Two to five comparable options, side by side.",
      many: "A longer list to browse or narrow down.",
      none: "No items: an explanation, a procedure or a control.",
    },
  },
} as const;

export const SCORES = {
  stakes: {
    q: "How hard would it be for the person to undo what happens next?",
    levels: [
      "Nothing to undo. They are only looking.",
      "Easily undone or changed later.",
      "Costly to undo: money, time or a commitment to others is involved.",
      "Cannot be undone.",
    ],
  },
  attention: {
    q: "How much attention does the person want to spend on the answer?",
    levels: [
      "A glance: one or two numbers or words.",
      "A scan: skim a short list or a few facts.",
      "A read: a few paragraphs.",
      "A study: careful, extended attention.",
    ],
  },
  urgency: {
    q: "How soon does the person need this resolved?",
    levels: ["No time pressure.", "Within a day or so.", "Right now."],
  },
} as const;

export const NOULS = {
  habitual: "Is this something the person has probably done many times before?",
  anx_cost: "Is the person likely worried about how much this will cost?",
  anx_commitment: "Is the person likely worried about being locked into something?",
  anx_loss: "Is the person likely worried about losing something they cannot get back?",
  anx_mistake: "Is the person likely worried about doing it wrong?",
  anx_safety: "Is the person likely worried about their safety, health or security?",
  by_price: "If the person is choosing among options, will price matter to the choice?",
  by_quality: "If the person is choosing among options, will ratings or quality matter to the choice?",
  by_location: "If the person is choosing among options, will distance or location matter to the choice?",
  by_time: "If the person is choosing among options, will date, time or availability matter to the choice?",
  by_looks: "If the person is choosing among options, will appearance matter to the choice?",
} as const;

/**
 * Asked by the renderer but not part of the probe. Of four wordings tried for details_complete, only the one
 * with criteria and examples told "Send $50 to Alex" from "Sign me up for the pottery workshop" (11 of 14
 * labelled requests, against 7 for the bare questions). It is conservative: it wants a form for "Reset my
 * password" and "Book the 7am flight", which is defensible.
 */
const RENDER_NOULS: Record<string, { q: string; criteria?: { true: string; false: string } }> = {
  details_complete: {
    q: "Is the request a complete instruction, with nothing left for the person to fill in?",
    criteria: {
      true: "Complete: what to do and to what is fully specified, e.g. 'Send $50 to Alex', 'Delete my account'.",
      false: "Incomplete: the person would still have to supply things like their name, a date, a choice or a description.",
    },
  },
  visual: { q: "Is the subject something physical that the person would want to see a photo of?" },
};

export type Stage = keyof typeof CHOICES.stage.options;
export type Done = keyof typeof CHOICES.done.options;
export type Flow = keyof typeof CHOICES.flow.options;
export type Cardinality = keyof typeof CHOICES.cardinality.options;
export type Anxiety = "cost" | "commitment" | "loss" | "mistake" | "safety";
export type Criterion = "price" | "quality" | "location" | "time" | "looks";

export function probeQuestions(): Questions {
  const out: Questions = {};
  for (const [key, { q, options }] of Object.entries(CHOICES)) out[key] = choice(ask(q), options);
  for (const [key, { q, levels }] of Object.entries(SCORES)) out[key] = score(ask(q), levels as unknown as [string, string, ...string[]]);
  for (const [key, q] of Object.entries(NOULS)) out[key] = noul(ask(q));
  return out;
}

export function profileQuestions(): Questions {
  const out = probeQuestions();
  for (const [key, { q, criteria }] of Object.entries(RENDER_NOULS)) out[key] = noul(ask(q), criteria);
  out.icon = choice(
    ask("Which icon best represents what the person is asking about?"),
    Object.fromEntries([...ICON_NAMES.map((n) => [n, null]), ["none", "No icon in the set relates to the subject."]]),
  );
  return out;
}

export interface JobProfile {
  stage: Stage;
  /** Second most likely stage, when the top one is not clear-cut. */
  runnerUp: Stage | null;
  done: Done;
  flow: Flow;
  cardinality: Cardinality;
  /** 0 nothing to undo .. 3 cannot be undone */
  stakes: number;
  /** 0 glance .. 3 study */
  attention: number;
  /** 0 no pressure .. 2 right now */
  urgency: number;
  habitual: boolean;
  detailsComplete: boolean;
  visual: boolean;
  /** Strongest worry at or above the threshold, if any. */
  anxiety: Anxiety | null;
  /** Selection criteria at or above the threshold, strongest first. */
  criteria: Criterion[];
  icon: string | null;
}

const YES = 0.6;
const CLEAR_CUT = 0.7;
const RUNNER_UP = 0.2;

export function readProfile(answers: Record<string, any>): { profile: JobProfile; decisions: Decision[] } {
  const decisions: Decision[] = [];
  const pick = <T extends string>(key: string, label: string): T => {
    const a = answers[key];
    decisions.push({ id: key, question: label, answer: a.choice, p: a.probabilities[a.choice] });
    return a.choice as T;
  };
  const rate = (key: keyof typeof SCORES, label: string): number => {
    const a = answers[key];
    const top = SCORES[key].levels.length - 1;
    decisions.push({ id: key, question: label, answer: `${a.score.toFixed(1)} of ${top}`, p: a.score / top });
    return a.score;
  };
  const strongest = <T extends string>(prefix: string, label: string): T[] => {
    const hits = Object.keys(NOULS)
      .filter((k) => k.startsWith(prefix) && answers[k].noul >= YES)
      .sort((x, y) => answers[y].noul - answers[x].noul);
    for (const k of hits) decisions.push({ id: k, question: label, answer: k.slice(prefix.length), p: answers[k].noul });
    return hits.map((k) => k.slice(prefix.length) as T);
  };
  const yes = (key: string, label: string): boolean => {
    decisions.push({ id: key, question: label, answer: answers[key].noul >= 0.5 ? "yes" : "no", p: answers[key].noul });
    return answers[key].noul >= 0.5;
  };

  const stage = pick<Stage>("stage", "where they are");
  const stageRanking = Object.entries(answers.stage.probabilities as Record<Stage, number>).sort((a, b) => b[1] - a[1]);
  const [second, secondP] = stageRanking[1];
  const runnerUp = stageRanking[0][1] < CLEAR_CUT && secondP >= RUNNER_UP ? (second as Stage) : null;
  if (runnerUp) decisions.push({ id: "runner_up", question: "…or possibly", answer: runnerUp, p: secondP });

  const profile: JobProfile = {
    stage,
    runnerUp,
    done: pick<Done>("done", "done means"),
    flow: pick<Flow>("flow", "they will mostly be"),
    cardinality: pick<Cardinality>("cardinality", "items to show"),
    stakes: rate("stakes", "hard to undo"),
    attention: rate("attention", "attention to spend"),
    urgency: rate("urgency", "urgency"),
    habitual: yes("habitual", "done this before?"),
    detailsComplete: yes("details_complete", "gave every detail?"),
    visual: yes("visual", "worth a photo?"),
    anxiety: strongest<Anxiety>("anx_", "worried about")[0] ?? null,
    // Asked of every request; only meaningful when a choice is being made, so patterns read it selectively.
    criteria: strongest<Criterion>("by_", "will choose on"),
    icon: null,
  };
  const icon = pick<string>("icon", "icon");
  profile.icon = icon === "none" ? null : icon;
  return { profile, decisions };
}
