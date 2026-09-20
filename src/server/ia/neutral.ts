import { choice, type Questions } from "@typesafe-ai/sdk";
import { WHOLE_CANDIDATES } from "./roles.js";
import { GRAPH, validateMap, type AppMap, type Finding, type Seed } from "./graph.js";
import type { Answers } from "./decisions.js";
import { supportedPath } from "./consequences.js";
import type { JourneyReview } from "./proposal.js";

const context = "Choose ONE plausible, fully resolved information architecture for the app implied by the brief and first screen. These are design choices, not claims of unique intent. Plan the WHOLE surrounding app, not only the requested initial screen. An initial preferences, checkout, detail or confirmation screen is usually a subtask of a broader product. A genuinely self-contained instrument may be small. Use responsibilities rather than assuming every product is a media library, marketplace or social app. A focused instrument may remain a very small app. Do not invent a checkout, account, feed or history without a task reason. The first screen already exists and must be reused for the same responsibility.";
export const ACTIVITIES: Record<string, string> = {
  read: "Read information", choose: "Choose an option", adjust: "Adjust controls", run: "Start, pause or reset", monitor: "Observe current state", enter: "Edit draft", commit: "Confirm and submit", communicate: "Send or reply", configure: "Change preferences",
};
export const PATTERNS: Record<string, string[]> = {
  inspect: ["collection", "detail"],
  select: ["collection", "detail", "select"],
  transact: ["collection", "detail", "select", "edit", "review", "outcome"],
  operate: ["collection", "detail", "operate"],
  monitor: ["monitor", "detail", "operate"],
  communicate: ["collection", "conversation"],
  configure: ["preferences"],
  focused: [],
};
export function neutralQuestions(): Questions {
  const qs: Questions = {
    anchor: choice({ context, question: "Which responsibility is the WHOLE requested first screen performing? Bind that role to first; don't create another screen for it. A chart may inspect a time period, a map may select places, a timer is an instrument, and a deletion confirmation is review, not preferences." }, {
      ...Object.fromEntries(WHOLE_CANDIDATES.map((c) => [c.id, `${c.label}: ${c.purpose}`])),
      specific: "The exact requested task is narrower or different; retain first as a distinct task anchor.",
    }),
    activity: choice({ context, question: "Which activity best expresses the primary task on the requested first screen? This chooses a local activity, not a new screen." }, ACTIVITIES),
    pattern: choice({ context, question: "Which workflow best organizes the core WHOLE APP, beyond this initial screen if it is a subpage? Transactions include transfers, enrollment, purchases and irreversible confirmations even if the initial UI is a single form. A genuinely focused instrument can operate directly." }, {
      inspect: "Find and inspect information, records or subjects.", select: "Find a subject and choose a value, resource or option without a transactional commit.",
      transact: "Prepare information or a selection, review consequences, commit and see the outcome.", operate: "Access a subject or instrument and perform an ongoing activity.",
      monitor: "Observe live or aggregate state, inspect a subject and optionally operate it.", communicate: "Find a conversation, read it and exchange messages.", configure: "Configure behavior and preferences.", focused: "The first screen is a self-contained instrument or task; supporting screens are optional.",
    }),
  };
  for (const c of WHOLE_CANDIDATES) qs[`use_${c.id}`] = choice({ context, question: `Where does the responsibility ${c.label}: ${c.purpose} belong in the WHOLE APP? The first screen can fulfill several roles at once, e.g. observing and operating the same instrument. Reuse it only for the same subject and scope. A broader collection, different subject, or subsequent task stage deserves a separate destination. An initial settings screen does not eliminate the rest of the app's primary work.` }, {
    first: "The existing first screen already fulfills this responsibility for the same subject and scope. Reuse first; do not split off another screen.",
    separate: "The whole app needs this distinct responsibility beyond the first screen. Include a separate planned destination.",
    omit: "This responsibility is outside this proposed app; omit it.",
  });
  for (const [id, label] of Object.entries(ACTIVITIES)) qs[`first_activity_${id}`] = choice({ context, question: `Does the requested FIRST SCREEN need the local action ${label}? Judge this action independently. Several actions may coexist, such as entering a form and submitting it, or observing a timer and starting/pausing it. Judge this screen, not all screens in the app.` }, { include: "Include this local action on the planned first screen.", omit: "This action does not belong on the requested first screen." });
  return qs;
}
export interface NeutralPlan { map: AppMap; aliases: Record<string, string>; roles: string[]; activity: string; pattern: string; receipts: string[] }
const defaultActivity: Record<string, string> = { collection: "Find or filter subjects", detail: "Read information", select: "Choose an option", operate: "Operate the subject", monitor: "Observe current state", history: "Inspect a past record", edit: "Edit draft", review: "Confirm and submit", outcome: "Acknowledge result", conversation: "Send or reply", preferences: "Change preferences", help: "Read instructions" };
export function constructNeutral(base: AppMap, seed: Seed, answers: Answers, plannedAnchor = false): NeutralPlan {
  const anchor = answers.anchor?.choice, activity = ACTIVITIES[answers.activity?.choice], pattern = answers.pattern?.choice;
  if (!activity || !(pattern in PATTERNS) || ![...WHOLE_CANDIDATES.map((c) => c.id), "specific"].includes(anchor)) throw new Error("Invalid neutral design choices");
  let roles = WHOLE_CANDIDATES.filter((c) => { const a = answers[`use_${c.id}`]?.choice; if (!["first", "separate", "omit"].includes(a)) throw new Error(`Missing scope choice ${c.id}`); return a !== "omit" || c.id === anchor; }).map((c) => c.id);
  if (pattern === "transact") for (const role of ["w_review", "w_outcome"]) if (!roles.includes(role)) roles.push(role);
  // Role combinations must respect task stages. Editing a parameter is not a financial commit,
  // and observing a result in a tool is not a separate receipt screen.
  const allowedOnFirst: Record<string, string[]> = {
    w_collection: ["w_select"], w_detail: ["w_help"], w_select: ["w_collection", "w_operate"],
    w_operate: ["w_select", "w_monitor", "w_detail"], w_monitor: ["w_operate", "w_select", "w_detail"],
    w_history: ["w_collection", "w_detail", "w_monitor", "w_select"], w_edit: ["w_select"],
    w_review: ["w_edit"], w_outcome: ["w_detail"], w_conversation: ["w_detail", "w_edit"],
    w_preferences: ["w_select", "w_edit"], w_help: ["w_detail"],
  };
  const droppedAliases = roles.filter((id) => id !== anchor && answers[`use_${id}`]?.choice === "first" && !(allowedOnFirst[anchor] ?? []).includes(id) && !(pattern === "transact" && ["w_review", "w_outcome"].includes(id)));
  roles = roles.filter((id) => !droppedAliases.includes(id));
  const aliases: Record<string, string> = Object.fromEntries(roles.map((id) => [id, id === anchor || answers[`use_${id}`]?.choice === "first" && (allowedOnFirst[anchor] ?? []).includes(id) ? "first" : id]));
  // Only a transactional workflow asks for review/receipt stages. Local tool changes remain local.
  if (pattern !== "transact" && anchor !== "w_review" && anchor !== "w_outcome") {
    roles = roles.filter((r) => !["w_review", "w_outcome"].includes(r));
    delete aliases.w_review; delete aliases.w_outcome;
  }
  const map = structuredClone(base), receipts = [`First screen reuses ${anchor}; primary task: ${activity}; workflow: ${pattern}.`];
  if (droppedAliases.length) receipts.push(`Omitted incompatible first-screen role annotations (${droppedAliases.join(", ")}); they do not justify inventing separate screens.`);
  map.boundary = "One proposed app assembled from responsibilities (inspect, select, operate, monitor, edit, review, outcome, converse and configure). The first responsibility has one canonical identity. Screens are planning hypotheses, not generated mocks.";
  const canonical = (id: string) => aliases[id] ?? id;
  const exists = (id: string) => map.nodes.some((n) => n.id === canonical(id));
  const edge = (from: string, to: string, kind: "navigate" | "back" = "navigate", label?: string) => {
    from = canonical(from); to = canonical(to);
    if (from === to || from === "first" && !plannedAnchor) return;
    const n = map.nodes.find((n) => n.id === from), t = map.nodes.find((n) => n.id === to);
    if (!n || !t || n.actions.some((a) => a.target === to && ["navigate", "back"].includes(a.kind))) {
      if (label && n && t) { const existing = n.actions.find((a) => a.target === to && ["navigate", "back"].includes(a.kind)); if (existing && !existing.sourceLink) existing.label = label; }
      return;
    }
    n.actions.push({ id: `to_${to}`, label: label ?? (kind === "back" ? `Back to ${t.label}` : t.label), kind, target: to, sourceLink: null });
  };
  if (plannedAnchor) {
    const n = map.nodes.find((n) => n.id === "first")!;
    n.purpose = `Requested task: ${seed.brief}. Activities apply to that exact subject, not to an abstract generic app. Activity: ${activity}. This is the canonical ${anchor} responsibility, not a second copy.`.slice(0, 600);
    const primary = n.actions.find((a) => a.sourceLink === "primary");
    if (primary) { primary.label = activity; primary.kind = answers.activity.choice === "commit" ? "complete" : "in_place"; }
    // The activity set supplements, rather than replaces, the structural contract of the anchor.
    if (anchor === "w_edit" && !n.actions.some((a) => a.label === ACTIVITIES.enter)) n.actions.push({ id: "draft", label: ACTIVITIES.enter, kind: "in_place", target: null, sourceLink: null });
    if (anchor === "w_operate" && answers.activity.choice === "monitor" && !n.actions.some((a) => a.label === ACTIVITIES.run)) n.actions.push({ id: "operate", label: ACTIVITIES.run, kind: "in_place", target: null, sourceLink: null });
    for (const [key, label] of Object.entries(ACTIVITIES)) {
      const decision = answers[`first_activity_${key}`]?.choice;
      if (!["include", "omit"].includes(decision)) throw new Error(`Missing first-screen activity ${key}`);
      if (key === "communicate" && pattern !== "communicate" && anchor !== "w_conversation") continue;
      if (decision === "include" && !n.actions.some((a) => a.label === label)) n.actions.push({ id: `activity_${key}`, label, kind: key === "commit" ? "complete" : "in_place", target: null, sourceLink: null });
    }
  }
  for (const c of WHOLE_CANDIDATES.filter((c) => roles.includes(c.id) && aliases[c.id] !== "first")) {
    const role = c.id.slice(2);
    map.nodes.push({ id: c.id, label: c.label, purpose: c.purpose, actions: [{ id: "local", label: defaultActivity[role], kind: ["review", "outcome"].includes(role) ? "complete" : "in_place", target: null, sourceLink: null }] });
  }
  if (map.nodes.length > 24) throw new Error("Neutral map exceeds 24-destination budget");
  const chain = PATTERNS[pattern].map((r) => `w_${r}`).filter((id) => roles.includes(id));
  for (let i = 1; i < chain.length; i++) edge(chain[i - 1], chain[i]);
  if (chain.length) edge(map.home, chain[0]);
  if (roles.includes("w_collection") && roles.includes("w_detail")) edge("w_collection", "w_detail");
  if (roles.includes("w_detail") && roles.includes("w_operate")) edge("w_detail", "w_operate");
  if (roles.includes("w_collection") && roles.includes("w_conversation")) edge("w_collection", "w_conversation");
  // Auxiliary tasks connect to an appropriate subject without assuming media consumption.
  if (roles.includes("w_history") && exists("w_detail")) edge("w_history", "w_detail");
  if (roles.includes("w_monitor") && roles.includes("w_history")) edge("w_monitor", "w_history");
  if (roles.includes("w_conversation") && roles.includes("w_edit")) edge("w_edit", "w_conversation", "navigate", "Send and open conversation");
  if (roles.includes("w_select") && pattern === "transact") {
    if (roles.includes("w_edit")) edge("w_select", "w_edit", "navigate", "Continue with selection");
    else if (roles.includes("w_review")) edge("w_select", "w_review", "navigate", "Review selection");
  }
  // A review commits to an outcome; an editor saves to review when needed, otherwise to an outcome.
  if (roles.includes("w_review") && roles.includes("w_outcome")) edge("w_review", "w_outcome", "navigate", "Confirm and view result");
  if (roles.includes("w_edit") && pattern === "transact") {
    if (roles.includes("w_review")) edge("w_edit", "w_review", "navigate", "Review draft");
    else if (roles.includes("w_outcome")) edge("w_edit", "w_outcome", "navigate", "Save and view result");
  }
  // No phantom receipt: a non-anchor outcome requires a preceding review/editor, otherwise omit it.
  if (roles.includes("w_outcome") && aliases.w_outcome !== "first" && !roles.includes("w_review") && !roles.includes("w_edit")) {
    map.nodes = map.nodes.filter((n) => n.id !== "w_outcome"); roles.splice(roles.indexOf("w_outcome"), 1); delete aliases.w_outcome;
    receipts.push("Omitted standalone Result: no represented task commits to an outcome.");
  }
  for (const id of roles) {
    const at = canonical(id);
    if (at === "first") continue;
    edge(at, map.home, "back");
    if (!supportedPath(map, map.home, at)) edge(map.home, at);
  }
  // Commit routes replace terminal commit actions, rather than allowing confirmation to bypass Result.
  for (const id of ["w_review", "w_edit"]) if (roles.includes(id)) {
    const n = map.nodes.find((n) => n.id === canonical(id))!;
    if (n.id === "first" && !plannedAnchor) continue;
    const forward = n.actions.find((a) => a.kind === "navigate" && [canonical("w_outcome"), canonical("w_review")].includes(a.target ?? ""));
    if (forward) {
      const terminal = n.actions.find((a) => a.kind === "complete" && (a.id === "local" || a.sourceLink === "primary"));
      if (terminal) { const index = n.actions.indexOf(forward); n.actions.splice(index, 1); terminal.kind = "navigate"; terminal.target = forward.target; terminal.label = forward.label; }
    }
  }
  for (const c of WHOLE_CANDIDATES) {
    const requested = answers[`use_${c.id}`].choice;
    const actual = !roles.includes(c.id) ? "omit" : aliases[c.id] === "first" ? "first" : "separate";
    if (requested !== actual) receipts.push(`${c.id}: decision ${requested}, assembled ${actual} after anchor identity and workflow constraints.`);
  }
  for (const n of map.nodes) n.actions = n.actions.filter((a) => !a.target || map.nodes.some((m) => m.id === a.target));
  return { map: GRAPH.parse(map), aliases, roles, activity, pattern, receipts };
}
export function neutralJourneys(plan: NeutralPlan): JourneyReview[] {
  const { map, aliases } = plan;
  // Always critique the requested task. It can never disappear when optional roles are pruned.
  const first = map.nodes.find((n) => n.id === "first")!;
  const primary = first.actions.find((a) => a.sourceLink === "primary");
  const completion = ["first"];
  if (plan.pattern === "transact" || plan.roles.some((r) => ["w_select", "w_edit", "w_review"].includes(r) && aliases[r] === "first") && plan.roles.includes("w_outcome")) {
    const order = [...new Set(PATTERNS.transact.map((r) => `w_${r}`).filter((r) => plan.roles.includes(r)).map((r) => aliases[r]))];
    let at = order.indexOf("first");
    while (at >= 0 && at < order.length - 1) {
      const from = order[at], to = order[++at];
      if (!map.nodes.find((n) => n.id === from)!.actions.some((a) => a.kind === "navigate" && a.target === to)) break;
      if (!completion.includes(to)) completion.push(to); else break;
    }
  } else if (primary?.target && primary.target !== map.home) completion.push(primary.target);
  if (completion.length === 1 && ["inspect", "select", "communicate"].includes(plan.pattern)) {
    const destination = plan.pattern === "communicate" ? aliases.w_conversation : aliases.w_detail;
    if (destination && destination !== "first" && first.actions.some((a) => a.kind === "navigate" && a.target === destination)) completion.push(destination);
  }
  const start = supportedPath(map, map.home, "first");
  const result: JourneyReview[] = [{ id: "requested", task: `Complete the original requested task: ${first.label}`, owner: "first", path: start ? [...start, ...completion.slice(1)] : null, returnPath: supportedPath(map, completion.at(-1)!, map.home), activity: first.actions.filter((a) => !["back", "remove"].includes(a.kind)).map((a) => a.label).join("; ") || "Use observed controls", activityAvailable: !!first.actions.length }];
  for (const role of plan.roles) {
    const id = aliases[role]; if (id === "first") continue;
    const n = map.nodes.find((n) => n.id === id)!;
    const forward = n.actions.find((a) => a.kind === "navigate");
    const end = forward?.target ?? id, entry = supportedPath(map, map.home, id);
    result.push({ id: role, task: `${n.label}: ${n.purpose}`, owner: id, path: entry ? [...entry, ...(forward?.target ? [forward.target] : [])] : null, returnPath: supportedPath(map, end, map.home), activity: n.actions.find((a) => a.id === "local")?.label ?? forward?.label ?? "Inspect this responsibility", activityAvailable: n.actions.length > 0 });
  }
  return result;
}
export function neutralCritiqueQuestions(journeys: JourneyReview[]): Questions {
  const q: Questions = {};
  const context = "Critique ONE fully specified possible IA against the original prompt. A compact instrument need not grow into a platform. Judge the requested task AND the surrounding app implied by it. A settings screen still belongs to an app whose primary work must exist. Avoid unrelated ideal-product features. Model probabilities are evidence, not a confidence gate. Do not treat first as settings unless its actual responsibility is preferences. A path alone is insufficient: inspect local actions and progression.";
  for (const j of journeys) q[`journey_${j.id}`] = choice({ context, question: `Task: ${j.task}. Actual path: ${j.path?.join(" → ") ?? "NONE"}. Activity: ${j.activity}. Return: ${j.returnPath?.join(" → ") ?? "NONE"}. Is this task supported by this proposed IA?` }, {
    works: "The concrete responsibility and journey work for this proposed app.",
    ...(j.id !== "requested" ? { unnecessary: "This supporting responsibility is irrelevant or adds a duplicate task; prune it if retained tasks remain possible." } : {}),
    wrong_scope: "The responsibility or action does not match the user's task.", missing: "A necessary action or step for THIS task is absent.", unknown: "Cannot establish whether this concrete task works.",
  });
  q.coverage = choice({ context, question: "Does this proposal support the originally requested task, the primary work of its implied surrounding app, and necessary entry, completion and return paths without domain-inappropriate responsibilities or duplicate first screens? Optional product features are not required for a possible resolved IA." }, { works: "The bounded task and necessary paths are represented coherently.", missing: "A step necessary for the requested task is absent.", conflict: "A responsibility or transition contradicts the requested domain or duplicates the first task.", unknown: "The provided plan is insufficient to judge." });
  return q;
}
export function reviewNeutral(plan: NeutralPlan, answers: Answers, seed: Seed) {
  const journeys = neutralJourneys(plan).map((j) => { const a = answers[`journey_${j.id}`]; if (!a) throw new Error(`Missing ${j.id} critique`); return { ...j, verdict: a.choice, p: a.probabilities[a.choice], probabilities: a.probabilities }; });
  const findings: Finding[] = validateMap(plan.map, seed);
  const prune: string[] = [];
  for (const j of journeys) {
    if (j.verdict === "works" && j.path && j.returnPath && j.activityAvailable) continue;
    if (j.verdict === "unnecessary" && j.id !== "requested") prune.push(j.id);
    else findings.push({ id: `journey:${j.id}`, severity: "uncertain", detail: `${j.task}: ${j.verdict}.`, p: j.p });
  }
  const a = answers.coverage;
  if (a.choice !== "works") findings.push({ id: "coverage", severity: "uncertain", detail: `Bounded task coverage: ${a.choice}.`, p: a.probabilities[a.choice] });
  return { journeys, findings, prune, coverage: { verdict: a.choice, p: a.probabilities[a.choice], probabilities: a.probabilities } };
}
