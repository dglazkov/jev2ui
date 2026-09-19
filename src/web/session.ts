// Who is using the tool. The server says whether anyone has to sign in (/api/config, server/auth.ts); where they
// do, it is with Google, through Firebase, and every request carries the ID token that says who is asking.
// Both pages share this: the gate that stands in for the page until someone is in, and the badge once they are.

import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";
import type { PipelineEvent } from "../shared/events.js";
import "./session.css";

type Auth = import("firebase/auth").Auth;

class Session {
  /** `open` is a server that asks nobody to sign in. */
  state: "loading" | "out" | "in" | "open" = "loading";
  name = "";
  error = "";
  /** What is left of today's runs, once the server has said. */
  runs: { left: number; daily: number } | undefined;

  private auth: Auth | undefined;
  private hosts = new Set<ReactiveControllerHost>();
  private begun = false;

  /** The element is rendered again whenever the session changes. */
  attach(host: ReactiveControllerHost) {
    this.hosts.add(host);
    if (!this.begun) void this.begin();
    this.begun = true;
  }

  private set(change: Partial<Pick<Session, "state" | "name" | "error" | "runs">>) {
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
      onAuthStateChanged(this.auth, (user) => this.set(user ? { state: "in", name: user.displayName ?? user.email ?? "", error: "" } : { state: "out", name: "", runs: undefined }));
    } catch (error) {
      this.set({ state: "out", error: (error as Error).message });
    }
  }

  private async signIn() {
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
    if (left !== null) this.set({ runs: { left: Number(left), daily: Number(response.headers.get("X-Runs-Daily")) } });
    return response;
  }

  /** What to show instead of the page: a way in, or nothing, since the person may pass. */
  gate(): TemplateResult | undefined {
    if (this.state === "in" || this.state === "open") return undefined;
    return html`
      <main class="gate">
        <h1>jev2ui <small>describe a screen, get a mock, tap through it</small></h1>
        ${this.state === "loading"
          ? nothing
          : html`<p>Anyone may come in. Signing in is how the models' time is shared out: everyone gets so many runs a day.</p>
              <button @click=${() => this.signIn()}>Sign in with Google</button>`}
        ${this.error ? html`<p class="note bad">${this.error}</p>` : nothing}
      </main>
    `;
  }

  /** Who is signed in, what they have left today, and the way out. */
  badge(): TemplateResult | typeof nothing {
    if (this.state !== "in") return nothing;
    return html`<span class="session">
      ${this.runs ? html`<span class=${this.runs.left ? "" : "spent"} title="A screen made is one run. The day turns over at midnight UTC.">${this.runs.left} of ${this.runs.daily} runs left today</span>` : nothing}
      <span>${this.name}</span>
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
