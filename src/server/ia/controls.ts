import { choice, type Questions } from "@typesafe-ai/sdk";
import type { A2uiMessage } from "../../shared/events.js";
import { ROUTES, type Architecture, type ScreenRoutes, type ObservedControl, architectureNav, mappedControl } from "../../shared/architecture.js";
import type { AskArchitecture } from "./live.js";
import { validateAnswers } from "./decisions.js";


import { screenContents } from "../../shared/screen-content.js";
export { screenContents } from "../../shared/screen-content.js";

export function controlsFor(messages: readonly A2uiMessage[]): ObservedControl[] {
  const { components, data } = screenContents(messages), controls: ObservedControl[] = [];
  const add = (source: string, kind: string, label: unknown, extra = {}) => controls.push({ source, kind, label: String(label ?? "").slice(0, 200), ...extra });
  const bar = components.find((c) => c.component === "AppBar");
  if (bar?.leading && bar.leading !== "none") add("back", "back", "Back");
  for (const label of bar?.actions ?? []) add(`appbar:${label}`, "appbar", label);
  for (const item of data.nav?.items ?? []) add(`nav:${item.destination}`, "nav", item.label, { target: item.destination });
  for (const [g, group] of (data.groups ?? []).entries()) for (const [r, row] of (group.rows ?? []).entries()) add(`row:/groups/${g}/rows/${r}`, "row", row.label, { control: row.control });
  for (const [i, item] of (data.list?.items ?? []).entries()) {
    add(`item:/list/items/${i}`, "item", item.title);
    if (components.some((c) => c.event === "itemAction")) add(`itemAction:/list/items/${i}`, "itemAction", `${data.list.actionLabel ?? "Open"} ${item.title}`);
  }
  if (components.some((c) => c.id === "form_submit")) add("submit:form_submit", "submit", data.form?.submitLabel);
  for (const [i, action] of (data.actions ?? []).entries()) add(`action:/actions/${i}`, "action", action.label);
  return controls;
}

export async function bindControls(state: Architecture, destination: string, messages: readonly A2uiMessage[], ask: AskArchitecture): Promise<ScreenRoutes> {
  return bindObservedControls(state, destination, controlsFor(messages), ask);
}

/** Reconnect unchanged content after a map edit; this requires no content writer. */
export async function bindObservedControls(state: Architecture, destination: string, observed: ObservedControl[], ask: AskArchitecture): Promise<ScreenRoutes> {
  const node = state.map.nodes.find((n) => n.id === destination);
  if (!node) throw new Error("Cannot bind a screen outside the app map.");
  const controls: ObservedControl[] = [...observed.filter((c) => c.kind !== "nav"), ...(observed.some((c) => c.kind === "nav") ? architectureNav(state, destination).items.map((item) => ({ source: `nav:${item.destination}`, kind: "nav", label: item.label, target: item.destination })) : [])];
  if (controls.length > 100) throw new Error("The screen exceeds the 100-control binding budget.");
  const result: ScreenRoutes = { revision: state.revision, observed: controls, controls: {}, findings: [] };
  const questions: Questions = {};
  const options = Object.fromEntries(node.actions.map((action, i) => [`a${i}`, `${action.label}: ${action.kind}${action.target ? ` to ${state.map.nodes.find((n) => n.id === action.target)!.label} (${state.map.nodes.find((n) => n.id === action.target)!.purpose})` : " on this screen"}`]));
  for (const [i, c] of controls.entries()) {
    const mapped = mappedControl(state, destination, c);
    if (mapped) result.controls[c.source] = mapped;
    else questions[`c${i}`] = choice({ context: "Bind a rendered control to this screen's existing map actions. Choose only the action that has the same responsibility, subject, and task stage. A path existing does not make it the right destination. Different individual settings, records or people must not be silently collapsed into one generic page. Do not turn navigation into an in-place action merely because the map is missing its destination. Once bound, the action opens its canonical destination; generated display labels do not create separate screen identities.", question: `Control ${c.source}: ${c.label} (${c.kind}${c.control ? `, ${c.control}` : ""}). What does it do?` }, {
      ...options, in_place: "Actually operates or selects within the current screen; opens no page.", complete: "Completes a local task with no following screen.", remove: "Redundant entry to the screen already showing; remain on this same screen.", outside: "No represented action matches, or insufficient evidence. Leave this route explicitly unavailable.",
    });
  }
  if (Object.keys(questions).length) {
    const response = await ask("Jev: bind screen controls", { brief: state.seed.brief, screen: node, architecture: state.map, edits: state.notes, controls }, questions);
    validateAnswers(response.answers, questions);
    for (const [i, c] of controls.entries()) {
      const answer = response.answers[`c${i}`];
      if (!answer) continue;
      const index = /^a\d+$/.test(answer.choice) ? Number(answer.choice.slice(1)) : -1;
      result.controls[c.source] = index >= 0 ? { label: c.label, kind: "action", action: node.actions[index].id } : { label: c.label, kind: answer.choice };
    }
  }
  for (const c of controls) if (result.controls[c.source]?.kind === "outside") result.findings.push(`“${c.label}” needs a destination or action the current map does not represent.`);
  return ROUTES.parse(result);
}
