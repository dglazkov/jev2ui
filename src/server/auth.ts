// Who is asking, what they may do, and how much of it they have had today.
//
// Signing in (Firebase, in the browser: web/session.ts) gives a request a
// name. What the name may do is on a list kept in Firestore (store.ts), which
// can be edited while the server runs: collection `access`, one document per
// grant, named by the pattern of addresses it is for.
//
//   access/*@example.com        {role: "maker", runs: 50}   everyone there makes fifty screens a day
//   access/ann@example.com      {role: "maker", runs: null} Ann, as many as she likes
//   access/bob@example.com      {role: "none"}              Bob, though, not at all
//   access/me@my.org            {role: "admin"}             may also edit this list
//
// `*` stands for anything, and of the patterns an address fits, the one that
// says the most wins: Bob's own line over his company's. Fitting none, a
// person may sign in and make nothing. A run is a screen made; the day's are
// counted in `people/<uid>`. Reading costs the models nothing and needs no
// name: only what spends does. With no FIREBASE_PROJECT there is no sign-in,
// no list and no count, which is how it runs on a laptop.

import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { count, list, read, remove, write } from "./store.js";

const PROJECT = process.env.FIREBASE_PROJECT;
const API_KEY = process.env.FIREBASE_API_KEY;

/** How many runs a day a maker gets whose grant does not say. */
export const DAILY_RUNS = Number(process.env.DAILY_RUNS) || 50;

/** What the browser needs to sign someone in; nothing when nobody has to. None of it is secret. */
export const firebase =
  PROJECT && API_KEY ? { apiKey: API_KEY, projectId: PROJECT, authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? `${PROJECT}.firebaseapp.com` } : undefined;

/** The keys Firebase signs ID tokens with. They rotate; jose fetches them again when it meets one it has not seen. */
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export interface Person {
  uid: string;
  /** Set only if Google vouches for it: it is what the list is matched against. */
  email?: string;
  name?: string;
  /** Where their picture is, as Google says. */
  picture?: string;
}

/** The person an `Authorization: Bearer <Firebase ID token>` header names, or nobody: no token, or not one of ours. */
export async function whoIs(authorization: string | undefined): Promise<Person | undefined> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, keys, { algorithms: ["RS256"], audience: PROJECT, issuer: `https://securetoken.google.com/${PROJECT}` });
    if (!payload.sub) return undefined;
    const email = payload.email_verified === true && typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
    return { uid: payload.sub, email, name: typeof payload.name === "string" ? payload.name : undefined, picture: typeof payload.picture === "string" ? payload.picture : undefined };
  } catch {
    return undefined;
  }
}

// --- The list ---------------------------------------------------------------

export interface Grant {
  pattern: string;
  role: "maker" | "admin";
  /** Runs a day; null is as many as they like. */
  runs: number | null;
}

type Line = Grant | { pattern: string; role: "none" };

/** How long an edit to the list can take to be noticed. */
const LIST_KEPT_MS = 60_000;
let kept: { at: number; lines: Line[] } | undefined;

async function lines(): Promise<Line[]> {
  if (kept && Date.now() - kept.at < LIST_KEPT_MS) return kept.lines;
  try {
    const docs = await list("access");
    kept = {
      at: Date.now(),
      lines: docs.flatMap(({ id, data }): Line[] => {
        const pattern = id.toLowerCase();
        if (data.role === "none") return [{ pattern, role: "none" }];
        if (data.role !== "maker" && data.role !== "admin") return [];
        // An admin's runs are unlimited unless the grant says otherwise; `runs: null` says unlimited for anyone.
        const runs = typeof data.runs === "number" ? data.runs : data.runs === null || data.role === "admin" ? null : DAILY_RUNS;
        return [{ pattern, role: data.role, runs }];
      }),
    };
  } catch (error) {
    // The last good reading stands, and the next request tries again.
    if (!kept) throw error;
    console.error(error);
  }
  return kept.lines;
}

const fits = (pattern: string, email: string) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(email);
/** What a pattern pins down: an address outright says more than any wildcard, and then the more letters the more said. */
const says = (pattern: string) => (pattern.includes("*") ? 0 : 1000) + pattern.replaceAll("*", "").length;

/** What the list grants this person, or nothing: on no line of it, or on one that says no. */
export async function access(person: Person): Promise<Grant | undefined> {
  if (!person.email) return undefined;
  const fitting = (await lines()).filter((grant) => fits(grant.pattern, person.email!));
  const best = fitting.sort((a, b) => says(b.pattern) - says(a.pattern))[0];
  return best && best.role !== "none" ? best : undefined;
}

// --- Editing the list (admins; http.ts asks that they are) ---------------------

/** The list as it is written, lines that grant nothing included, and everyone who has made anything. */
export async function everything() {
  const date = today();
  const [grants, people] = await Promise.all([list("access"), list("people")]);
  return {
    grants: grants.map(({ id, data }) => ({ pattern: id, role: data.role ?? null, ...("runs" in data ? { runs: data.runs } : {}), note: data.note ?? "" })),
    people: people.map(({ data }) => ({ email: data.email, name: data.name, picture: data.picture, lastSeen: data.lastSeen, today: (data.days as Record<string, number> | undefined)?.[date] ?? 0 })),
    dailyRuns: DAILY_RUNS,
  };
}

/** Writes a line of the list, or says what is wrong with it. `runs` left out is the role's usual; null is no limit. */
export async function grant(by: Person, line: { pattern?: unknown; role?: unknown; runs?: unknown; note?: unknown }): Promise<string | undefined> {
  const pattern = String(line.pattern ?? "").trim().toLowerCase();
  if (!/^(\*|[^\s/@]+@[^\s/@]+)$/.test(pattern) || pattern.length > 200) return "a pattern is an address, with * for anything: *@example.com";
  if (line.role !== "maker" && line.role !== "admin" && line.role !== "none") return "a role is maker, admin or none";
  if (line.runs !== undefined && line.runs !== null && !(Number.isInteger(line.runs) && (line.runs as number) >= 0)) return "runs is a whole number, or null for no limit";
  const data = { role: line.role, ...(line.runs !== undefined && line.role !== "none" ? { runs: line.runs as number | null } : {}), note: String(line.note ?? "").slice(0, 200), by: by.email ?? by.uid, at: new Date().toISOString() };
  await write(`access/${encodeURIComponent(pattern)}`, data);
  kept = undefined;
  return undefined;
}

export async function revoke(pattern: string): Promise<void> {
  await remove(`access/${encodeURIComponent(pattern.trim().toLowerCase())}`);
  kept = undefined;
}

// --- The count --------------------------------------------------------------

// The day's runs are counted in Firestore, so the count outlasts the process. What this process has seen of it is
// kept too, to say what is left without asking each time; with a second instance that could run behind, but the
// count itself, and so the refusal, would still be right.
let day = "";
const seen = new Map<string, number>();

/** The day turns over at midnight UTC. */
function today(): string {
  const now = new Date().toISOString().slice(0, 10);
  if (now !== day) seen.clear();
  return (day = now);
}

async function spent(person: Person): Promise<number> {
  const date = today();
  if (!seen.has(person.uid)) {
    const days = (await read(`people/${person.uid}`))?.data.days as Record<string, number> | undefined;
    seen.set(person.uid, days?.[date] ?? 0);
  }
  return seen.get(person.uid)!;
}

/** How many runs the person has left today; null is no limit. */
export async function left(person: Person, grant: Grant): Promise<number | null> {
  return grant.runs === null ? null : Math.max(0, grant.runs - (await spent(person)));
}

/** Takes one run from today's allowance, or returns false: there is none left. */
export async function spend(person: Person, grant: Grant): Promise<boolean> {
  if ((await left(person, grant)) === 0) return false;
  const date = today();
  const now = await count(`people/${person.uid}`, `days.\`${date}\``, { email: person.email ?? "", name: person.name ?? "", picture: person.picture ?? "", lastSeen: new Date().toISOString() });
  seen.set(person.uid, now);
  return grant.runs === null || now <= grant.runs;
}
