// Saved apps (shared/saved.ts), kept in Firestore: `apps/<id>` says whose it is and who may open it, and under it
// `parts` holds the app itself, a document for the design and one for each screen, since a document holds a
// megabyte and an app that has been tapped through for a while is more than that.
//
// The id is a hash of the app and of who saved it, so it cannot be guessed, the same session saved twice is one
// app, and nobody's save lands on somebody else's. Opening one needs no name if its owner shares it by link:
// reading costs the models nothing. What a browser sends to be saved has been out of our hands, and other
// people will open it, so its baked components are checked as a shelf is (mock/bake.ts); the rest is text and
// trees, which the renderer escapes and draws and does not run.

import { createHash } from "node:crypto";
import { SAVED_APP, type SavedAbout, type SavedApp, type SavedScreen, type Visibility } from "../shared/saved.js";
import type { Person } from "./auth.js";
import { shelfFrom } from "./mock/bake.js";
import { commit, list, read, update, where } from "./store.js";

/** What a Firestore document holds, less room for the rest of it. */
const LARGEST_PART = 1_000_000;

const about = (id: string, data: Record<string, any>, person: Person | undefined): SavedAbout => ({
  id,
  title: String(data.title ?? ""),
  name: String(data.name ?? ""),
  palette: Array.isArray(data.palette) ? data.palette.map(String) : [],
  owner: String(data.ownerName || data.ownerEmail || ""),
  visibility: data.visibility === "link" ? "link" : "private",
  created: String(data.created ?? ""),
  screens: Number(data.screens ?? 0),
  mine: Boolean(person && data.owner === person.uid),
});

/** Saves what a browser sent, answering its id; or says what is wrong with it. */
export async function save(person: Person, sent: unknown): Promise<{ id: string } | { wrong: string }> {
  const parsed = SAVED_APP.safeParse(sent);
  if (!parsed.success) return { wrong: parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  const app = parsed.data;
  const ids = new Set(app.screens.map((screen) => screen.id));
  if (ids.size !== app.screens.length || !app.stack.every((id) => ids.has(id))) return { wrong: "its screens do not add up" };
  for (const screen of app.screens)
    for (const message of screen.messages) {
      if (!message.defineComponent) continue;
      const { surfaceId, ...baked } = message.defineComponent as Record<string, unknown>;
      if (!shelfFrom([baked]).length) return { wrong: `the component on "${screen.title}" is not what it says it is` };
    }

  const { screens, ...head } = app;
  // Walking around an app makes nothing, so where the person stood when they saved is no part of what the app is.
  const id = createHash("sha256").update(person.uid).update("\0").update(JSON.stringify({ ...app, stack: [] })).digest("base64url").slice(0, 22);
  const parts = [{ name: "head", json: JSON.stringify(head) }, ...screens.map((screen) => ({ name: `s${screen.id}`, json: JSON.stringify(screen) }))];
  const big = parts.find((part) => Buffer.byteLength(part.json) > LARGEST_PART);
  if (big) return { wrong: big.name === "head" ? "its DESIGN.md is too long to save" : "one of its screens is too large to save" };

  // Saved before, it is there already, and may have been shared since: leave what is beside it alone.
  if (!(await read(`apps/${id}`))) {
    // What the library draws a tile from: the first screen's title, and the colours the app is painted with.
    const vars = ((app.design.report as { theme?: { vars?: Record<string, string> } } | undefined)?.theme?.vars ?? {}) as Record<string, string>;
    const palette = ["--k-page", "--k-card", "--k-text", "--k-accent", "--k-border"].map((name) => String(vars[name] ?? "").slice(0, 80));
    const beside = { owner: person.uid, ownerEmail: person.email ?? "", ownerName: person.name ?? "", title: app.app.slice(0, 160), name: (screens[0]?.title ?? "").slice(0, 160), palette: palette.every(Boolean) ? palette : [], visibility: "private", created: new Date().toISOString(), screens: screens.length };
    await commit([{ path: `apps/${id}`, data: beside }, ...parts.map((part) => ({ path: `apps/${id}/parts/${part.name}`, data: { json: part.json } }))]);
  }
  return { id };
}

const ID = /^[A-Za-z0-9_-]{22}$/;

/** The app, for someone who may open it: its owner, or anyone if it is shared by link. For anyone else there is no such app. */
export async function open(id: string, person: Person | undefined): Promise<{ about: SavedAbout; app: SavedApp } | undefined> {
  if (!ID.test(id)) return undefined;
  const beside = (await read(`apps/${id}`))?.data;
  if (!beside || (beside.visibility !== "link" && beside.owner !== person?.uid)) return undefined;
  const parts = new Map((await list(`apps/${id}/parts`)).map((part) => [part.id, JSON.parse(String(part.data.json))]));
  const head = parts.get("head");
  if (!head) return undefined;
  parts.delete("head");
  const screens = ([...parts.values()] as SavedScreen[]).sort((a, b) => a.id - b.id);
  return { about: about(id, beside, person), app: { ...head, screens } };
}

/** What the person has saved, newest first. */
export async function mine(person: Person): Promise<SavedAbout[]> {
  const found = await where("apps", "owner", person.uid, ["owner", "ownerEmail", "ownerName", "title", "name", "palette", "visibility", "created", "screens"]);
  return found.map(({ id, data }) => about(id, data, person)).sort((a, b) => b.created.localeCompare(a.created));
}

/** Whether the app is the person's to change; an admin may remove anyone's. */
async function owns(id: string, person: Person, admin = false): Promise<boolean> {
  if (!ID.test(id)) return false;
  const beside = (await read(`apps/${id}`))?.data;
  return Boolean(beside && (beside.owner === person.uid || admin));
}

/** Shares the app by link, or stops sharing it. False: it is not theirs to say. */
export async function share(id: string, person: Person, visibility: Visibility): Promise<boolean> {
  if (!(await owns(id, person))) return false;
  await update(`apps/${id}`, { visibility });
  return true;
}

export async function forget(id: string, person: Person, admin: boolean): Promise<boolean> {
  if (!(await owns(id, person, admin))) return false;
  const parts = await list(`apps/${id}/parts`);
  await commit([], [...parts.map((part) => `apps/${id}/parts/${part.id}`), `apps/${id}`]);
  return true;
}
