// Who is using the tool. The server says whether anyone has to sign in (/api/config, server/auth.ts); where they
// do, it is with Google, through Firebase, and every request carries the ID token that says who is asking.
// Whether the person may make anything is the server's list to say (/api/me): signed in and not on it is `stranger`.
// This is also the gate: what stands in for the tool until someone is in.

import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";
import type { Endpoint, PipelineEvent } from "../shared/events.js";
import { face, icon, mark } from "./chrome.js";

type Auth = import("firebase/auth").Auth;

const STORED_ENDPOINT = "jev2ui.endpoint";

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
    Object.assign(this, change);
    for (const host of this.hosts) host.requestUpdate();
  }

  private async begin() {
    try {
      const { firebase, endpoints } = await (await fetch("/api/config")).json();
      if (Array.isArray(endpoints) && endpoints.length) this.set({ endpoints });
      // A server on a developer's machine has no sign-in, and so none of what a signed-in person sees. `?as=admin` (or maker,
      // stranger, out) stands in for one there, and only there: the server is asked nothing differently for it.
      const as = import.meta.env.DEV && !firebase ? new URLSearchParams(location.search).get("as") : null;
      if (as) return this.set({ state: as === "out" || as === "stranger" ? as : "in", name: "Ada Lovelace", email: "ada@example.com", role: as === "admin" ? "admin" : "maker", runs: as === "out" || as === "stranger" ? undefined : as === "admin" ? { left: "unlimited", daily: "unlimited" } : { left: "17", daily: "25" } });
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

  /** Whether the person may have things made: on the list, or on a server with no list. */
  get makes() {
    return this.state === "in" || this.state === "open";
  }

  async signIn() {
    if (!this.auth) return;
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      // Closing the window is not an error worth reporting.
      if (!/popup-closed|cancelled-popup/.test(code)) this.set({ error: (error as Error).message });
    }
  }

  async signOut() {
    if (this.auth) await (await import("firebase/auth")).signOut(this.auth);
  }

  /** `fetch`, saying who is asking and which endpoint is to answer; and noting what the answer says is left of today's runs. */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.auth?.currentUser?.getIdToken();
    const response = await fetch(path, { ...init, headers: { ...init.headers, "X-System-One": this.endpoint, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const left = response.headers.get("X-Runs-Left");
    if (left !== null) this.set({ runs: { left, daily: response.headers.get("X-Runs-Daily") ?? "" } });
    return response;
  }

  /** What to show instead of the tool: what it is and a way in, or nothing, since the person may pass. */
  gate(): TemplateResult | undefined {
    if (this.state === "in" || this.state === "open") return undefined;
    const google = html`<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.75 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>`;
    return html`
      <main class="gate">
        <div class="gate-words">
          <p class="brand">${mark()}<b>jev2ui</b></p>
          <h1>Say what you want.<br />Get an app.<br />Keep talking.</h1>
          <p class="lede">Describe a screen and tap through the mock it becomes. Every message after that changes it.</p>
          ${this.state === "out" ? html`<button class="google" @click=${() => this.signIn()}>${google}Sign in with Google</button>` : nothing}
          ${this.state === "stranger"
            ? html`<div class="stranger">
                  ${face(this)}
                  <p><b>${this.name || this.email}</b>${this.email} is not on the list of people who can make things here. Whoever sent you can have it added.</p>
                </div>
                <button class="google" @click=${() => this.signOut().then(() => this.signIn())}>${google}Use another account</button>`
            : nothing}
          ${this.state === "loading" ? html`<p class="fine">${icon("hourglass_top", "s")}One moment…</p>` : nothing}
          ${this.error ? html`<p class="note bad">${this.error}</p>` : nothing}
          <p class="fine">${icon("info", "s")}<span>Making things spends the models' time, which is shared out by name: so many runs a day to each person on the list. Opening an app someone shared with you takes no sign-in.</span></p>
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
