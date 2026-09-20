// Constructed journeys, labelled before asking either endpoint. Expectations never enter model state.
export interface Place {
  id: string;
  title: string;
  shows: string;
  /** Actual saved component tree and final data, when this is a captured screen. */
  content?: { data: Record<string, unknown>; components: Record<string, unknown>[] };
  /** Original generation evidence for the observer only, never sent to the critic. */
  generation?: { plan?: Record<string, unknown>; request: unknown; log: unknown[] };
}

export type Relation = "starts" | "advances" | "narrows" | "returns" | "in_place" | "repeats" | "unknown";
export type Repair = "keep" | "remove" | "reuse" | "inspect";

export interface Hop {
  action: string;
  to: Place;
  expected: { relation: Relation; repair: Repair };
}

export interface JourneyCase {
  id: string;
  title: string;
  app: string;
  goal: string;
  start: Place;
  existing?: Place[];
  /** Observed transitions before the part under critique; not analyst summaries. */
  history?: Array<{ from: Place; action: string; to: Place }>;
  hops: Hop[];
}

const place = (id: string, title: string, shows: string): Place => ({ id, title, shows });
const hop = (action: string, to: Place, relation: Relation, repair: Repair = "keep"): Hop => ({ action, to, expected: { relation, repair } });
const home = place("home", "Home", "Upcoming walks and a Settings gear.");
const settings = place("settings", "Settings", "App-wide preferences: notifications, privacy, account. A Settings gear in the top bar.");
const notifications = place("notifications", "Notification settings", "Only notification preferences: email and push toggles. A Back arrow.");
const bookings = place("bookings", "Bookings", "Upcoming bookings and an Add booking (+) action.");
const draft = place("draft", "Add booking", "An unsaved booking for Alex. Fields for date and time, Add guest, Continue, and a top-bar +. No booking has been submitted.");
const review = place("review", "Review booking", "Draft booking for Alex, tomorrow at 10am, $25. All required details collected. Confirm booking and Edit details actions. Nothing submitted yet.");
const receipt = place("receipt", "Booking confirmed", "Booking #42 for Alex, tomorrow at 10am, $25, successfully submitted. Book another action.");
const app = "Book dog walks, manage bookings, and configure app preferences.";

export const CASES: JourneyCase[] = [
  { id: "settings-regress", title: "A gear opens more Settings", app, goal: "Change app preferences", start: home,
    hops: [hop("Settings gear", settings, "starts"), hop("Settings gear", place("settings-2", "Preferences", "The same app-wide notification, privacy and account preferences. Nothing is narrower or changed. Another gear."), "repeats", "remove")] },
  { id: "booking-regress", title: "A plus opens another Add booking", app, goal: "Create one booking for Alex", start: bookings,
    hops: [hop("Add booking (+)", draft, "starts"), hop("Top-bar +", place("draft-2", "New reservation", "The same unsubmitted booking for Alex, with the same date and time fields. No details added or task advanced. Another + in the top bar."), "repeats", "remove")] },
  { id: "settings-scope", title: "Settings legitimately narrows its scope", app, goal: "Change push notifications", start: settings,
    hops: [hop("Notifications", notifications, "narrows")] },
  { id: "nested-create", title: "Add booking can legitimately add a guest", app, goal: "Include a guest on the current booking", start: draft,
    hops: [hop("Add guest (+)", place("guest", "Add guest", "A name and email form for a guest on the existing booking draft. It does not create a second booking."), "narrows")] },
  { id: "complete-and-repeat", title: "Finish a booking, then intentionally book another", app, goal: "Complete a booking, then make a separate booking", start: draft,
    hops: [hop("Continue", review, "advances"), hop("Confirm booking", receipt, "advances"), hop("Book another", place("draft-new", "Add booking", "A fresh empty booking draft. Booking #42 remains successfully submitted. This is a separate booking explicitly requested after completion."), "starts")] },
  { id: "review-regress", title: "Confirmation keeps postponing completion", app, goal: "Submit the fully reviewed booking", start: review,
    hops: [hop("Confirm booking", place("review-again", "Final review", "Identical booking details for Alex, tomorrow at 10am, $25. Nothing was submitted. No new information, authorization, or decision is required. Another Confirm booking button appears."), "repeats", "remove")] },
  { id: "existing-profile", title: "Two entry points should share one profile", app, goal: "Read Alex's walker profile", start: place("discover", "Discover", "A list of walkers including Alex."),
    existing: [place("alex", "Alex", "Walker Alex, identity walker-17, $25 per walk, rating 4.8. Already reached from Saved.")],
    hops: [hop("Alex", place("alex-copy", "Alex's profile", "Walker Alex, identity walker-17, $25 per walk, rating 4.8. Exactly the same profile as the existing Alex destination, newly created from Discover."), "narrows", "reuse")] },
  { id: "intentional-back", title: "Returning to Settings is useful", app, goal: "Return to app-wide preferences", start: notifications, existing: [settings],
    hops: [hop("Back", settings, "returns", "reuse")] },
  { id: "in-place", title: "The same screen can represent real progress", app, goal: "Disable push notifications", start: place("push", "Notification settings", "Push notifications are on."),
    hops: [hop("Turn push notifications off", place("push", "Notification settings", "Push notifications are now off. The preference was saved immediately, with no navigation."), "in_place")] },
  { id: "unexplored", title: "An unrendered destination is unresolved", app, goal: "Configure privacy", start: settings,
    hops: [hop("Privacy", place("unrendered", "Privacy", "This destination has not been rendered or described yet. Its actual contents and behavior are unknown."), "unknown", "inspect")] },
];
