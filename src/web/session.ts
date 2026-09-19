// Who is using the tool. The server says whether anyone has to sign in (/api/config, server/auth.ts); where they
// do, it is with Google, through Firebase, and every request carries the ID token that says who is asking.
// Whether the person may make anything is the server's list to say (/api/me): signed in and not on it is `stranger`.
// Both pages share this: the gate that stands in for the page until someone is in, and the badge once they are.

import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";
import type { PipelineEvent } from "../shared/events.js";
import "./session.css";

type Auth = import("firebase/auth").Auth;

class Session {
  /** `open` is a server that asks nobody to sign in. */
  state: "loading" | "out" | "stranger" | "in" | "open" = "loading";
  name = "";
  email = "";
  /** What the list makes of the person: an admin may edit it (access.ts). */
  role = "";
  error = "";
  /** What is left of today's runs, once the server has said. */
  runs: { left: string; daily: string } | undefined;

  private auth: Auth | undefined;
  private hosts = new Set<ReactiveControllerHost>();
  private begun = false;

  /** The element is rendered again whenever the session changes. */
  attach(host: ReactiveControllerHost) {
    this.hosts.add(host);
    if (!this.begun) void this.begin();
    this.begun = true;
  }

  private set(change: Partial<Pick<Session, "state" | "name" | "email" | "role" | "error" | "runs">>) {
    Object.assign(this, change);
    for (const host of this.hosts) host.requestUpdate();
  }

  private async begin() {
    try {
      const { firebase } = await (await fetch("/api/config")).json();
      if (!firebase) return this.set({ state: "open" });
      // Only a server with sign-in has the browser fetch Firebase at all.
      const [{ initializeApp }, { getAuth, onAuthStateChanged }] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      this.auth = getAuth(initializeApp(firebase));
      onAuthStateChanged(this.auth, (user) => {
        if (!user) return this.set({ state: "out", name: "", email: "", runs: undefined });
        this.set({ state: this.state === "in" ? "in" : "loading", name: user.displayName ?? user.email ?? "", email: user.email ?? "", error: "" });
        void this.fetch("/api/me")
          .then(async (response) => (response.ok ? response.json() : Promise.reject(new Error(await response.text()))))
          .then(({ role }) => this.set({ state: role ? "in" : "stranger", role: role ?? "" }))
          .catch((error) => this.set({ state: "out", error: (error as Error).message }));
      });
    } catch (error) {
      this.set({ state: "out", error: (error as Error).message });
    }
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

  private async signOut() {
    if (this.auth) await (await import("firebase/auth")).signOut(this.auth);
  }

  /** `fetch`, saying who is asking; and noting what the answer says is left of today's runs. */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.auth?.currentUser?.getIdToken();
    const response = await fetch(path, { ...init, headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const left = response.headers.get("X-Runs-Left");
    if (left !== null) this.set({ runs: { left, daily: response.headers.get("X-Runs-Daily") ?? "" } });
    return response;
  }

  /** What to show instead of the page: a way in, or nothing, since the person may pass. */
  gate(): TemplateResult | undefined {
    if (this.state === "in" || this.state === "open") return undefined;
    return html`
      <main class="gate">
        <h1>jev2ui <small>describe a screen, get a mock, tap through it</small></h1>
        ${this.state === "out"
          ? html`<p>Making things here spends the models' time, which is shared out by name: so many runs a day to each person on the list.</p>
              <button @click=${() => this.signIn()}>Sign in with Google</button>`
          : nothing}
        ${this.state === "stranger"
          ? html`<p>You are signed in as ${this.email}, which is not on the list of people who can make things here. Whoever sent you can have it added.</p>
              <button @click=${() => this.signOut()}>Sign out</button>`
          : nothing}
        ${this.error ? html`<p class="note bad">${this.error}</p>` : nothing}
      </main>
    `;
  }

  /** Who is signed in, what they have left today, and the way out. */
  badge(): TemplateResult | typeof nothing {
    if (this.state !== "in") return nothing;
    return html`<span class="session">
      ${this.runs && this.runs.daily !== "unlimited"
        ? html`<span class=${this.runs.left === "0" ? "spent" : ""} title="A screen made is one run. The day turns over at midnight UTC.">${this.runs.left} of ${this.runs.daily} runs left today</span>`
        : nothing}
      <span>${this.name}</span>
      ${this.role === "admin" && location.pathname !== "/access.html" ? html`<a href="/access.html">access</a>` : nothing}
      <button class="link" @click=${() => this.signOut()}>sign out</button>
    </span>`;
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
