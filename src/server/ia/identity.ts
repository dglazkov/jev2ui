// Destination identity decisions shared by live navigation and the probe. No screen generation or application behavior.
import { choice, type Questions } from "@typesafe-ai/sdk";
import type { JevResult } from "../models.js";
import { destinationIntent } from "../mock/link.js";

import type { DestinationEvidence, KnownDestination, IdentityResult } from "../../shared/identity.js";
export type { DestinationEvidence, KnownDestination, IdentityResult } from "../../shared/identity.js";
export interface IdentityInput { app: string; requested: DestinationEvidence; catalog: KnownDestination[] }
export type IdentityStrategy = "select" | "pairs";
export type AskIdentity = (state: unknown, questions: Questions) => Promise<JevResult>;

const context = `Resolve the identity of a destination in a generated app prototype. We only generate and reuse screen mocks; do not implement application behavior or plan the whole app.
Would opening an established destination satisfy the requested link with the SAME subject, scope and task? Similar layout, related purpose or matching words alone do not establish identity. A settings overview is different from a screen for one of its settings; different settings can each have their own picker. A detail and an editor for the same subject can be distinct destinations.
Different entry points or names can refer to the same destination. The source screen is evidence, not an identity key: app-wide settings may be reached from many screens. Mutable sample values and rendering status do not create new identities. A planned or generating destination is already registered and can be reused.
When supplied, rendered records what the existing mock actually shows: its title, type and subject details. Read it alongside the original request to recognize an established subject. A broad original request does not make every later variant the same subject.
If context cannot distinguish an existing destination from a new one, answer uncertain. Do not infer sameness merely to avoid a duplicate, or novelty merely because the label changed. Existing bindings/aliases supplied in a candidate are settled evidence. Only the supplied brief and evidence establish intent.`;

export function identityRequest(input: IdentityInput, strategy: IdentityStrategy) {
  const questions: Questions = {};
  const candidates = input.catalog.map(({ id, ...candidate }, i) => ({ key: `c${i}`, ...candidate, evidence: { ...candidate.evidence, intent: destinationIntent(candidate.evidence) } }));
  if (strategy === "select") {
    questions.destination = choice({ context, question: "Which registered destination, if any, is the destination requested by this link? Choose new only when it is distinct from every candidate; uncertain when the evidence is insufficient." }, {
      ...Object.fromEntries(candidates.map((candidate) => [candidate.key, JSON.stringify(candidate)])),
      new: "A distinct destination not yet in this catalog.", uncertain: "Insufficient or conflicting evidence to determine identity.",
    });
  } else {
    for (const candidate of candidates) questions[candidate.key] = choice({ context, question: `Does the requested link refer to THIS candidate destination? Candidate: ${JSON.stringify(candidate)}` }, {
      same: "Same destination: subject, scope and task agree, despite possible different names or entry points.",
      different: "Distinct destination: a different subject, scope or task.",
      uncertain: "Insufficient or conflicting evidence to decide sameness versus difference.",
    });
  }
  // Gold answers, case IDs, real destination IDs, provenance and sibling questions are not state.
  return { state: { app: input.app, requested: input.requested }, questions };
}

export function readIdentity(input: IdentityInput, strategy: IdentityStrategy, answers: JevResult["answers"]): IdentityResult {
  const request = identityRequest(input, strategy);
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = answers[id];
    if (question.type !== "choice" || !answer || !(answer.choice in question.criteria) || !Number.isFinite(answer.probabilities?.[answer.choice])) throw new Error(`Invalid identity answer: ${id}`);
  }
  if (strategy === "select") {
    const selected = answers.destination.choice;
    if (selected === "new" || selected === "uncertain") return { kind: selected };
    return { kind: "existing", destination: input.catalog[Number(selected.slice(1))].id };
  }
  const same = input.catalog.filter((_, i) => answers[`c${i}`].choice === "same");
  // Never break conflicting matches by array order or assume uncertainty means novelty.
  if (same.length > 1 || input.catalog.some((_, i) => answers[`c${i}`].choice === "uncertain")) return { kind: "uncertain" };
  return same.length ? { kind: "existing", destination: same[0].id } : { kind: "new" };
}

export async function resolveIdentity(input: IdentityInput, strategy: IdentityStrategy, ask: AskIdentity) {
  if (!input.catalog.length) return { result: { kind: "new" } as IdentityResult, ms: 0, inputTokens: 0, request: identityRequest(input, strategy), answers: {}, calls: 0 };
  const request = identityRequest(input, strategy);
  const response = await ask(request.state, request.questions);
  return { result: readIdentity(input, strategy, response.answers), ms: response.ms, inputTokens: response.inputTokens, request, answers: response.answers, calls: 1 };
}
