import { choice, type Questions } from "@typesafe-ai/sdk";
import type { Answers, ChoiceAnswer } from "./decisions.js";
import { GRAPH, type AppMap, type Finding } from "./graph.js";
import { supportedChoice, type LinkDecision } from "./whole.js";

export interface LinkEvidence {
  id: string; from: string; to: string;
  alternative: string[] | null;
  newlyReachableFromHome: string[];
  unsettledEndpoints: string[];
}
export interface LinkAssessment {
  evidence: LinkEvidence;
  answer: ChoiceAnswer;
  reason?: string;
  effect: "include_required" | "defer_optional" | "omit_unnecessary" | "review_responsibility" | "unresolved";
}
export interface MapIssue {
  id: string; category: "journey" | "responsibility" | "optional" | "unassessed";
  detail: string; from?: string; to?: string;
}
/** Returns an actual supported route, not a path through candidate/unresolved edges. */
export function supportedPath(map: AppMap, from: string, to: string, exclude?: { from: string; to: string }): string[] | null {
  if (!map.nodes.some((n) => n.id === from) || !map.nodes.some((n) => n.id === to)) return null;
  const queue = [[from]], seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i], at = path.at(-1)!;
    if (at === to) return path;
    for (const action of map.nodes.find((n) => n.id === at)!.actions) {
      if (!["navigate", "back"].includes(action.kind) || !action.target || seen.has(action.target) || (at === exclude?.from && action.target === exclude.to)) continue;
      if (!map.nodes.some((n) => n.id === action.target)) continue;
      seen.add(action.target); queue.push([...path, action.target]);
    }
  }
  return null;
}
export function linkEvidence(map: AppMap, links: LinkDecision[], scopeFindings: Finding[]): LinkEvidence[] {
  return links.filter((l) => l.status === "unresolved").map((link) => {
    const hypothetical = structuredClone(map);
    hypothetical.nodes.find((n) => n.id === link.from)!.actions.push({ id: "hypothetical", label: "Hypothetical", kind: "navigate", target: link.to, sourceLink: null });
    return {
      id: link.id, from: link.from, to: link.to,
      alternative: supportedPath(map, link.from, link.to, link),
      newlyReachableFromHome: map.nodes.filter((n) => !supportedPath(map, map.home, n.id) && supportedPath(hypothetical, map.home, n.id)).map((n) => n.id),
      unsettledEndpoints: [link.from, link.to].filter((id) => scopeFindings.some((f) => f.id === `scope_${id}`)),
    };
  });
}
export function consequenceQuestions(map: AppMap, evidence: LinkEvidence[]): Questions {
  const describe = (id: string) => { const n = map.nodes.find((n) => n.id === id)!; return `${n.label} (${n.purpose})`; };
  return Object.fromEntries(evidence.map((e) => [`impact_${e.id}`, choice({
    context: "Critique a concrete whole-app map using the brief, first-screen evidence, supported links and computed counterfactual paths. All questions in this batch run independently against the same map. Do not assume that another undecided link will be added. Reachability establishes a graph path, not whether the user journey is sensible. Assess task consequences; do not repeat whether this link merely seems plausible.",
    question: `What should we do about ${describe(e.from)} → ${describe(e.to)}? Without this direct link, the existing alternative is ${e.alternative ? e.alternative.join(" → ") : "NONE"}. Adding it would make these destinations newly reachable from Home: ${e.newlyReachableFromHome.join(", ") || "none"}. Unsettled endpoint responsibilities: ${e.unsettledEndpoints.join(", ") || "none"}. Does its absence block a core task, or can the app work coherently without it? A path via Home is not automatically a sensible substitute for task progress.`,
  }, {
    required: "Add this link: a core task or necessary return would otherwise be blocked or materially incoherent; the current alternative is inadequate.",
    optional: "Defer this shortcut: the stated EXISTING alternative is a sensible way to accomplish the task. Preserve the shortcut as an optional design choice.",
    unnecessary: "Omit this link: no core task calls for this direct transition; these destinations can belong to separate journeys. This does not mean either destination should be removed.",
    responsibility: "First resolve what one of these destinations is responsible for; link inclusion cannot settle that disagreement.",
    unknown: "The available evidence does not establish the task consequence.",
  })]));
}
export function applyConsequences(map: AppMap, links: LinkDecision[], evidence: LinkEvidence[], answers: Answers) {
  const next = structuredClone(map), updated = structuredClone(links);
  for (const e of evidence) {
    const link = updated.find((l) => l.id === e.id)!;
    if (link.status !== "unresolved") continue;
    const answer = answers[`impact_${e.id}`];
    if (!answer) continue;
    const decision = supportedChoice(answer);
    let effect: LinkAssessment["effect"] = "unresolved";
    if (decision === "required") {
      link.status = "navigate"; effect = "include_required";
      const node = next.nodes.find((n) => n.id === link.from)!;
      if (!node.actions.some((a) => a.target === link.to && ["navigate", "back"].includes(a.kind))) node.actions.push({ id: `to_${link.to}`, label: next.nodes.find((n) => n.id === link.to)!.label, kind: "navigate", target: link.to, sourceLink: null });
    } else if (decision === "optional" && e.alternative && supportedPath(map, link.from, link.to, link)) {
      // Validate against the batch INPUT. Other simultaneously required links cannot justify deferral.
      link.status = "optional"; effect = "defer_optional";
    } else if (decision === "unnecessary") {
      link.status = "omit"; effect = "omit_unnecessary";
    } else if (decision === "responsibility") effect = "review_responsibility";
    link.assessment = { evidence: e, answer, effect, ...(decision === "optional" && effect === "unresolved" ? { reason: "Optional deferral rejected: there is no supported alternative in the batch input." } : {}) };
  }
  return { map: GRAPH.parse(next), links: updated, findings: consequenceFindings(updated) };
}
export function consequenceFindings(links: LinkDecision[]): Finding[] {
  return links.filter((l) => l.status === "unresolved").map((l) => ({
    id: l.id, severity: "uncertain", detail: l.assessment?.effect === "review_responsibility"
      ? `Unsettled responsibility prevents deciding ${l.from} → ${l.to}.`
      : l.assessment?.reason ?? `Task consequence is unresolved for ${l.from} → ${l.to}; it is neither accepted nor omitted.`,
    p: l.assessment ? l.assessment.answer.probabilities[l.assessment.answer.choice] : l.p,
  }));
}
/** Later pruning may invalidate the path that justified deferring a shortcut. */
export function recheckOptional(map: AppMap, links: LinkDecision[]): LinkDecision[] {
  return links.filter((l) => map.nodes.some((n) => n.id === l.from) && map.nodes.some((n) => n.id === l.to)).map((l) => {
    if (l.status === "optional" && !supportedPath(map, l.from, l.to, l)) return { ...l, status: "unresolved", assessment: l.assessment ? { ...l.assessment, effect: "unresolved", reason: "The alternative route no longer exists after pruning; optional deferral has been revoked." } : undefined };
    return l;
  });
}
export function mapIssues(map: AppMap, findings: Finding[], links: LinkDecision[]): MapIssue[] {
  const label = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? id;
  const issues: MapIssue[] = findings.filter((f) => !links.some((l) => l.id === f.id)).map((f) => ({ id: f.id,
    category: f.id.startsWith("scope_") || f.id.startsWith("local_") ? "responsibility" : f.id.startsWith("unreachable:") || f.id === "coverage" ? "journey" : "unassessed", detail: f.detail }));
  for (const link of links) {
    if (link.status === "optional") issues.push({ id: link.id, category: "optional", from: link.from, to: link.to, detail: `${label(link.from)} → ${label(link.to)} is deferred; a supported alternative completes the task.` });
    if (link.status === "unresolved") issues.push({ id: link.id, category: link.assessment?.effect === "review_responsibility" ? "responsibility" : "unassessed", from: link.from, to: link.to, detail: `${label(link.from)} → ${label(link.to)}: ${link.assessment?.effect === "review_responsibility" ? "settle destination responsibilities first" : "task consequence still needs a supported decision"}.` });
  }
  return issues;
}
