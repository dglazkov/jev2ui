// Production adapter for the responsibility experiment. Only Choice decisions: no writers, baking or images.
import { choice, type Questions } from "@typesafe-ai/sdk";
import { ARCHITECTURE, type Architecture } from "../../shared/architecture.js";
import { validateAnswers, type Answers } from "./decisions.js";
import { mapChanges, type AppMap, type Seed } from "./graph.js";
import { constructNeutral, neutralCritiqueQuestions, neutralJourneys, neutralQuestions, reviewNeutral, type NeutralPlan } from "./neutral.js";
import { WHOLE_CANDIDATES } from "./roles.js";
import type { JevResult } from "../models.js";

export type AskArchitecture = (stage: string, state: unknown, questions: Questions) => Promise<JevResult>;

/** Same declared prompt anchor as the sweep, using the screen plan already obtained by the pipeline. */
export function plannedSeed(brief: string, plan: { archetype: string; custom?: { use: string } }): Seed {
  const activity = plan.custom ? ({ watch: "Observe live state", pick: "Choose an option", adjust: "Adjust or interact", read: "Inspect information" }[plan.custom.use] ?? "Interact with the subject")
    : ({ feed: "Select an item", dashboard: "Inspect status", detail: "Inspect information", guide: "Follow instructions", settings: "Change preferences", form: "Submit details", checkout: "Commit transaction", result: "Acknowledge result", confirm: "Confirm action" }[plan.archetype] ?? "Interact with the subject");
  return { brief, first: { title: brief.slice(0, 100), archetype: plan.archetype, sections: [{ title: "Proposed primary responsibility", controls: [{ label: activity, control: plan.custom?.use ?? plan.archetype }] }] }, links: [{ id: "primary", label: activity, kind: "in_place" }, { id: "back", label: "Back", kind: "back" }] };
}

export function anchorMap(seed: Seed): AppMap {
  return { boundary: "Prompt-based planning anchor; Home and a return are explicit design assumptions.", home: "home", nodes: [
    { id: "first", label: seed.first.title, purpose: `Requested task: ${seed.brief}`.slice(0, 600), actions: [
      { id: "primary", label: seed.links[0].label, kind: "in_place", target: null, sourceLink: "primary" },
      { id: "back", label: "Back", kind: "back", target: "home", sourceLink: "back" },
    ] },
    { id: "home", label: "Home", purpose: "Entry to this proposed app", actions: [{ id: "open_first", label: seed.first.title, kind: "navigate", target: "first", sourceLink: null }] },
  ] };
}

function build(seed: Seed, answers: Answers, old?: Architecture): NeutralPlan {
  const plan = constructNeutral(anchorMap(seed), seed, answers, true);
  const first = plan.map.nodes.find((n) => n.id === "first")!;
  first.label = WHOLE_CANDIDATES.find((c) => c.id === answers.anchor.choice)?.label ?? "First screen";
  for (const node of plan.map.nodes) for (const action of node.actions) if (action.target === "first" && action.kind !== "back") action.label = first.label;
  // Labels are presentation; a rebuilt plan never renames an established identity by accident.
  if (old) for (const node of plan.map.nodes) node.label = old.map.nodes.find((n) => n.id === node.id)?.label ?? node.label;
  return plan;
}

async function review(ask: AskArchitecture, initial: Architecture, protectedIds: string[], emit: (value: Architecture) => void): Promise<Architecture> {
  const start = performance.now();
  let state = initial;
  try {
    for (let round = 1; round <= 3; round++) {
      const journeys = neutralJourneys(state), questions = neutralCritiqueQuestions(journeys);
      const result = await ask(`Jev: review app journeys ${round}`, { seed: state.seed, proposed_map: state.map, chosen_roles: state.roles, first_role_aliases: state.aliases, workflow: state.pattern, journeys, edits: state.notes }, questions);
      validateAnswers(result.answers, questions);
      const reviewed = reviewNeutral(state, result.answers, state.seed);
      const prune = reviewed.prune.filter((role) => !protectedIds.includes(state.aliases[role]));
      const protectedFindings = reviewed.prune.filter((role) => !prune.includes(role)).map((role) => ({ id: `retained:${role}`, severity: "uncertain" as const, detail: `${state.map.nodes.find((n) => n.id === state.aliases[role])?.label}: review suggested removal; retained because this screen was requested or already made.` }));
      state = { ...state, findings: [...reviewed.findings, ...protectedFindings] };
      if (!prune.length) break;
      if (round === 3) {
        state.findings.push({ id: "review-budget", severity: "uncertain", detail: "Further pruning was suggested; the bounded review budget was reached." });
        break;
      }
      const answers = { ...state.answers };
      for (const role of prune) answers[`use_${role}`] = { choice: "omit", probabilities: { omit: 1 } };
      const next = build(state.seed, answers, state), changes = mapChanges(state.map, next.map);
      if (!changes.length) {
        state.findings.push({ id: "scope-conflict", severity: "uncertain", detail: "Suggested pruning conflicts with responsibilities required by this workflow." });
        break;
      }
      state = { ...state, ...next, answers, receipts: [...state.receipts, ...changes].slice(-100) };
      emit(ARCHITECTURE.parse(state));
    }
  } catch (error) {
    // A critic failure must not destroy a structurally valid map or restart any content writer.
    state = { ...state, findings: [...state.findings, { id: "review-failed", severity: "uncertain", detail: `App-map review could not finish: ${(error as Error).message}`.slice(0, 1600) }] };
  }
  state = ARCHITECTURE.parse({ ...state, status: state.findings.length ? "review" : "ready", ms: Math.round(initial.ms + performance.now() - start) });
  emit(state);
  return state;
}

export async function createArchitecture(seed: Seed, ask: AskArchitecture, emit: (value: Architecture) => void): Promise<Architecture> {
  const start = performance.now(), questions = neutralQuestions();
  const result = await ask("Jev: plan the app", { seed }, questions);
  validateAnswers(result.answers, questions);
  const plan = build(seed, result.answers);
  const state = ARCHITECTURE.parse({ version: 1, revision: 1, seed, ...plan, answers: result.answers, notes: [], status: "reviewing", findings: [], ms: Math.round(performance.now() - start) });
  emit(state);
  return review(ask, state, ["first"], emit);
}

/** Keep is a real option on every settled choice; an edit never re-rolls the whole app. */
export function revisionQuestions(state: Architecture): Questions {
  const questions: Questions = {};
  for (const [id, q] of Object.entries(neutralQuestions())) {
    if (q.type !== "choice") continue;
    const instructions = typeof q.instructions === "string" ? q.instructions : JSON.stringify(q.instructions);
    questions[id] = choice({ context: "Revise an existing closed app map only as the developer's message asks. Current choices, the map, current screen, earlier edits and protected screens are supplied. Preserve every choice the message does not address. 'first' always means the original first screen, never the currently selected screen. A visual or wording change does not change responsibilities. A role may have only one separate destination in this finite vocabulary.", question: `Current ${id}: ${state.answers[id]?.choice}. ${instructions} What must change because of this message?` }, { keep: "Keep the settled answer: this message does not ask to change this choice.", ...q.criteria });
  }
  questions.destination = choice("Which destination does the message explicitly ask to add, open, or move work onto? Choose none for a removal, paint edit, or changes within the existing screen. A requested existing responsibility reuses its canonical identity.", {
    none: "No destination is requested.", first: "The original first screen.", home: "The app's Home screen.",
    ...Object.fromEntries(WHOLE_CANDIDATES.map((c) => [c.id, `${c.label}: ${c.purpose}`])),
  });
  return questions;
}

export async function reviseArchitecture(old: Architecture, message: string, showing: string, protectedIds: string[], ask: AskArchitecture): Promise<{ state: Architecture; destination?: string; changes: string[] }> {
  const start = performance.now(), questions = revisionQuestions(old);
  const result = await ask("Jev: revise the app map", { seed: old.seed, proposed_map: old.map, current_choices: old.answers, current_screen: showing, protected_screens: protectedIds, earlier_edits: old.notes, message }, questions);
  validateAnswers(result.answers, questions);
  const answers = { ...old.answers };
  for (const id of Object.keys(neutralQuestions())) if (result.answers[id].choice !== "keep") answers[id] = result.answers[id];
  const plan = build(old.seed, answers, old);
  const requested = result.answers.destination.choice;
  const destination = requested === "none" ? undefined : plan.aliases[requested] ?? requested;
  if (destination && !plan.map.nodes.some((n) => n.id === destination)) throw new Error("The requested screen is not represented by the revised app map. The previous map was kept.");
  // A critique may prune suggestions, never existing work. An explicit scope edit may remove a role.
  const notes = [...old.notes, { destination: destination ?? showing, message }].slice(-40);
  const initial = ARCHITECTURE.parse({ ...old, ...plan, answers, notes, revision: old.revision + 1, status: "reviewing", findings: [], ms: Math.round(performance.now() - start) });
  const state = await review(ask, initial, [...protectedIds, ...(destination ? [destination] : [])], () => {});
  return { state, destination, changes: mapChanges(old.map, state.map) };
}
