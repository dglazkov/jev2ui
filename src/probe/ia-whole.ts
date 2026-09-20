import type { Questions } from "@typesafe-ai/sdk";
import { askJev } from "../server/models.js";
import { validateAnswers, type Answers } from "../server/ia/decisions.js";
import { mapChanges, validateMap, type AppMap, type Finding } from "../server/ia/graph.js";
import { LEGACY_CONTENT_CANDIDATES as WHOLE_CANDIDATES, expansionDraft, scopeQuestions, prune, connectionQuestions, connect, coverageQuestion, supportedChoice, type LinkDecision } from "../server/ia/whole.js";
import { linkEvidence, consequenceQuestions, applyConsequences, recheckOptional, consequenceFindings, mapIssues } from "../server/ia/consequences.js";
import type { recordIA } from "./ia-recording.js";

export async function wholeApp(trace: Awaited<ReturnType<typeof recordIA>>, base: AppMap) {
  const { run } = trace;
  run.connectionStrategy = "independent-links";
  run.refinementStrategy = "task-consequences";
  let links: LinkDecision[] = [];
  let map = expansionDraft(base), findings: Finding[] = [];
  run.candidates.push(...WHOLE_CANDIDATES);
  run.revisions.push({ number: run.revisions.length, label: "Expand responsibility vocabulary", map, changes: mapChanges(base, map), structural: validateMap(map, run.seed) });
  await trace.event("Expand whole-app hypothesis", "answer", { candidates: WHOLE_CANDIDATES, method: "Finite domain-neutral roles constructed by code. They are hypotheses, not requirements. No later saved screens enter planning." });
  async function decide(stage: string, questions: Questions, state: unknown) {
    run.phase = stage; run.calls.decisions++;
    await trace.event(stage, "request", { state, questions });
    const result = await askJev(state, questions, run.endpoint);
    run.calls.ms += result.ms; run.calls.inputTokens += result.inputTokens;
    await trace.event(stage, "answer", result); validateAnswers(result.answers, questions);
    console.log(`${stage}: ${Object.keys(questions).length} questions, ${Math.round(result.ms)} ms`);
    return { answers: result.answers as Answers, questions, findings: [] as Finding[], ms: result.ms };
  }
  const state = (conflicts: Finding[] = []) => ({ seed: run.seed, proposed_map: map, conflicts });
  async function revision(label: string, before: AppMap, critique: Awaited<ReturnType<typeof decide>>, aliases?: Record<string, string>) {
    const checked = [...findings, ...validateMap(map, run.seed)];
    run.revisions.push({ issues: mapIssues(map, checked, links), number: run.revisions.length, label, map, links: structuredClone(links), changes: mapChanges(before, map), structural: checked, critique,
      ...(aliases ? { assembly: { aliases, pending: findings.map((f) => f.id), decisions: Object.entries(critique.answers).map(([id, a]) => ({ id, choice: a.choice, p: a.probabilities[a.choice], effect: supportedChoice(a) ? a.choice === "keep" ? "Retain distinct destination" : a.choice === "omit" ? "Prune optional responsibility" : `Reuse canonical destination ${a.choice}` : "Unresolved; no confident change" })) } } : {}) });
    await trace.save();
  }
  // One targeted retry per expansion stage. Each graph is rebuilt from the stage input, not accumulated.
  const draft = map, scope = scopeQuestions(draft, WHOLE_CANDIDATES.map((c) => c.id));
  let scopeAnswers: Answers = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    const asked = attempt ? Object.fromEntries(findings.map((f) => [f.id, scope[f.id]]).filter(([, q]) => q)) : scope;
    if (!Object.keys(asked).length) break;
    const result = await decide(attempt ? "Resolve scope disagreements" : "Prune whole-app responsibilities", asked, state(findings));
    scopeAnswers = { ...scopeAnswers, ...result.answers };
    const next = prune(draft, scopeAnswers, WHOLE_CANDIDATES.map((c) => c.id));
    const before = map; map = next.map; findings = next.findings;
    await revision(run.phase, before, result, next.aliases);
    if (!findings.length) break;
  }
  const scopeFindings = findings;
  const ids = map.nodes.filter((n) => n.id.startsWith("w_")).map((n) => n.id);
  const unconnected = map, connections = connectionQuestions(map, ids);
  let connectionAnswers: Answers = {}; let connectionFindings: Finding[] = [];
  if (ids.length) {
    const result = await decide("Expand core journeys", connections, state());
    connectionAnswers = result.answers;
    const next = connect(unconnected, ids, connectionAnswers);
    const before = map; map = next.map; connectionFindings = next.findings; links = next.links;
    findings = [...scopeFindings, ...connectionFindings];
    await revision(run.phase, before, result);

    // Use concrete task consequences rather than repeat the abstract inclusion questions.
    const evidence = linkEvidence(map, links, scopeFindings);
    const localQuestions = Object.fromEntries(connectionFindings.filter((f) => f.id.startsWith("local_")).map((f) => [f.id, connections[f.id]]));
    const questions = { ...consequenceQuestions(map, evidence), ...localQuestions };
    if (Object.keys(questions).length) {
      const result = await decide("Firm up links by task consequence", questions, { ...state(findings), link_evidence: evidence, link_decisions: links });
      connectionAnswers = { ...connectionAnswers, ...Object.fromEntries(Object.entries(result.answers).filter(([key]) => key.startsWith("local_"))) };
      const rebuilt = connect(unconnected, ids, connectionAnswers);
      const next = applyConsequences(rebuilt.map, rebuilt.links, evidence, result.answers);
      const before = map; map = next.map; links = next.links;
      connectionFindings = [...rebuilt.findings.filter((f) => f.id.startsWith("local_")), ...next.findings];
      findings = [...scopeFindings, ...connectionFindings];
      await revision(run.phase, before, result);
    }
  }
  // Review after seeing all links. Only synthetic responsibilities can be pruned or merged here.
  if (!findings.length && ids.length) {
    const result = await decide("Critique and prune connected app", scopeQuestions(map, ids), state());
    const before = map, next = prune(map, result.answers, ids);
    map = next.map;
    links = recheckOptional(map, links.map((l) => ({ ...l, from: next.aliases[l.from], to: next.aliases[l.to] })).filter((l) => l.from !== l.to));
    findings = [...next.findings, ...consequenceFindings(links)];
    await revision(run.phase, before, result, next.aliases);
  }
  // Coverage is assessed on the final graph AFTER pruning, never on a now-obsolete draft.
  const audit = await decide("Audit whole-app coverage", coverageQuestion(), state(findings));
  if (supportedChoice(audit.answers.coverage) !== "adequate") findings.push({ id: "coverage", severity: "uncertain", detail: `Whole-app coverage is not established: ${audit.answers.coverage.choice}. The finite vocabulary or links need revision; closure alone is insufficient.`, p: audit.answers.coverage.probabilities[audit.answers.coverage.choice] });
  await revision(run.phase, map, audit);
  return { map, findings: [...findings, ...validateMap(map, run.seed)] };
}
