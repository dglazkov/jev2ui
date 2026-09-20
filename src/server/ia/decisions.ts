import { choice, type Questions } from "@typesafe-ai/sdk";
import { GRAPH, validateMap, type AppMap, type Finding, type MapAction, type Seed } from "./graph.js";

export interface Candidate { id: string; label: string; purpose: string; link: string | null }
export interface ChoiceAnswer { choice: string; probabilities: Record<string, number> }
export type Answers = Record<string, ChoiceAnswer>;
export interface Assembly { map: AppMap; aliases: Record<string, string>; findings: Finding[]; pending: string[]; decisions: Array<{ id: string; choice: string; p: number; effect: string }> }

const context = "Build a finite app information architecture from its first screen and observed controls. A destination is a screen responsibility for a particular subject and scope. Entry points, icons, navigation chrome and sample values do not create another destination. Candidate descriptions are mechanical possibilities, not instructions to include them. Only the original brief and first-screen evidence establish intent. Choose outside or unknown when the available vocabulary cannot express it.";

/** Candidate space is constructed once. No recursive expansion and no text-generation call. */
export function candidatesFor(seed: Seed): Candidate[] {
  if (seed.links.length > 30) throw new Error("The experiment supports at most 30 observed actions; expand the candidate budget explicitly.");
  const candidates: Candidate[] = [
    { id: "first", label: seed.first.title, purpose: `The whole existing ${seed.first.archetype} screen, with all of ${seed.first.sections.map((s) => s.title).join(", ") || seed.first.title}. Returning here shows the same entire mock, not a picker or another subpage for one of its controls.`, link: null },
    { id: "home", label: "Home", purpose: "The app's main starting destination, with entry points to its known screens.", link: null },
    ...seed.links.flatMap((link, i) => ["back", "in_place"].includes(link.kind) ? [] : [{ id: `d_${i}`, label: link.label, purpose: link.kind === "row"
      ? `A separate screen dedicated to ${link.label}${link.subject ? ` (${link.subject})` : ""}: open this one setting or account action from the overview. A value row opens choices for this one setting; a danger row opens confirmation.`
      : `A separate destination opened by ${link.kind} “${link.label}”${link.subject ? ` (${link.subject})` : ""}. This candidate is unnecessary if the same screen responsibility already exists.`, link: link.id }]),
  ];
  if (candidates.length > 24) throw new Error("The candidate budget is 24 destinations. No candidates were silently discarded.");
  return candidates;
}

export function decisionQuestions(seed: Seed, candidates: Candidate[]): Questions {
  const qs: Questions = {
    home: choice({ context, question: "Is the first screen itself the app's starting destination, or does it belong beneath a separate home?" }, {
      first: "The first screen is the app's home or main starting overview.",
      home: "The first screen is a subpage/task destination; the app has a separate home.",
      unknown: "There is not enough evidence to decide.",
    }),
  };
  for (const [i, link] of seed.links.entries()) {
    // Toggle behavior is already observed in the renderer, not a semantic guess.
    if (link.kind === "in_place") continue;
    const options = Object.fromEntries(candidates.map((c) => [c.id, `${c.id}: ${c.label}. ${c.purpose}`]));
    qs[`route_${i}`] = choice({ context, question: `Immediately after clicking ${link.id}: “${link.label}” (${link.kind}${link.subject ? `, ${link.subject}` : ""}), which screen or behavior does the person need? This asks where the click leads, NOT which overview contains the control. A value row opens a separate picker; a danger row opens confirmation. Choose first only if the click would reopen the whole existing mock with the same task and scope. Different entry points to that same responsibility must reuse it.` }, {
      ...options,
      in_place: "It changes or selects something within the existing screen, without opening another mock.",
      complete: "It completes the current action without requiring another screen mock.",
      remove: "It is an unnecessary entry point and should be removed from this screen.",
      outside: "The needed destination or behavior is not represented by these candidates. Explicitly revise the candidate vocabulary.",
    });
    const candidate = candidates.find((c) => c.link === link.id);
    if (!candidate) continue;
    qs[`role_${i}`] = choice({ context, question: `If “${link.label}” needs a separate screen, what is the person's task there? This answer is ignored if the action resolves to an existing destination or performs no navigation.` }, {
      picker: "Choose one value for one preference or option, then return.",
      form: "Enter or edit information, then submit or cancel.",
      confirmation: "Review consequences and confirm or cancel an action.",
      detail: "Inspect one item or a narrower set of information, with a way back.",
      overview: "Visit a peer section or overview of the app.",
      outcome: "See that a task finished, then return.",
      outside: "The candidate grammar cannot adequately express the task.",
    });
    qs[`relation_${i}`] = choice({ context, question: `If “${link.label}” opens a distinct destination, how is that destination related to the first screen's responsibility?` }, {
      child: "A more specific subject, setting or subordinate task within the first screen's scope.",
      peer: "Another app section at the same level, sharing the app's home.",
      parent: "The broader destination that contains the first screen.",
      outcome: "A completion or confirmation stage of the task started on the first screen.",
      unknown: "The relationship cannot be established from the observed action.",
    });
  }
  return qs;
}

/** These thresholds route ambiguous decisions to another batch, never to fresh screen generation. */
function supported(answer: ChoiceAnswer | undefined) {
  if (!answer) return false;
  const p = answer.probabilities[answer.choice];
  const rival = Math.max(0, ...Object.entries(answer.probabilities).filter(([k]) => k !== answer.choice).map(([, p]) => p));
  return Number.isFinite(p) && p >= .65 && p - rival >= .15;
}
export function validateAnswers(answers: Answers, questions: Questions) {
  for (const key of Object.keys(questions)) {
    const answer = answers[key];
    if (!answer || typeof answer.choice !== "string" || !Number.isFinite(answer.probabilities?.[answer.choice])) throw new Error(`Missing or invalid answer: ${key}`);
  }
}

export function assemble(seed: Seed, candidates: Candidate[], answers: Answers): Assembly {
  const findings: Finding[] = [], pending = new Set<string>();
  const decisions: Assembly["decisions"] = [];
  const issue = (id: string, detail: string) => {
    if (pending.has(id)) return;
    pending.add(id); findings.push({ id, severity: "uncertain", detail, ...(answers[id] ? { p: answers[id].probabilities[answers[id].choice] } : {}) });
  };
  function read(key: string, allowed: string[]) {
    const a = answers[key];
    if (!supported(a) || !allowed.includes(a.choice)) { issue(key, `${key}: ${a?.choice ?? "not decided"}; a supported choice within the candidate vocabulary is needed.`); return undefined; }
    return a.choice;
  }
  const homeChoice = read("home", ["first", "home"]);
  const aliases = Object.fromEntries(candidates.map((c) => [c.id, c.id]));
  if (homeChoice === "first") aliases.home = "first";
  const routes = new Map<number, string>();
  const canonical = (id: string) => {
    const visited: string[] = [];
    while (aliases[id] !== id) {
      if (visited.includes(id)) return undefined;
      visited.push(id); id = aliases[id];
    }
    return id;
  };
  const candidateIDs = candidates.map((c) => c.id);
  for (const [i, link] of seed.links.entries()) {
    if (link.kind === "in_place") { routes.set(i, "in_place"); continue; }
    const route = read(`route_${i}`, [...candidateIDs, "in_place", "complete", "remove"]);
    if (!route) continue;
    routes.set(i, route);
    const own = candidates.find((c) => c.link === link.id);
    if (own && candidateIDs.includes(route)) aliases[own.id] = route;
  }
  // A mutual identity claim can be merged only if every link in the cycle is supported.
  // Canonical ID selection is deterministic and cannot displace the already-rendered first mock.
  for (const c of candidates) {
    const path: string[] = []; let at = c.id;
    while (aliases[at] !== at && !path.includes(at)) { path.push(at); at = aliases[at]; }
    if (path.includes(at)) {
      const cycle = path.slice(path.indexOf(at));
      const keep = cycle.includes("first") ? "first" : cycle.includes("home") ? "home" : [...cycle].sort()[0];
      for (const id of cycle) aliases[id] = keep;
    }
  }
  for (const id of candidateIDs) aliases[id] = canonical(id)!;

  const home = homeChoice === "first" ? "first" : "home";
  const nodes: AppMap["nodes"] = [{ id: "first", label: seed.first.title, purpose: candidates[0].purpose, actions: [] }];
  if (home !== "first") nodes.push({ id: "home", label: "Home", purpose: candidates[1].purpose, actions: [{ id: "open_first", label: seed.first.title, kind: "navigate", target: "first", sourceLink: null }] });
  const first = nodes[0];
  const roles = new Map<string, string>(), relations = new Map<string, string>();
  for (const [i, route] of routes) {
    if (!candidateIDs.includes(route)) continue;
    const target = aliases[route];
    if (["first", "home"].includes(target)) continue;
    const owner = candidates.find((c) => c.id === target)!;
    const ownerIndex = seed.links.findIndex((l) => l.id === owner.link);
    const role = read(`role_${ownerIndex}`, ["picker", "form", "confirmation", "detail", "overview", "outcome"]);
    const relation = read(`relation_${ownerIndex}`, ["child", "peer", "parent", "outcome"]);
    if (!role || !relation) continue;
    // Distinct parent claims cannot silently invent a second home or turn first into its own ancestor.
    if (relation === "parent") { issue(`route_${i}`, `The selected destination ${target} was also classified as a parent. Reconcile its identity with the home candidate.`); continue; }
    roles.set(target, role); relations.set(target, relation);
  }
  for (const [target, role] of roles) {
    const c = candidates.find((c) => c.id === target)!;
    const label = role === "picker" ? `Choose ${c.label}` : role === "confirmation" ? `Confirm ${c.label}` : c.label;
    const parent = relations.get(target) === "peer" ? home : "first";
    const actions: MapAction[] = [{ id: "back", label: role === "confirmation" || role === "form" ? "Cancel" : "Back", kind: "back", target: parent, sourceLink: null }];
    if (role === "picker") actions.unshift({ id: "select", label: "Select value", kind: "in_place", target: null, sourceLink: null });
    if (role === "form" || role === "confirmation") actions.unshift({ id: "finish", label: role === "form" ? "Save" : "Confirm", kind: "complete", target: null, sourceLink: null });
    nodes.push({ id: target, label, purpose: `${role}: ${c.label}${seed.links.find((l) => l.id === c.link)?.subject ? ` (${seed.links.find((l) => l.id === c.link)!.subject})` : ""}.`, actions });
    if (relations.get(target) === "peer" && home !== "first") nodes.find((n) => n.id === home)!.actions.push({ id: `open_${target}`, label: c.label, kind: "navigate", target, sourceLink: null });
  }
  for (const [i, link] of seed.links.entries()) {
    const route = routes.get(i);
    const target = route && candidateIDs.includes(route) ? aliases[route] : null;
    let kind: MapAction["kind"] = "unresolved";
    if (route === "in_place" || route === "complete" || route === "remove") kind = route;
    else if (target === "first") kind = "remove";
    else if (target && nodes.some((n) => n.id === target) && !pending.has(`route_${i}`)) kind = link.kind === "back" ? "back" : "navigate";
    first.actions.push({ id: `a_${i}`, label: link.label, kind, target: ["navigate", "back"].includes(kind) ? target : null, sourceLink: link.id });
    decisions.push({ id: link.kind === "in_place" ? `observed_${i}` : `route_${i}`, choice: route ?? "unresolved", p: link.kind === "in_place" ? 1 : answers[`route_${i}`]?.probabilities[route ?? ""] ?? 0, effect: kind === "remove" && target === "first" ? "Same destination → suppress the redundant entry point; keep the original mock." : `${kind}${target && kind !== "unresolved" ? ` → ${target}` : ""}` });
  }
  const map = GRAPH.parse({ boundary: `Finite destinations implied by “${seed.brief}”, its first-screen actions, and home/return/completion templates. Unrepresented intent requires an explicit vocabulary revision.`, home, nodes });
  findings.push(...validateMap(map, seed));
  return { map, aliases, pending: [...pending], findings, decisions };
}

/** Runtime uses IDs attached by assembly, not another semantic model call. */
export function actionForLink(map: AppMap, sourceLink: string): MapAction | undefined {
  return map.nodes.find((n) => n.id === "first")?.actions.find((a) => a.sourceLink === sourceLink);
}
