// Tells the server what the person did (shared/activity.ts), a few actions at a time: every five seconds, or twenty
// at once, or as the page is hidden or left. A browser is known by an id of its own kept in localStorage, so that
// a visit before signing in and the sign-in after it are the same person's; each page load is a visit. Each action
// says who was signed in when it happened (`uid`), and the batch carries the same token every other request does:
// the server keeps the uid only where the token proves it, so an action is never put down to whoever happens to be
// signed in when its batch goes. Sending is best effort: an action that does not arrive is lost, and nobody is told.
//
// On a developer's machine nothing is sent; each action is written to the console instead.

import type { Activities, ActivityName, Primitive } from "../shared/activity.js";

const STORED_VISITOR = "jev2ui.visitor";

function remembered(): { visitor: string; returning: boolean } {
  try {
    const known = localStorage.getItem(STORED_VISITOR);
    if (known) return { visitor: known, returning: true };
    const visitor = crypto.randomUUID();
    localStorage.setItem(STORED_VISITOR, visitor);
    return { visitor, returning: false };
  } catch {
    return { visitor: crypto.randomUUID(), returning: false };
  }
}

const { visitor, returning } = remembered();
const visit = crypto.randomUUID();
/** Every request says which browser and visit it is from (session.ts), so that what the server logs of it, a model that failed, is theirs too. */
export const visitHeaders = { "X-Visitor": visitor, "X-Visit": visit };
let seq = 0;
let queue: Array<Record<string, Primitive | undefined>> = [];
let timer: ReturnType<typeof setTimeout> | undefined;
/** The signed-in person's ID token (session.ts says how to get one), and the last one got, for a page that is going away and cannot wait. */
let token: () => Promise<string | undefined> = async () => undefined;
let lastToken: string | undefined;
/** Who the page thinks is there, said with every action, and whose uid it is if anyone's: session.ts says. */
let context: () => Record<string, Primitive> = () => ({});

export function recordWith(given: { token: typeof token; context: typeof context }) {
  token = given.token;
  context = given.context;
}

export function record<N extends ActivityName>(name: N, fields: Activities[N]) {
  const action = { name, at: new Date().toISOString(), seq: ++seq, ...context(), ...fields };
  if (import.meta.env.DEV) return void console.debug("activity", action);
  queue.push(action);
  if (queue.length >= 20) void send();
  else timer ??= setTimeout(send, 5000);
}

/** Sends what is queued now, with the token of whoever is signed in now: before they sign out, say. */
export const sendNow = () => send();

async function send(leaving = false) {
  clearTimeout(timer);
  timer = undefined;
  if (!queue.length) return;
  const events = queue;
  queue = [];
  if (!leaving) lastToken = await token().catch(() => undefined);
  // keepalive lets the request outlive the page, as sendBeacon would, and still say who is asking.
  void fetch("/api/activity", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...(lastToken ? { Authorization: `Bearer ${lastToken}` } : {}) },
    body: JSON.stringify({ visitor, visit, events }),
  }).catch(() => undefined);
}

addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void send());
addEventListener("pagehide", () => void send(true));

record("visit", {
  entry: new URLSearchParams(location.search).has("app") ? "link" : "home",
  page: location.pathname,
  view: location.hash.slice(1).split("/")[0] || "chat",
  width: innerWidth,
  returning,
  referrer: document.referrer ? new URL(document.referrer).host : "",
  // A browser driven by a script says so: a test, or a bot.
  automated: navigator.webdriver,
});
