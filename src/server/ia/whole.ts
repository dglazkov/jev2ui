export { WHOLE_CANDIDATES } from "./roles.js";
import type { LinkAssessment } from "./consequences.js";
import { choice, type Questions } from "@typesafe-ai/sdk";
import type { Answers, Candidate, ChoiceAnswer } from "./decisions.js";
import { GRAPH, type AppMap, type Finding } from "./graph.js";

// A finite, domain-neutral vocabulary, not a claim that every app needs these screens.
export const LEGACY_CONTENT_CANDIDATES: Candidate[] = [
  ["browse", "Browse", "Discover the app's primary content or offerings."],
  ["search", "Search", "Find primary content or offerings by query and filters; results live here."],
  ["library", "Library", "Manage saved, followed, owned or subscribed content."],
  ["collection", "Collection detail", "Inspect one collection, series or group and its members."],
  ["item", "Item detail", "Inspect one primary item, episode, product or record."],
  ["active", "Active experience", "Consume or use the primary item: playback, reading or an active session."],
  ["queue", "Queue", "Manage the ordered items waiting for consumption or processing."],
  ["downloads", "Downloads", "Manage locally available content and download progress."],
  ["activity", "Activity", "Review recent activity, history or notifications."],
  ["profile", "Profile", "Review personal identity and account information."],
  ["create", "Create or book", "Compose a new primary record, booking or content item, then save or cancel."],
  ["help", "Help", "Find product help and support."],
].map(([id, label, purpose]) => ({ id: `w_${id}`, label, purpose, link: null }));

const context = "Design the smallest coherent whole app implied by the original brief and first-screen evidence. The brief may describe one screen of a larger app. Infer the core surrounding user journeys, but do not add speculative features merely because a candidate exists. Screen identity is task + subject + scope, independent of entry path. All labels are mechanical role names, not generated product copy. Select unknown if the finite vocabulary cannot express the intent.";
export function supportedChoice(a: ChoiceAnswer | undefined): string | undefined {
  if (!a) return;
  const p = a.probabilities[a.choice];
  return p >= .65 && p - Math.max(0, ...Object.entries(a.probabilities).filter(([k]) => k !== a.choice).map(([, p]) => p)) >= .15 ? a.choice : undefined;
}
export function expansionDraft(base: AppMap): AppMap {
  if (base.nodes.length + LEGACY_CONTENT_CANDIDATES.length > 24) throw new Error("Whole-app candidate budget exceeded; revise vocabulary explicitly.");
  return GRAPH.parse({ ...base, boundary: "Whole-app hypothesis within a finite responsibility vocabulary. Closure does not prove product completeness.", nodes: [...base.nodes, ...LEGACY_CONTENT_CANDIDATES.map((c) => ({ id: c.id, label: c.label, purpose: c.purpose, actions: [] }))] });
}
export function scopeQuestions(map: AppMap, ids: string[]): Questions {
  return Object.fromEntries(ids.map((id) => {
    const node = map.nodes.find((n) => n.id === id)!;
    return [`scope_${id}`, choice({ context, question: `Does ${node.label}: ${node.purpose} deserve a distinct destination in this app? Merge only identical responsibilities; a collection and one item, or account overview and one setting, differ in scope.` }, {
      keep: "A distinct responsibility needed for a core journey of this app.",
      omit: "Optional, unsupported or unnecessary for the core app; prune it.",
      ...Object.fromEntries(map.nodes.filter((n) => n.id !== id).map((n) => [n.id, `Reuse ${n.label}: ${n.purpose}`])),
      unknown: "Cannot express or confidently settle this responsibility with the available vocabulary.",
    })];
  }));
}
export function prune(map: AppMap, answers: Answers, ids: string[]) {
  const aliases: Record<string, string> = Object.fromEntries(map.nodes.map((n) => [n.id, n.id]));
  const omitted = new Set<string>(); const findings: Finding[] = [];
  for (const id of ids) {
    if (id === "first" || id === map.home) throw new Error("Cannot prune the original mock or home anchor");
    const value = supportedChoice(answers[`scope_${id}`]);
    if (value === "omit") omitted.add(id);
    else if (value && value !== id && map.nodes.some((n) => n.id === value)) aliases[id] = value;
    else if (value !== "keep") findings.push({ id: `scope_${id}`, severity: "uncertain", detail: `Unsettled responsibility: ${id}.` });
  }
  // Resolve simultaneous aliases, including mutual identity claims, without losing first/home.
  for (const start of Object.keys(aliases)) {
    const path: string[] = []; let at = start;
    while (aliases[at] !== at && !path.includes(at)) { path.push(at); at = aliases[at]; }
    if (path.includes(at)) {
      const cycle = path.slice(path.indexOf(at));
      const keep = cycle.includes("first") ? "first" : cycle.includes(map.home) ? map.home : [...cycle].sort()[0];
      for (const id of cycle) aliases[id] = keep;
    }
  }
  for (const id of Object.keys(aliases)) { let at = id; while (aliases[at] !== at) at = aliases[at]; aliases[id] = at; }
  for (const id of ids) if (aliases[id] !== id && omitted.has(aliases[id])) findings.push({ id: `scope_${id}`, severity: "uncertain", detail: `Identity claim for ${id} points to pruned responsibility ${aliases[id]}; scope decisions conflict.` });
  const nodes = map.nodes.filter((n) => aliases[n.id] === n.id && !omitted.has(n.id)).map((node) => ({ ...node, actions: node.actions.flatMap((action) => {
    if (!action.target) return [{ ...action }];
    const target = aliases[action.target];
    if (omitted.has(target)) return action.sourceLink ? [{ ...action, kind: "unresolved" as const, target: null }] : [];
    if (target === node.id) return [{ ...action, kind: "remove" as const, target: null }];
    return [{ ...action, target }];
  }) }));
  return { map: GRAPH.parse({ ...map, nodes }), aliases, findings };
}
export interface LinkDecision {
  id: string; from: string; to: string;
  status: "navigate" | "back" | "omit" | "optional" | "unresolved";
  probabilities?: Record<string, number>; assessment?: LinkAssessment;
  choice: string; p: number;
}
/** Each directed link is judged independently. Observed first-screen actions stay authoritative. */
export function connectionPairs(map: AppMap, ids: string[]) {
  const sources = map.nodes.filter((n) => n.id === map.home && n.id !== "first" || ids.includes(n.id));
  const targets = map.nodes.filter((n) => n.id === "first" || n.id === map.home || ids.includes(n.id));
  return sources.flatMap((from) => targets.filter((to) => to.id !== from.id && !from.actions.some((a) => a.target === to.id && ["navigate", "back"].includes(a.kind)))
    .map((to) => ({ id: `edge_${from.id}_${to.id}`, from, to })));
}
export function connectionQuestions(map: AppMap, ids: string[]): Questions {
  const questions: Questions = {};
  for (const { id, from, to } of connectionPairs(map, ids)) {
    questions[id] = choice({ context, question: `Should ${from.label} (${from.purpose}) offer a direct link to ${to.label} (${to.purpose})? Judge ONLY this directed pair. Several outgoing links and several entry points can all be valid. Inspecting an item and initiating its primary activity can be separate valid actions. Include a link when it supports a plausible core task or necessary return, not merely because both screens exist. Do not infer this link from the reverse direction. Existing observed settings controls remain on their original overview.` }, {
      include: "Include this direct link: it supports a core task, destination entry, app navigation or useful return. The visual control and whether it looks like Back do not affect this decision.",
      omit: "No direct link belongs here; the task stays local or reaches this destination through another screen.",
      unknown: "Insufficient evidence or the available responsibilities cannot express the intended transition.",
    });
  }
  for (const id of ids) {
    const node = map.nodes.find((n) => n.id === id)!;
    questions[`local_${id}`] = choice({ context, question: `Which local action grammar belongs on ${node.label}? This does not create new destinations.` }, {
      select: "Select, filter, follow or manage items in place; navigation uses explicit links.",
      consume: "Play/pause, read or control the active experience in place.",
      submit: "Save/submit the task or cancel using explicit return links.",
      view: "Read information and use explicit navigation links; no additional local action.",
      unknown: "These action grammars do not cover the needed task.",
    });
  }
  return questions;
}
export function connect(map: AppMap, ids: string[], answers: Answers) {
  const next = structuredClone(map); const findings: Finding[] = [], links: LinkDecision[] = [];
  for (const { id, from, to } of connectionPairs(map, ids)) {
    const answer = answers[id], value = supportedChoice(answer);
    const status = value === "include" ? "navigate" : value === "omit" ? "omit" : "unresolved";
    links.push({ id, from: from.id, to: to.id, status, probabilities: answer?.probabilities, choice: answer?.choice ?? "unanswered", p: answer?.probabilities[answer.choice] ?? 0 });
    if (status === "unresolved") findings.push({ id, severity: "uncertain", detail: `Unresolved link: ${from.label} → ${to.label}. This is not a decision to omit the link.`, p: answer?.probabilities[answer.choice] });
    if (status === "navigate") next.nodes.find((n) => n.id === from.id)!.actions.push({ id: `to_${to.id}`, label: to.label, kind: status, target: to.id, sourceLink: null });
  }
  for (const id of ids) {
    const node = next.nodes.find((n) => n.id === id)!;
    const key = `local_${id}`, value = supportedChoice(answers[key]);
    if (value && ["select", "consume", "submit"].includes(value)) {
      node.actions.push({ id: "local", label: value === "consume" ? "Control experience" : value === "submit" ? "Save" : "Select or manage", kind: value === "submit" ? "complete" : "in_place", target: null, sourceLink: null });
    } else if (value !== "view") findings.push({ id: key, severity: "uncertain", detail: `Unsettled local action grammar for ${node.label}.` });
  }
  return { map: GRAPH.parse(next), findings, links };
}
export function coverageQuestion(): Questions {
  return { coverage: choice({ context, question: "Audit the assembled WHOLE APP from a user's core journeys, not merely whether all graph links have targets. Can people discover/find primary content, inspect it, perform the primary activity, manage their content/account where implied, and return? Are responsibilities correctly separated? Assess the actual edges. A finite map with missing journeys is not complete." }, {
    adequate: "The core app journeys implied by the brief and first screen are represented and navigable within this vocabulary.",
    missing: "A core responsibility or journey step is absent or cannot be reached through sensible links.",
    incoherent: "The destinations overlap, relationships contradict task flow, or pruning would break a needed journey.",
    unknown: "The evidence is insufficient to assess whole-app coverage.",
  }) };
}
