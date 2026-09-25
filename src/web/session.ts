// Who is using the tool. The server says whether anyone has to sign in (/api/config, server/auth.ts); where they
// do, it is with Google, through Firebase, and every request carries the ID token that says who is asking.
// Whether the person may make anything is the server's list to say (/api/me): signed in and not on it is `stranger`.
// This is also the gate: what stands in for the tool until someone is in.

import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";
import type { Endpoint, PipelineEvent } from "../shared/events.js";
import type { IdiomId } from "../shared/idioms.js";
import { face, icon, mark } from "./chrome.js";
import { record, recordWith } from "./activity.js";

type Auth = import("firebase/auth").Auth;

const STORED_ENDPOINT = "jev2ui.endpoint";
const STORED_KEYS = "jev2ui.keys";

/** A pair of keys of the person's own: Jev decides, Gemini writes. Kept in this browser and nowhere else. */
export interface Keys {
  jev: string;
  gemini: string;
}

function storedKeys(): Keys | undefined {
  try {
    const said = JSON.parse(localStorage.getItem(STORED_KEYS) ?? "null");
    return said && typeof said.jev === "string" && typeof said.gemini === "string" && said.jev && said.gemini ? { jev: said.jev, gemini: said.gemini } : undefined;
  } catch {
    return undefined;
  }
}

class Session {
  /** `open` is a server that asks nobody to sign in. */
  state: "loading" | "out" | "stranger" | "in" | "open" = "loading";
  name = "";
  email = "";
  /** Where their picture is, as Google says; there may be none. */
  picture = "";
  /** What the list makes of the person: an admin may edit it (access.ts). */
  role = "";
  error = "";
  /** What is left of today's runs, once the server has said. */
  runs: { left: string; daily: string } | undefined;
  /** The endpoints the server has a key for (server/models.ts): with one, there is nothing to choose. */
  endpoints: Endpoint[] = ["jev"];
  /** Which of them this browser asks to answer System One; jev until the person says otherwise. */
  private wanted: Endpoint = localStorage.getItem(STORED_ENDPOINT) === "gev" ? "gev" : "jev";
  /** The idiom the app that is showing is imagined in (app.ts says; server/idioms.ts reads it off every request). */
  idiom: IdiomId = "kit";

  private auth: Auth | undefined;
  private hosts = new Set<ReactiveControllerHost>();
  private begun = false;

  /** The element is rendered again whenever the session changes. */
  attach(host: ReactiveControllerHost) {
    this.hosts.add(host);
    if (!this.begun) void this.begin();
    this.begun = true;
  }

  private set(change: Partial<Pick<Session, "state" | "name" | "email" | "picture" | "role" | "error" | "runs" | "endpoints">>) {
    const was = this.state;
    Object.assign(this, change);
    if (this.state !== was && this.state !== "loading") record("session", { role: this.role });
    for (const host of this.hosts) host.requestUpdate();
  }

  private async begin() {
    try {
      const { firebase, endpoints } = await (await fetch("/api/config")).json();
      if (Array.isArray(endpoints) && endpoints.length) this.set({ endpoints });
      // A server on a developer's machine has no sign-in, and so none of what a signed-in person sees. `?as=admin` (or maker,
      // stranger, out) stands in for one there, and only there: the server is asked nothing differently for it.
      const as = import.meta.env.DEV && !firebase ? new URLSearchParams(location.search).get("as") : null;
      if (as) {
        // `keys` (signed out, own keys), `stranger-keys`, `maker-keys` (on the list, keys remembered), `entering` (the gate's key form); `&check=ok|bad` stands in a check.
        const [who, withKeys] = (as === "keys" ? "out-keys" : as).split("-") as [string, string | undefined];
        if (withKeys) this.keys = { jev: "tsk_live_9f2a7b31c41e", gemini: "AIzaSyD4k1xQw8k" };
        if (who === "entering") this.entering = true;
        const checked = new URLSearchParams(location.search).get("check");
        if (checked) this.checked = checked === "bad" ? { at: "just now", jev: "ok", gemini: "API key not valid. Please pass a valid API key." } : { at: "just now", jev: "ok", gemini: "ok" };
        const state = who === "out" || who === "stranger" || who === "entering" ? (who === "entering" ? "out" : who) : "in";
        return this.set({ state, name: "Ada Lovelace", email: "ada@example.com", role: who === "admin" ? "admin" : who === "maker" ? "maker" : "", runs: state !== "in" ? undefined : who === "admin" ? { left: "unlimited", daily: "unlimited" } : { left: "17", daily: "25" } });
      }
      if (!firebase) return this.set({ state: "open" });
      // Only a server with sign-in has the browser fetch Firebase at all.
      const [{ initializeApp }, { getAuth, onAuthStateChanged }] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      this.auth = getAuth(initializeApp(firebase));
      onAuthStateChanged(this.auth, (user) => {
        if (!user) return this.set({ state: "out", name: "", email: "", picture: "", runs: undefined });
        this.set({ state: this.state === "in" ? "in" : "loading", name: user.displayName ?? user.email ?? "", email: user.email ?? "", picture: user.photoURL ?? "", error: "" });
        void this.fetch("/api/me")
          .then(async (response) => (response.ok ? response.json() : Promise.reject(new Error(await response.text()))))
          .then(({ role }) => this.set({ state: role ? "in" : "stranger", role: role ?? "" }))
          .catch((error) => this.set({ state: "out", error: (error as Error).message }));
      });
    } catch (error) {
      this.set({ state: "out", error: (error as Error).message });
    }
  }

  /** The endpoint every request names. One the server has no key for is not asked for: it could only fail. */
  get endpoint(): Endpoint {
    return this.endpoints.includes(this.wanted) ? this.wanted : "jev";
  }

  set endpoint(endpoint: Endpoint) {
    this.wanted = endpoint;
    localStorage.setItem(STORED_ENDPOINT, endpoint);
    this.set({});
  }

  /** The person's own keys, if this browser holds any (server/models.ts says what they are for). */
  keys: Keys | undefined = storedKeys();
  /** What the last check of the keys said: `ok`, or the service's words. */
  checked: { at: string; jev: string; gemini: string } | undefined;
  /** A check is under way. */
  checking = false;
  /** The gate is showing the key form. */
  entering = false;

  /** Whether the person's own keys are what pays: they have keys, and the list grants them nothing. The list comes first, as on the server. */
  get ownKeys() {
    return !!this.keys && (this.state === "out" || this.state === "stranger");
  }

  /** Whether the person may have things made: on the list, on a server with no list, or paying with their own keys. */
  get makes() {
    return this.state === "in" || this.state === "open" || this.ownKeys;
  }

  enter(entering: boolean) {
    record("keys", { step: entering ? "form" : "back" });
    this.entering = entering;
    this.set({ error: "" });
  }

  /** Asks the server to try each key once, and says what each service said. */
  async check(keys: Keys): Promise<{ jev: string; gemini: string }> {
    this.checking = true;
    this.set({ error: "" });
    try {
      const response = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(keys) });
      if (!response.ok) throw new Error(await response.text());
      const said = (await response.json()) as { jev: string; gemini: string };
      record("keys", { step: "checked", jev: said.jev === "ok" ? "ok" : "bad", gemini: said.gemini === "ok" ? "ok" : "bad" });
      this.checked = { at: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), ...said };
      return said;
    } finally {
      this.checking = false;
      this.set({});
    }
  }

  /** Checks the keys and, if both work, keeps them in this browser. Says whether they were kept. */
  async keep(keys: Keys): Promise<boolean> {
    keys = { jev: keys.jev.trim(), gemini: keys.gemini.trim() };
    try {
      const said = await this.check(keys);
      if (said.jev !== "ok" || said.gemini !== "ok") return false;
    } catch (error) {
      this.set({ error: (error as Error).message });
      return false;
    }
    this.keys = keys;
    localStorage.setItem(STORED_KEYS, JSON.stringify(keys));
    record("keys", { step: "saved" });
    this.entering = false;
    this.set({});
    return true;
  }

  forget() {
    record("keys", { step: "removed" });
    this.keys = undefined;
    this.checked = undefined;
    localStorage.removeItem(STORED_KEYS);
    this.set({});
  }

  async signIn() {
    if (!this.auth) return;
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    record("sign_in", { step: "started" });
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      record("sign_in", { step: "done" });
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      // Closing the window is not an error worth reporting, but it is worth counting.
      const closed = /popup-closed|cancelled-popup/.test(code);
      record("sign_in", { step: closed ? "cancelled" : "failed" });
      if (!closed) this.set({ error: (error as Error).message });
    }
  }

  async signOut() {
    record("sign_out", {});
    if (this.auth) await (await import("firebase/auth")).signOut(this.auth);
  }

  /** The signed-in person's ID token, which proves who is asking; none for anyone else. */
  async token(): Promise<string | undefined> {
    return this.auth?.currentUser?.getIdToken();
  }

  /** `fetch`, saying who is asking, which endpoint is to answer and which idiom to imagine in; and noting what the answer says is left of today's runs. */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.token();
    // The keys go only where they are what pays; the server ignores them for anyone the list grants, and so does this.
    const keys = this.ownKeys ? this.keys! : undefined;
    const response = await fetch(path, {
      ...init,
      headers: { ...init.headers, "X-System-One": this.endpoint, "X-Idiom": this.idiom, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(keys ? { "X-Jev-Key": keys.jev, "X-Gemini-Key": keys.gemini } : {}) },
    });
    const left = response.headers.get("X-Runs-Left");
    if (left !== null) this.set({ runs: { left, daily: response.headers.get("X-Runs-Daily") ?? "" } });
    return response;
  }

  /** What to show instead of the tool: what it is and a way in, or nothing, since the person may pass. */
  gate(): TemplateResult | undefined {
    if (this.makes) return undefined;
    const google = html`<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.75 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>`;
    return html`
      <main class="gate">
        <div class="gate-words">
          <p class="brand">${mark()}<b>Apparite</b></p>
          <h1>Describe what you want.<br />Get an apparition.<br />Keep changing it.</h1>
          <p class="lede">An apparition is a mock that looks like an app. Describe a screen, tap through the apparition that Apparite generates, and change it with every message. Explore an idea before you build it.</p>
          ${this.entering
            ? html`<form
                class="keys"
                @submit=${(e: Event) => {
                  e.preventDefault();
                  const form = new FormData(e.target as HTMLFormElement);
                  void this.keep({ jev: String(form.get("jev")), gemini: String(form.get("gemini")) });
                }}
              >
                <p><b>Use your own keys</b>Apparite generates screens with two services. Jev decides each screen's layout, and Gemini writes its content.</p>
                <label class="field grow">${icon("key", "s")}<input name="jev" required placeholder="Jev API key" autocomplete="off" spellcheck="false" aria-label="Jev API key" ?disabled=${this.checking} /></label>
                ${this.checked && this.checked.jev !== "ok" ? html`<p class="key-bad">${icon("error", "xs")}${this.checked.jev}</p>` : nothing}
                <a class="get" href="https://console.typesafe.ai/" target="_blank" rel="noopener">Get a Jev key at console.typesafe.ai${icon("open_in_new", "xs")}</a>
                <label class="field grow">${icon("key", "s")}<input name="gemini" required placeholder="Gemini API key" autocomplete="off" spellcheck="false" aria-label="Gemini API key" ?disabled=${this.checking} /></label>
                ${this.checked && this.checked.gemini !== "ok" ? html`<p class="key-bad">${icon("error", "xs")}${this.checked.gemini}</p>` : nothing}
                <a class="get" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a Gemini key at Google AI Studio${icon("open_in_new", "xs")}</a>
                <div class="row">
                  <button class="btn primary" type="submit" ?disabled=${this.checking}>${icon(this.checking ? "hourglass_top" : "check", "s")}${this.checking ? "Checking…" : "Check keys and start"}</button>
                  <button class="btn" type="button" ?disabled=${this.checking} @click=${() => this.enter(false)}>Back</button>
                </div>
                <p class="fine">${icon("lock", "s")}<span>Your keys stay in this browser. Apparite sends them with each request that generates a screen, and doesn't store or log them. You can change or remove them in Settings.</span></p>
              </form>`
            : html`
                ${this.state === "out" ? html`<button class="google" @click=${() => this.signIn()}>${google}Sign in with Google</button>` : nothing}
                ${this.state === "stranger"
                  ? html`<div class="stranger">
                        ${face(this)}
                        <p><b>${this.name || this.email}</b>${this.email} isn't on the access list. To get access, ask the person who shared Apparite with you to add your address.</p>
                      </div>
                      <button class="google" @click=${() => this.signOut().then(() => this.signIn())}>${google}Use another account</button>`
                  : nothing}
                ${this.state === "out" || this.state === "stranger"
                  ? html`<p class="or"><span>or</span></p>
                      <button class="btn own" @click=${() => this.enter(true)}>${icon("key", "s")}Use your own API keys</button>`
                  : nothing}
              `}
          ${this.state === "loading" ? html`<p class="fine">${icon("hourglass_top", "s")}Loading…</p>` : nothing}
          ${this.error ? html`<p class="note bad">${this.error}</p>` : nothing}
          ${this.entering
            ? nothing
            : html`<p class="fine">${icon("info", "s")}<span>Generating screens uses model capacity, so everyone on the access list has a daily run limit. With your own keys, there's no limit. You don't need to sign in to open an apparition that someone shared with you.</span></p>`}
        </div>
        <div class="gate-show" aria-hidden="true">
          <div class="device phone"><img src="/gate-screen.jpg" alt="" /></div>
          <p class="said one">Find a dog walker: nearby walkers with ratings</p>
          <p class="said two">Make it more playful</p>
        </div>
      </main>
    `;
  }
}

export const session = new Session();
recordWith({ token: () => session.token(), context: () => ({ state: session.state, keys: session.ownKeys }) });

/** Server-Sent Events over a POST, which EventSource cannot make (nor can it say who is asking). */
export async function streamEvents(body: unknown, signal: AbortSignal, onEvent: (event: PipelineEvent) => void) {
  const response = await session.fetch("/api/generate", { method: "POST", body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) throw new Error(await response.text());
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop()!;
    for (const frame of frames) if (frame.startsWith("data: ")) onEvent(JSON.parse(frame.slice(6)));
  }
}
