// How a person got to the screen being mocked. The browser keeps the session
// (the app, the screens made so far, the way back); the server is told only
// what it needs to make the next screen belong to the same app.

/** What was tapped. `data` is the data-model object behind it: the list item, the settings row. */
export interface Via {
  /** `part` is a part of a custom component that has a page of its own: a day on a calendar, a room on a plan. */
  kind: "item" | "itemAction" | "row" | "nav" | "appbar" | "action" | "submit" | "back" | "part";
  /** For a `part`: the name of the component it is a part of. */
  component?: string;
  label: string;
  data?: Record<string, unknown>;
  index?: number;
}

export interface Journey {
  /** The description the session started from: what app this is. */
  app: string;
  from: { title: string; archetype: string };
  via: Via;
  /** The app's main destinations, once some screen has established them. Reused, never rewritten. */
  nav?: { items: Array<{ label: string; icon?: string }> };
}
