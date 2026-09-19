// The access list, for admins: who may make things here, and how many a day (server/auth.ts). Below it, who has.

import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { session } from "./session.js";

interface Grant {
  pattern: string;
  role: string | null;
  /** Left out, it is the role's usual; null is no limit. */
  runs?: number | null;
  note: string;
}

interface Listing {
  grants: Grant[];
  people: Array<{ email?: string; name?: string; lastSeen?: string; today: number }>;
  dailyRuns: number;
}

const UNLIMITED = "unlimited";

@customElement("jev2ui-access")
export class Access extends LitElement {
  @state() private listing: Listing | undefined;
  @state() private error = "";
  @state() private busy = false;
  private asked = false;

  constructor() {
    super();
    session.attach(this);
  }

  protected createRenderRoot() {
    return this;
  }

  protected updated() {
    if ((session.state !== "in" && session.state !== "open") || this.asked) return;
    this.asked = true;
    void this.ask("GET");
  }

  private async ask(method: "GET" | "PUT" | "DELETE", line?: Partial<Grant>) {
    this.busy = true;
    try {
      const path = method === "DELETE" ? `/api/access?pattern=${encodeURIComponent(line!.pattern!)}` : "/api/access";
      const response = await session.fetch(path, { method, ...(method === "PUT" ? { body: JSON.stringify(line) } : {}) });
      if (!response.ok) throw new Error(await response.text());
      this.listing = await response.json();
      this.error = "";
      return true;
    } catch (error) {
      this.error = (error as Error).message;
      return false;
    } finally {
      this.busy = false;
    }
  }

  /** What the runs box says, as the server wants it: nothing for the role's usual, null for no limit. */
  private runs(text: string): number | null | undefined {
    const said = text.trim().toLowerCase();
    return said === "" ? undefined : said === UNLIMITED ? null : Number(said);
  }

  private async add(form: HTMLFormElement) {
    const said = new FormData(form);
    const line = { pattern: String(said.get("pattern")), role: String(said.get("role")), runs: this.runs(String(said.get("runs"))), note: String(said.get("note")) };
    if (await this.ask("PUT", line)) form.reset();
  }

  private renderGrant(grant: Grant) {
    const usual = grant.role === "admin" ? UNLIMITED : grant.role === "maker" ? String(this.listing!.dailyRuns) : "";
    return html`<tr>
      <td class="pattern">${grant.pattern}</td>
      <td>
        <select .value=${grant.role ?? ""} ?disabled=${this.busy} @change=${(e: Event) => this.ask("PUT", { ...grant, role: (e.target as HTMLSelectElement).value })}>
          ${["maker", "admin", "none"].map((role) => html`<option ?selected=${role === grant.role}>${role}</option>`)}
        </select>
      </td>
      <td>
        ${grant.role === "none"
          ? nothing
          : html`<input
              class="runs"
              aria-label="Runs a day"
              .value=${grant.runs === undefined ? "" : grant.runs === null ? UNLIMITED : String(grant.runs)}
              placeholder=${usual}
              ?disabled=${this.busy}
              @change=${(e: Event) => this.ask("PUT", { ...grant, runs: this.runs((e.target as HTMLInputElement).value) })}
            />`}
      </td>
      <td class="note">${grant.note}</td>
      <td><button class="link" ?disabled=${this.busy} @click=${() => this.ask("DELETE", grant)}>remove</button></td>
    </tr>`;
  }

  render() {
    const gate = session.gate();
    if (gate) return gate;
    const says = (pattern: string) => (pattern.includes("*") ? 0 : 1000) + pattern.replaceAll("*", "").length;
    const grants = [...(this.listing?.grants ?? [])].sort((a, b) => says(b.pattern) - says(a.pattern) || a.pattern.localeCompare(b.pattern));
    const people = [...(this.listing?.people ?? [])].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    return html`
      <header class="top">
        <h1>jev2ui <small>who may make things</small></h1>
        <span class="aside">${session.badge()}<a href="/">← the tool</a></span>
      </header>
      <main class="access">
        ${this.error ? html`<p class="note bad">${this.error}</p>` : nothing}
        ${this.listing
          ? html`
              <h2>The list</h2>
              <p class="hint">
                A pattern is an address, with * for anything. Of the lines an address fits, the one that says the most wins: a person's own line over their
                company's. Runs are screens made in a day; leave it empty for the usual (${this.listing.dailyRuns} for a maker, no limit for an admin), or say
                "${UNLIMITED}". An edit is noticed within a minute.
              </p>
              <table>
                <tr><th>who</th><th>role</th><th>runs a day</th><th>note</th><th></th></tr>
                ${grants.map((grant) => this.renderGrant(grant))}
              </table>
              <form
                class="add"
                @submit=${(e: Event) => {
                  e.preventDefault();
                  void this.add(e.target as HTMLFormElement);
                }}
              >
                <input name="pattern" required placeholder="*@example.com" aria-label="Pattern" />
                <select name="role" aria-label="Role"><option>maker</option><option>admin</option><option>none</option></select>
                <input name="runs" class="runs" placeholder="runs" aria-label="Runs a day" />
                <input name="note" placeholder="note" aria-label="Note" />
                <button type="submit" ?disabled=${this.busy}>Add</button>
              </form>

              <h2>Who has made things</h2>
              ${people.length
                ? html`<table>
                    <tr><th>who</th><th>today</th><th>last seen</th></tr>
                    ${people.map((p) => html`<tr><td>${p.email || "–"} <small>${p.name}</small></td><td>${p.today}</td><td>${p.lastSeen ? new Date(p.lastSeen).toLocaleString() : ""}</td></tr>`)}
                  </table>`
                : html`<p class="hint">Nobody yet.</p>`}
            `
          : nothing}
      </main>
    `;
  }
}
