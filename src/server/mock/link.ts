// From a tap to the description of the screen it leads to. No model is involved:
// what was tapped, and what kind of thing it was, already says what comes next.
// The description then goes through the same planning as one a developer typed,
// with the journey alongside it so that Jev knows where the person came from.

import type { Journey } from "../../shared/journey.js";

export interface Destination {
  /** Reads like something a developer would have typed. */
  screen: string;
  reachedBy: string;
  /** Material: a navigation bar on top-level destinations only, a way back everywhere else. */
  topLevel: boolean;
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

export function destination({ from, via }: Journey): Destination {
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
            : `${title}: a sub-page of settings`;
      return { screen, reachedBy: `tapping the row "${title}" on ${here}`, topLevel: false, about: via.data };
    }
    case "nav":
      return { screen: `${via.label}: one of the app's main screens`, reachedBy: `tapping "${via.label}" in the app's main navigation`, topLevel: true };
    case "appbar":
      return { screen: APP_BAR[via.label] ?? `${via.label} for ${here}`, reachedBy: `tapping the ${via.label} action in the top bar of ${here}`, topLevel: false };
    case "back":
      return { screen: `The screen that ${here} is reached from`, reachedBy: `going back from ${here}`, topLevel: false };
    default:
      return {
        screen: `The outcome of "${via.label}": what the person sees once it has been done`,
        reachedBy: `pressing the "${via.label}" button on ${here}`,
        topLevel: false,
        about: via.data,
      };
  }
}
