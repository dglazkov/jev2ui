// The frame of a screen, and what the writers are told. What the parts are made of,
// how they are drawn and what a writer is asked for are the file's (grammar/screen.md
// and kit.md, through src/server/grammar); the app bar, the navigation bar, a
// profile's opening, a dialog and the sticky bar are not patterns yet, so they are
// built here from the plan. Nothing here is model output.

import type { KitComponent } from "../../shared/kit.js";
import type { Block, ScreenPlan } from "./plan.js";
import { KINDS } from "./graph.js";
import type { KnownDestination } from "../../shared/identity.js";

/** Only screens about individual subjects belong in a content collection. A made
 * home, index, settings page or workflow is navigation, not another content item. */
export function knownSubjects(catalog: KnownDestination[] | undefined, destination: string) {
  return catalog?.filter((c) => c.id !== destination && c.rendered && ["detail", "guide"].includes(c.rendered.archetype)).map((c) => c.rendered!);
}

const at = (path: string) => ({ path });
type C = KitComponent;

/** The whole tree: the frame, from the plan, around the parts, which the file drew (grammar/screen.md, kit.md). */
export function screen(plan: ScreenPlan, screenIcon: string | null, blocks: C[]): C[] {
  const shape = KINDS[plan.archetype];
  const sticky = shape.stickyActions && plan.blocks.includes("actions");
  const inBody = plan.blocks.filter((b) => !(sticky && b === "actions"));

  if (shape.dialog) {
    const icon = plan.icons && screenIcon;
    return [
      { id: "root", component: "Screen", body: "dialog", dialog: true },
      { id: "dialog", component: "Card", child: "dialog_body" },
      { id: "dialog_body", component: "Stack", gap: "md", children: [...(icon ? ["dialog_icon"] : []), "dialog_title", ...inBody] },
      ...(icon ? [{ id: "dialog_icon", component: "Icon", name: icon, boxed: true } as C] : []),
      { id: "dialog_title", component: "Text", role: "headline", text: at("/header/title") },
      ...blocks,
    ];
  }

  // A feed, a dashboard and a settings page are named by their bar; the others earn a line of introduction.
  // A profile opens with the person instead, and a lead photograph would compete with them.
  const outcome = shape.outcome;
  const intro = !plan.person && !outcome && !["feed", "dashboard", "settings"].includes(plan.archetype);
  const body = [...(plan.person ? ["person"] : []), ...(outcome ? ["outcome"] : []), ...(intro ? ["intro"] : []), ...inBody.filter((b) => !(plan.person && b === "hero"))];
  return [
    { id: "root", component: "Screen", appBar: "appbar", body: "body", ...(sticky ? { sticky: "sticky" } : {}), ...(plan.topLevel ? { navBar: "navbar" } : {}) },
    {
      id: "appbar",
      component: "AppBar",
      // On a profile the person is the title.
      ...(plan.person || outcome ? {} : { title: at("/header/title") }),
      leading: plan.topLevel ? "none" : plan.archetype === "form" || outcome ? "close" : "back",
      actions: plan.appBarAction ? [plan.appBarAction] : [],
    },
    { id: "body", component: "Stack", gap: "lg", children: body },
    ...(plan.person
      ? ([
          { id: "person", component: "Stack", gap: "xs", align: "center", children: ["person_avatar", "person_name", "person_line"] },
          { id: "person_avatar", component: "Avatar", name: at("/header/title"), url: at("/person/imageUrl"), size: 88 },
          { id: "person_name", component: "Text", role: "headline", text: at("/header/title") },
          { id: "person_line", component: "Text", tone: "muted", text: at("/header/subtitle") },
        ] as C[])
      : []),
    ...(outcome
      ? ([
          { id: "outcome", component: "Stack", gap: "sm", align: "center", children: [...(plan.icons && screenIcon ? ["outcome_icon"] : []), "outcome_title", "outcome_line"] },
          { id: "outcome_icon", component: "Icon", name: screenIcon ?? "check_circle", boxed: true, size: 32 },
          { id: "outcome_title", component: "Text", role: "headline", text: at("/header/title") },
          { id: "outcome_line", component: "Text", tone: "muted", text: at("/header/subtitle") },
        ] as C[])
      : []),
    ...(intro ? [{ id: "intro", component: "Text", tone: "muted", text: at("/header/subtitle") } as C] : []),
    ...(sticky ? [{ id: "sticky", component: "StickyBar", child: "actions" } as C] : []),
    ...(plan.topLevel ? [{ id: "navbar", component: "NavBar", items: at("/nav/items"), active: at("/nav/active"), icons: plan.icons } as C] : []),
    ...blocks,
  ];
}

// --- What Gemini is asked to write ----------------------------------------------

export type Part = "header" | "nav" | Exclude<Block, "hero" | "custom">;

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

export function partPrompt(description: string, part: Part, plan: ScreenPlan | null, setting: Setting, agreeWith?: unknown): string {
  const { voice } = setting;
  const journey = setting.app ? `The first screen designed for this app was: ${setting.app}\nThe person got to the screen you are writing for by ${setting.reachedBy}.\n` : "";
  const about = setting.about ? `What the previous screen already showed about this, which this screen must agree with and build on:\n${JSON.stringify(setting.about)}\n` : "";
  const parts = plan ? `The screen is a ${plan.archetype} screen with these parts: header, ${plan.blocks.join(", ")}.\n` : "";
  // The Overview of a DESIGN.md describes the brand; the words should sound like it.
  // Voice goes first, as background, and the subject goes last, next to the instruction. The other way round, a small
  // model writes about the brand's metaphor (gummies, signal boxes) instead of about the app.
  const brand = voice ? `Background, the brand's voice. Take the tone from it and nothing else. Its metaphors are not the subject:\n${voice}\n\n` : "";
  const given = agreeWith ? `Already on the screen, which your figures must agree with:\n${JSON.stringify(agreeWith)}\n` : "";
  const known = setting.knownScreens?.length && (part === "list" || part === "groups") ? `Existing screens in this prototype have already established these subjects and facts:\n${JSON.stringify(setting.knownScreens)}\nWhen this collection includes those kinds of subjects, include the relevant existing subjects using their exact established titles and consistent facts. Give them priority over inventing similar replacements; additional distinct subjects are welcome. These are content references, not a menu of app screens: do not turn settings, home or other navigation destinations into content items.\n` : "";
  const subject = `Every name, figure and label must be about what this app is actually for${setting.app ? ` ("${setting.app}")` : ""}, as its real users would see it.`;
  return `${brand}${journey}${parts}${about}${given}${setting.architecture ?? ""}Screen description: ${description}\n${known}${subject}\nWrite the "${part}" part.`;
}
