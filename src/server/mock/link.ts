// From a tap to the description of the screen it leads to. No model is involved:
// Preserve what was tapped so the existing planner can interpret what comes next.
// The description then goes through the same planning as one a developer typed,
// with the journey alongside it so that Jev knows where the person came from.

import type { Journey } from "../../shared/journey.js";
import type { DestinationEvidence } from "../../shared/identity.js";

/** Home is a product experience; routing responsibilities are not its content. */
export function homeTask(app: string): string {
  return `Home: the main screen of the product introduced by this brief: "${app}". The brief describes the starting screen, not the contents of Home. Show the product's actual content and primary activity, with concrete subjects people came to use, browse or resume. Give visual content a prominent featured hero and supporting items when appropriate to the product. Navigation belongs in the navigation controls; the body should not be a directory of app pages or a reproduction of the starting screen.`;
}

export interface Destination {
  /** Reads like something a developer would have typed. */
  screen: string;
  reachedBy: string;
  /** Material: a navigation bar on top-level destinations only, a way back everywhere else. Unset where how the person got here does not say, and Jev does. */
  topLevel?: boolean;
  /** The kinds of screen this can be, when how the person got here rules the others out. */
  among?: string[];
  /** What is already known about the thing this screen is about; the writers must agree with it. */
  about?: Record<string, unknown>;
}

const APP_BAR: Record<string, string> = {
  search: "Search: find anything in the app, with recent searches and suggestions",
  settings: "Settings for the app",
  notifications: "Notifications: recent alerts and updates for this person",
  add: "Create a new entry",
  edit: "Edit what this screen shows",
  share: "Share this with someone",
  favorite: "Saved items: everything this person has marked as a favourite",
  more_vert: "More options for this screen",
};

export function destination({ app, from, via }: Journey): Destination {
  const here = `the "${from.title}" screen`;
  const title = String(via.data?.title ?? via.data?.label ?? via.label);
  switch (via.kind) {
    case "item":
      return { screen: `${title}: the page for this one item`, reachedBy: `tapping the item "${title}" in the list on ${here}`, topLevel: false, about: via.data };
    case "itemAction":
      return { screen: `${via.label} "${title}"`, reachedBy: `pressing "${via.label}" on the item "${title}" on ${here}`, topLevel: false, about: via.data };
    case "row": {
      const { control, value } = via.data ?? {};
      const screen =
        control === "value"
          ? `Choose ${title}: the available options for this one setting, with "${value}" currently chosen`
          : control === "danger"
            ? `Confirm: ${title}`
            : `${title}: the page for this one subject or task. It was selected in ${via.group ? `the "${via.group}" section of ` : ""}${here}. The selected row reads: ${JSON.stringify(Object.fromEntries(Object.entries(via.data ?? {}).filter(([key, value]) => !["imageUrl", "icon", "on", "control"].includes(key) && ["string", "number", "boolean"].includes(typeof value))))}`;
      return { screen, reachedBy: `tapping the row "${title}" on ${here}`, topLevel: false, about: via.data };
    }
    case "part":
      return { screen: `${title}: the page for this one part of the ${via.component ?? "component"} on ${here}`, reachedBy: `opening "${title}" in the ${via.component ?? "component"} on ${here}`, topLevel: false, about: via.data };
    case "nav":
      return { screen: `${via.label}: one of the main screens of the app that "${app}" belongs to`, reachedBy: `tapping "${via.label}" in the app's main navigation`, topLevel: true };
    case "appbar":
      return { screen: APP_BAR[via.label] ?? `${via.label} for ${here}`, reachedBy: `tapping the ${via.label} action in the top bar of ${here}`, topLevel: false };
    case "asked":
      // What the developer typed is the description, as it would be for a first screen; it only needs saying whose screen it is.
      return { screen: `${via.label}. This is another screen of the app that "${app}" belongs to`, reachedBy: `the app's own navigation: the developer asked for this screen after seeing ${here}` };
    case "back":
      // Only asked for when there is nothing to go back to: the session began on a sub-page. The way back from there
      // is the app's home, and a main screen has no back arrow of its own, so the chain ends here by construction.
      return {
        // A description with no subject gets filled with whatever is lying around, such as the brand's metaphor. Name the app.
        screen: `Home: the main screen that the app opens on. The app is the one this belongs to: "${app}". Home shows what that app is for; ${here} is reached from it`,
        reachedBy: `going back from ${here} to where the app starts`,
        topLevel: true,
        // An app opens on something to look through or something to glance at, never on its own settings or a form.
        among: ["feed", "dashboard"],
      };
    default:
      return {
        screen: `The outcome of "${via.label}": what the person sees once it has been done`,
        reachedBy: `pressing the "${via.label}" button on ${here}`,
        topLevel: false,
        about: via.data,
      };
  }
}

/** Older catalogs stored a layout assumption as intent. Repair that exact legacy template
 * from the recorded click, preserving the destination ID and all explicitly requested intent. */
export function destinationIntent(evidence: DestinationEvidence): string {
  if (evidence.link.kind !== "row" || !evidence.intent.endsWith(": a sub-page of settings")) return evidence.intent;
  let data: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(evidence.link.subject ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
  } catch { /* The label and section still identify the observed row. */ }
  return destination({ app: "", from: evidence.from, via: { kind: "row", label: evidence.link.label, group: evidence.link.group, data: { ...data, control: evidence.link.control ?? data?.control } } }).screen;
}
