import { askJev } from "../server/models.js";
import { validateAnswers } from "../server/ia/decisions.js";
import { mapChanges, validateMap, type AppMap, type Finding } from "../server/ia/graph.js";
import { LEGACY_CONTENT_CANDIDATES as WHOLE_CANDIDATES } from "../server/ia/whole.js";
import { proposeApp, concreteJourneys, journeyQuestions, reviewProposal, repairProposal, type ProposalReview, proposalScopeQuestions, scopeExclusions } from "../server/ia/proposal.js";
import type { recordIA } from "./ia-recording.js";

/** Construct one complete design, then change it only in response to concrete journey critiques. */
export async function proposedApp(trace: Awaited<ReturnType<typeof recordIA>>, base: AppMap) {
  const { run } = trace;
  run.refinementStrategy = "construct-and-critique";
  run.candidates.push(...WHOLE_CANDIDATES);
  const protectedIDs = new Set(base.nodes.map((n) => n.id));
  const assumption = "This is one possible app. Code chooses concrete routes and local actions within a finite role vocabulary. Alternative designs and low probabilities do not create unresolved links.";
  run.phase = "Choose one app scope";
  const scopeQuestions = proposalScopeQuestions();
  run.calls.decisions++;
  await trace.event(run.phase, "request", { state: { seed: run.seed }, questions: scopeQuestions });
  const scope = await askJev({ seed: run.seed }, scopeQuestions, run.endpoint);
  run.calls.ms += scope.ms; run.calls.inputTokens += scope.inputTokens;
  validateAnswers(scope.answers, scopeQuestions);
  await trace.event(run.phase, "answer", scope);
  let excluded = scopeExclusions(scope.answers);
  const scoped = repairProposal(proposeApp(base), { journeys: [], repairs: [], findings: [] }, excluded, protectedIDs);
  let map = scoped.map;
  const scopeReceipts = Object.entries(scope.answers).map(([id, a]) => `${id}: ${a.choice} (${Math.round(a.probabilities[a.choice] * 100)}%); applied as a design choice without a confidence veto.`);
  console.log(`Scope: ${9 - excluded.size} tasks selected, ${Math.round(scope.ms)} ms; every selected task has a concrete route.`);
  let review: ProposalReview | undefined;
  run.revisions.push({ number: run.revisions.length, label: "Complete proposed app", map, changes: mapChanges(base, map), structural: validateMap(map, run.seed),
    critique: { answers: scope.answers, questions: scopeQuestions, findings: [], ms: scope.ms },
    proposal: { state: "draft", journeys: concreteJourneys(map, excluded), excluded: [...excluded], receipts: [assumption, ...scopeReceipts], reviewFindings: [] } });
  await trace.event("Construct complete app", "answer", { method: "Code-authored complete design; no edge confidence thresholds.", assumption, map });
  for (let round = 1; round <= 3; round++) {
    if (validateMap(map, run.seed).length) break;
    const journeys = concreteJourneys(map, excluded), questions = journeyQuestions(map, journeys, [...excluded]);
    const state = { seed: run.seed, proposed_map: map, journeys, excluded_tasks: [...excluded], design_assumption: assumption };
    run.phase = `Critique concrete journeys ${round}`; run.calls.decisions++;
    await trace.event(run.phase, "request", { state, questions });
    const result = await askJev(state, questions, run.endpoint);
    run.calls.ms += result.ms; run.calls.inputTokens += result.inputTokens;
    validateAnswers(result.answers, questions);
    await trace.event(run.phase, "answer", result);
    review = reviewProposal(map, journeys, result.answers, run.seed);
    run.revisions.push({ number: run.revisions.length, label: run.phase, map, changes: [], structural: validateMap(map, run.seed),
      critique: { answers: result.answers, questions, findings: [], ms: result.ms },
      proposal: { state: "review", journeys: review.journeys, excluded: [...excluded], receipts: [], reviewFindings: review.findings, coverage: review.coverage } });
    await trace.save();
    console.log(`Journey critique ${round}: ${journeys.length} concrete journeys, ${Math.round(result.ms)} ms, ${review.repairs.length} revisions requested, ${review.findings.length} review findings.`);
    if (!review.repairs.length) break;
    if (round === 3) {
      const pending: Finding[] = review.repairs.map((r) => ({ id: `repair:${r.question}`, severity: "uncertain", detail: `Critique requested ${r.kind}; revision budget reached. The request remains visible rather than applying an unreviewed change.` }));
      review.findings.push(...pending);
      run.revisions.at(-1)!.proposal!.reviewFindings = [...review.findings];
      break;
    }
    const repaired = repairProposal(map, review, excluded, protectedIDs);
    const changes = mapChanges(map, repaired.map);
    if (!changes.length && JSON.stringify([...excluded]) === JSON.stringify([...repaired.excluded])) break;
    map = repaired.map; excluded = repaired.excluded;
    run.revisions.push({ number: run.revisions.length, label: `Apply journey revisions ${round}`, map, changes, structural: validateMap(map, run.seed),
      proposal: { state: "revision", journeys: concreteJourneys(map, excluded), excluded: [...excluded], receipts: repaired.receipts, reviewFindings: [] } });
    await trace.event(run.phase, "answer", { applied: repaired.receipts, changes, recheck: "The next critique will inspect these revised paths and coverage." });
  }
  const findings = validateMap(map, run.seed);
  run.proposalSummary = { resolved: !findings.length, reviewed: !!review && !review.findings.length && !review.repairs.length,
    remainingReviewFindings: review?.findings ?? [], excludedTasks: [...excluded] };
  await trace.save();
  return { map, findings, stopReason: findings.length
    ? "The proposal failed structural checks; its defects remain explicit."
    : run.proposalSummary.reviewed ? "One fully resolved proposed IA. Concrete journeys and app-wide coverage passed the recorded critique; alternative designs remain possible."
    : "One structurally resolved proposed IA. Semantic review notes remain separate from executable routes; this is not a claim of complete or ideal product coverage." };
}
