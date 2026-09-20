import { askJev } from "../server/models.js";
import { validateAnswers, type Answers } from "../server/ia/decisions.js";
import { mapChanges, validateMap, type AppMap, type Finding } from "../server/ia/graph.js";
import { WHOLE_CANDIDATES } from "../server/ia/roles.js";
import { neutralQuestions, constructNeutral, neutralJourneys, neutralCritiqueQuestions, reviewNeutral } from "../server/ia/neutral.js";
import type { recordIA } from "./ia-recording.js";

export async function proposedApp(trace: Awaited<ReturnType<typeof recordIA>>, base: AppMap) {
  const { run } = trace;
  run.refinementStrategy = "construct-and-critique"; run.vocabulary = "responsibilities-v4";
  run.candidates.push(...WHOLE_CANDIDATES);
  const questions = neutralQuestions(); run.phase = "Choose responsibilities and workflow"; run.calls.decisions++;
  await trace.event(run.phase, "request", { state: { seed: run.seed }, questions });
  const result = await askJev({ seed: run.seed }, questions, run.endpoint);
  run.calls.ms += result.ms; run.calls.inputTokens += result.inputTokens;
  validateAnswers(result.answers, questions); await trace.event(run.phase, "answer", result);
  let answers: Answers = result.answers, plan = constructNeutral(base, run.seed, answers, !!run.sample);
  let excluded: string[] = [], review: ReturnType<typeof reviewNeutral> | undefined;
  run.revisions.push({ number: run.revisions.length, label: "Complete app from neutral responsibilities", map: plan.map, changes: mapChanges(base, plan.map), structural: validateMap(plan.map, run.seed),
    critique: { answers: result.answers, questions, findings: [], ms: result.ms },
    assembly: { aliases: plan.aliases, pending: [], decisions: Object.entries(result.answers).map(([id, a]) => ({ id, choice: a.choice, p: a.probabilities[a.choice], effect: "Concrete design choice; no probability veto." })) },
    proposal: { state: "draft", journeys: neutralJourneys(plan), excluded, receipts: plan.receipts, reviewFindings: [] } });
  await trace.save();
  for (let round = 1; round <= 3; round++) {
    if (validateMap(plan.map, run.seed).length) break;
    const journeys = neutralJourneys(plan), qs = neutralCritiqueQuestions(journeys);
    const state = { seed: run.seed, proposed_map: plan.map, chosen_roles: plan.roles, first_role_aliases: plan.aliases, workflow: plan.pattern, journeys };
    run.phase = `Critique neutral journeys ${round}`; run.calls.decisions++;
    await trace.event(run.phase, "request", { state, questions: qs });
    const result = await askJev(state, qs, run.endpoint); run.calls.ms += result.ms; run.calls.inputTokens += result.inputTokens;
    validateAnswers(result.answers, qs); await trace.event(run.phase, "answer", result);
    review = reviewNeutral(plan, result.answers, run.seed);
    run.revisions.push({ number: run.revisions.length, label: run.phase, map: plan.map, changes: [], structural: validateMap(plan.map, run.seed), critique: { answers: result.answers, questions: qs, findings: [], ms: result.ms },
      proposal: { state: "review", journeys: review.journeys, excluded: [...excluded], receipts: [], reviewFindings: review.findings, coverage: review.coverage } });
    await trace.save();
    if (!review.prune.length) break;
    if (round === 3) { review.findings.push(...review.prune.map((id): Finding => ({ id: `prune:${id}`, severity: "uncertain", detail: `Critique requested removal of ${id}; revision budget reached.` }))); break; }
    const revised = { ...answers };
    for (const id of review.prune) revised[`use_${id}`] = { choice: "omit", probabilities: { omit: 1 } };
    const next = constructNeutral(base, run.seed, revised, !!run.sample);
    const changes = mapChanges(plan.map, next.map);
    if (!changes.length) { review.findings.push({ id: "scope-conflict", severity: "uncertain", detail: "A scope-removal judgment conflicts with the selected workflow's required responsibilities; the requested change was not silently applied." }); break; }
    excluded = [...new Set([...excluded, ...review.prune])]; answers = revised; plan = next;
    run.revisions.push({ number: run.revisions.length, label: `Prune responsibilities ${round}`, map: plan.map, changes, structural: validateMap(plan.map, run.seed), proposal: { state: "revision", journeys: neutralJourneys(plan), excluded: [...excluded], receipts: changes, reviewFindings: [] } });
    await trace.save();
  }
  const findings = validateMap(plan.map, run.seed);
  run.proposalSummary = { resolved: !findings.length, reviewed: !!review && !review.findings.length && !review.prune.length, remainingReviewFindings: review?.findings ?? [], excludedTasks: excluded };
  await trace.save();
  return { map: plan.map, findings, stopReason: findings.length ? "Structural defects remain explicit." : run.proposalSummary.reviewed ? "One resolved IA using task responsibilities; the recorded bounded-task critique passed." : "One structurally resolved IA using task responsibilities; semantic review notes remain visible." };
}
