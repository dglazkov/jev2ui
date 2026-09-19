// Who is asking, and how much they have had today.
//
// Everyone with a Google account is let in: signing in (Firebase, in the
// browser: web/session.ts) is not a gate but a name to count against, so that
// no one person spends the keys for everybody. With no FIREBASE_PROJECT there
// is no sign-in and nothing is counted, which is how it runs on a laptop.

import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PROJECT = process.env.FIREBASE_PROJECT;
const API_KEY = process.env.FIREBASE_API_KEY;

/** How many runs (a screen made is one) a person gets in a day. */
export const DAILY_RUNS = Number(process.env.DAILY_RUNS) || 50;

/** What the browser needs to sign someone in; nothing when nobody has to. None of it is secret. */
export const firebase =
  PROJECT && API_KEY ? { apiKey: API_KEY, projectId: PROJECT, authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? `${PROJECT}.firebaseapp.com` } : undefined;

/** The keys Firebase signs ID tokens with. They rotate; jose fetches them again when it meets one it has not seen. */
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export interface Person {
  uid: string;
  email?: string;
}

/** The person an `Authorization: Bearer <Firebase ID token>` header names, or nobody: no token, or not one of ours. */
export async function whoIs(authorization: string | undefined): Promise<Person | undefined> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, keys, { algorithms: ["RS256"], audience: PROJECT, issuer: `https://securetoken.google.com/${PROJECT}` });
    return payload.sub ? { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined } : undefined;
  } catch {
    return undefined;
  }
}

// The count is this process's: one instance serves everyone (deploy.sh), and it forgets when it is replaced or
// has idled away, which makes a day's allowance a little generous and never short. A second instance would
// need the count kept somewhere both can reach.
let day = "";
const spent = new Map<string, number>();

function today(): Map<string, number> {
  const now = new Date().toISOString().slice(0, 10);
  if (now !== day) spent.clear();
  day = now;
  return spent;
}

/** How many runs the person has left today (the day turns over at midnight UTC). */
export function left(person: Person): number {
  return Math.max(0, DAILY_RUNS - (today().get(person.uid) ?? 0));
}

/** Takes one run from today's allowance, or returns false: there is none left. */
export function spend(person: Person): boolean {
  if (!left(person)) return false;
  spent.set(person.uid, (spent.get(person.uid) ?? 0) + 1);
  return true;
}
