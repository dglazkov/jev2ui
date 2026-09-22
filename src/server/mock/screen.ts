// What the writers are told. What a screen is made of, how its parts and its frame
// are drawn and what a writer is asked for are the file's (grammar/screen.md and
// kit.md, through src/server/grammar).

import type { KnownDestination } from "../../shared/identity.js";
import type { Reading } from "../grammar/read.js";

/** Only screens about individual subjects belong in a content collection. A made
 * home, index, settings page or workflow is navigation, not another content item. */
export function knownSubjects(catalog: KnownDestination[] | undefined, destination: string) {
  return catalog?.filter((c) => c.id !== destination && c.rendered && ["detail", "guide"].includes(c.rendered.archetype)).map((c) => c.rendered!);
}

export const SYSTEM_PROMPT = `You write the sample content for one part of a mock-up of an app screen.
A separate system has already decided the layout and the components; you supply only the words and figures, as JSON matching the schema.
Write what the real app would show to a typical signed-in person: specific, plausible names, numbers and dates, never placeholders or lorem ipsum.
Other parts of the same screen are written separately, so stay strictly within your part and do not repeat the screen title.
Keep every string short. Do not describe the UI, do not mention buttons or layout, and do not use HTML.`;

export interface Setting {
  architecture?: string;
  voice: string;
  /** The app the screen belongs to and how the person got here, when it was reached by a tap. */
  app?: string;
  reachedBy?: string;
  about?: unknown;
  knownScreens?: Array<{ title: string; archetype: string; content: string }>;
}

export function partPrompt(description: string, part: string, reading: Pick<Reading, "kind" | "blocks"> | null, setting: Setting, agreeWith?: unknown, what = "screen"): string {
  const { voice } = setting;
  const journey = setting.app ? `The first screen designed for this app was: ${setting.app}\nThe person got to the screen you are writing for by ${setting.reachedBy}.\n` : "";
  const about = setting.about ? `What the previous screen already showed about this, which this screen must agree with and build on:\n${JSON.stringify(setting.about)}\n` : "";
  const parts = reading ? `The ${what} is a ${reading.kind} ${what} with these parts: header, ${reading.blocks.join(", ")}.\n` : "";
  // The Overview of a DESIGN.md describes the brand; the words should sound like it.
  // Voice goes first, as background, and the subject goes last, next to the instruction. The other way round, a small
  // model writes about the brand's metaphor (gummies, signal boxes) instead of about the app.
  const brand = voice ? `Background, the brand's voice. Take the tone from it and nothing else. Its metaphors are not the subject:\n${voice}\n\n` : "";
  const given = agreeWith ? `Already on the screen, which your figures must agree with:\n${JSON.stringify(agreeWith)}\n` : "";
  const known = setting.knownScreens?.length && (part === "list" || part === "groups") ? `Existing screens in this prototype have already established these subjects and facts:\n${JSON.stringify(setting.knownScreens)}\nWhen this collection includes those kinds of subjects, include the relevant existing subjects using their exact established titles and consistent facts. Give them priority over inventing similar replacements; additional distinct subjects are welcome. These are content references, not a menu of app screens: do not turn settings, home or other navigation destinations into content items.\n` : "";
  const subject = `Every name, figure and label must be about what this app is actually for${setting.app ? ` ("${setting.app}")` : ""}, as its real users would see it.`;
  return `${brand}${journey}${parts}${about}${given}${setting.architecture ?? ""}Screen description: ${description}\n${known}${subject}\nWrite the "${part}" part.`;
}
