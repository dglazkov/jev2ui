// Initial navigation shares the screen-planning request. The rest of the map is
// discovered through real links; no whole-app workflow or journey critique runs.
import { choice, type Questions } from "@typesafe-ai/sdk";
import { ARCHITECTURE, type Architecture } from "../../shared/architecture.js";
import { withCatalog } from "../../shared/catalog.js";
import { validateAnswers, type Answers } from "./decisions.js";
import { anchorMap, plannedSeed } from "./live.js";
import { WHOLE_CANDIDATES } from "./roles.js";

const candidates = WHOLE_CANDIDATES.filter((c) => ["w_collection", "w_operate", "w_monitor", "w_history", "w_conversation", "w_preferences", "w_help"].includes(c.id));
const context = "Choose only the initial main navigation for the app implied by `screen`. Do not plan the whole app or its future journeys. These choices are suggestions, not a closed set of allowed destinations. Detail pages, individual settings, editors and outcomes will be discovered when their links are clicked. Include a section only when this product needs it. Reuse the requested first screen only for exactly the same subject, scope and task; an individual setting is not the app-wide preferences overview.";

export function initialNavigationQuestions(): Questions {
  const questions: Questions = {
    nav_home: choice({ context, question: "Is the requested screen itself the app's main starting destination?" }, {
      first: "The requested home, main feed, main dashboard or self-contained instrument is already where this app starts. Reuse it as Home.",
      separate: "The requested screen is a subpage or another section. The app needs a separate Home for its primary activity.",
    }),
  };
  for (const c of candidates) questions[`nav_${c.id}`] = choice({ context, question: `Does the app need this main section: ${c.label} — ${c.purpose}?` }, {
    first: "The requested first screen is already this entire section for the same subject and scope. Reuse it.",
    separate: "A distinct main section is useful for this product. Include it in the initial navigation.",
    omit: "No separate main section is justified. It is unnecessary, belongs within Home, or is a subpage reached through content.",
  });
  return questions;
}

/** Assemble registered destinations synchronously from answers already returned with the screen plan. */
/**
 * `plan` is what the IA reads of the screen's reading: its kind, whether it is a main screen, what its custom part is for.
 * `most` is how many main destinations the frame has room for, as the grammar says: five tabs in a bar, eight sections in a pane.
 */
export function initialArchitecture(brief: string, plan: { archetype: string; topLevel: boolean; custom?: { use: string } }, answers: Answers, most = 5): Architecture {
  const questions = initialNavigationQuestions();
  validateAnswers(answers, questions);
  const seed = plannedSeed(brief, plan), map = anchorMap(seed);
  const first = map.nodes[0];
  const isHome = answers.nav_home.choice === "first";
  const aliases: Record<string, string> = {};
  if (isHome) {
    map.home = "first";
    map.nodes = [first];
    const back = first.actions.find((a) => a.sourceLink === "back")!;
    back.kind = "remove"; back.target = null;
  }
  const navigation = [map.home];
  const firstRole = candidates.find((c) => answers[`nav_${c.id}`].choice === "first");
  if (!isHome && (plan.topLevel || firstRole)) navigation.push("first");
  // Keep to what the frame has room for, choosing the strongest supported sections.
  const ranked = [...candidates].sort((a, b) => (answers[`nav_${b.id}`].probabilities.separate ?? 0) - (answers[`nav_${a.id}`].probabilities.separate ?? 0));
  for (const c of ranked) {
    const answer = answers[`nav_${c.id}`].choice;
    if (answer === "first") { aliases[c.id] = "first"; continue; }
    if (answer !== "separate" || navigation.length >= most) continue;
    aliases[c.id] = c.id;
    navigation.push(c.id);
    map.nodes.push({ id: c.id, label: c.label, purpose: c.purpose, actions: [{ id: "back", label: "Home", kind: "back", target: map.home, sourceLink: null }] });
  }
  const home = map.nodes.find((n) => n.id === map.home)!;
  for (const id of navigation) {
    if (id === home.id || home.actions.some((a) => a.target === id)) continue;
    home.actions.push({ id: `to_${id}`, label: map.nodes.find((n) => n.id === id)!.label, kind: "navigate", target: id, sourceLink: null });
  }
  // Navigation labels remain readable before the header supplies the actual title.
  first.label = isHome ? "Home" : firstRole?.label ?? "First screen";
  map.boundary = "Initial navigation; further destinations are registered as links are explored.";
  const storedAnswers = Object.fromEntries(Object.keys(questions).map((id) => [id, answers[id]]));
  if (firstRole) storedAnswers.anchor = { choice: firstRole.id, probabilities: { [firstRole.id]: 1 } };
  return ARCHITECTURE.parse(withCatalog({ version: 1, revision: 1, seed, map, navigation, aliases, roles: Object.keys(aliases), answers: storedAnswers,
    activity: seed.links[0].label, pattern: "discovered", receipts: [], notes: [], status: "ready", findings: [], ms: 0 }));
}
