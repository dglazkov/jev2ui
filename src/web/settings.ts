// Settings: who is signed in and what they have left today, how the tool looks, which endpoint decides, and, for admins, the access list:
// who may make things here, and how many a day (server/auth.ts), with who has below it.

import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { appearance, face, icon, setAppearance, type Appearance } from "./chrome.js";
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
  people: Array<{ email?: string; name?: string; picture?: string; lastSeen?: string; today: number }>;
  dailyRuns: number;
}

export type Section = "account" | "appearance" | "models" | "access";
export const DEVICES = { phone: 390, tablet: 768, desktop: 1180 } as const;
export type Device = keyof typeof DEVICES;
export const DEVICE_ICONS: Record<Device, string> = { phone: "smartphone", tablet: "tablet_mac", desktop: "desktop_windows" };
const STORED_DEVICE = "jev2ui.device";

/** The device a mock is first shown on, which is the person's to say. */
export function firstDevice(): Device {
  const said = localStorage.getItem(STORED_DEVICE);
  return said && said in DEVICES ? (said as Device) : "phone";
}

const UNLIMITED = "unlimited";
const ROLES: Record<string, { icon: string; says: string }> = {
  maker: { icon: "brush", says: "makes things, so many a day" },
  admin: { icon: "shield_person", says: "makes things, and edits this list" },
  none: { icon: "block", says: "is kept out, whatever a wider line says" },
};

/** How long ago, in the fewest words. */
function ago(when: string): string {
  const minutes = Math.round((Date.now() - new Date(when).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 60 * 36) return `${Math.round(minutes / 60)} hours ago`;
  return new Date(when).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

@customElement("jev2ui-settings")
export class Settings extends LitElement {
  @property() section: Section = "account";
  @state() private listing: Listing | undefined;
  @state() private error = "";
  @state() private busy = false;
  /** The line of the list that is about to be removed, once the person says so again. */
  @state() private removing = "";
  @state() private looks: Appearance = appearance();
  @state() private device: Device = firstDevice();
  private asked = false;

  constructor() {
    super();
    session.attach(this);
  }

  protected createRenderRoot() {
    return this;
  }

  private get sections(): Section[] {
    return [...(session.state === "in" ? (["account"] as const) : []), "appearance", ...(session.makes && session.endpoints.length > 1 ? (["models"] as const) : []), ...(session.role === "admin" ? (["access"] as const) : [])];
  }

  protected updated() {
    if (this.section !== "access" || session.role !== "admin" || this.asked) return;
    this.asked = true;
    void this.ask("GET");
  }

  private go(section: Section) {
    this.section = section;
    this.dispatchEvent(new CustomEvent("section", { detail: section }));
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
      this.removing = "";
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

  // --- Account ------------------------------------------------------------------

  private renderAccount() {
    const runs = session.runs;
    const limited = runs && runs.daily !== UNLIMITED;
    return html`
      <h3>Account</h3>
      <p class="lede">You are signed in with Google. The tool keeps your name beside what you save, and counts the screens you have made today.</p>
      <div class="card who">
        ${face(session, "big")}
        <div><b>${session.name}</b><small>${session.email}</small></div>
        <span class="role ${session.role}">${icon(ROLES[session.role]?.icon ?? "person", "xs")}${session.role}</span>
      </div>
      <div class="card quota">
        ${limited
          ? html`<p><b>${runs.left} of ${runs.daily}</b> runs left today</p>
              <div class="meter ${runs.left === "0" ? "spent" : ""}"><i style="width:${(100 * Number(runs.left)) / Math.max(1, Number(runs.daily))}%"></i></div>`
          : html`<p><b>No daily limit</b></p>`}
        <p class="hint">A screen made is one run; changing how an app looks costs none. The day turns over at midnight UTC.</p>
      </div>
      <button class="btn" @click=${() => session.signOut()}>${icon("logout", "s")}Sign out</button>
    `;
  }

  // --- Appearance -----------------------------------------------------------------

  private renderAppearance() {
    const looks: Array<[Appearance, string, string]> = [
      ["system", "routine", "System"],
      ["light", "light_mode", "Light"],
      ["dark", "dark_mode", "Dark"],
    ];
    return html`
      <h3>Appearance</h3>
      <p class="lede">How the tool itself looks. What you make is painted by its own DESIGN.md, whatever you choose here.</p>
      <div class="card setting">
        <div><b>Theme</b><small>System follows your computer.</small></div>
        <div class="segmented wide" role="radiogroup" aria-label="Theme">
          ${looks.map(
            ([id, symbol, name]) =>
              html`<button
                role="radio"
                aria-checked=${this.looks === id}
                @click=${() => {
                  this.looks = id;
                  setAppearance(id);
                }}
              >
                ${icon(symbol, "s")}${name}
              </button>`,
          )}
        </div>
      </div>
      <div class="card setting">
        <div><b>First device</b><small>What a new session shows its mocks on.</small></div>
        <div class="segmented wide" role="radiogroup" aria-label="First device">
          ${(Object.keys(DEVICES) as Device[]).map(
            (id) =>
              html`<button
                role="radio"
                aria-checked=${this.device === id}
                @click=${() => {
                  this.device = id;
                  localStorage.setItem(STORED_DEVICE, id);
                  this.dispatchEvent(new CustomEvent("device", { detail: id }));
                }}
              >
                ${icon(DEVICE_ICONS[id], "s")}${id[0]!.toUpperCase() + id.slice(1)}
              </button>`,
          )}
        </div>
      </div>
    `;
  }

  // --- Models ---------------------------------------------------------------------

  private renderModels() {
    const endpoints = [
      ["jev", "cloud", "jev", "The hosted TypeSafe service at api.typesafe.ai."],
      ["gev", "dns", "gev", "A self-hosted service that accepts the same requests and answers them with a different model. Its yes-or-no answers are more confident than jev's."],
    ] as const;
    return html`
      <h3>Models</h3>
      <p class="lede">
        Select the service that answers System One requests. jev2ui sends a System One request for each design decision. The two services agree on about 80%
        of decisions. To compare them, switch services, and then regenerate a screen. Each timing in a screen's decision log names the service that answered.
      </p>
      <div class="card setting">
        <div><b>System One service</b><small>${endpoints.find(([id]) => id === session.endpoint)![3]} This setting is saved in your browser.</small></div>
        <div class="segmented wide" role="radiogroup" aria-label="System One service">
          ${endpoints.map(([id, symbol, name]) => html`<button role="radio" aria-checked=${session.endpoint === id} @click=${() => (session.endpoint = id)}>${icon(symbol, "s")}${name}</button>`)}
        </div>
      </div>
      <p class="hint">Switching services doesn't change screens that you've already made. If jev2ui generated the app's design, the next screen that you make also regenerates the design with the selected service.</p>
    `;
  }

  // --- Access ---------------------------------------------------------------------

  private renderGrant(grant: Grant) {
    const usual = grant.role === "admin" ? UNLIMITED : grant.role === "maker" ? String(this.listing!.dailyRuns) : "";
    const role = grant.role ?? "none";
    return html`<tr>
      <td class="pattern">${grant.pattern}</td>
      <td>
        <label class="role pick ${role}" title=${`${grant.pattern} ${ROLES[role]?.says ?? ""}`}>
          ${icon(ROLES[role]?.icon ?? "person", "xs")}
          <select aria-label="Role" .value=${role} ?disabled=${this.busy} @change=${(e: Event) => this.ask("PUT", { ...grant, role: (e.target as HTMLSelectElement).value })}>
            ${Object.keys(ROLES).map((one) => html`<option ?selected=${one === role}>${one}</option>`)}
          </select>
          <span>${role}</span>${icon("arrow_drop_down", "xs")}
        </label>
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
      <td class="note-cell">${grant.note}</td>
      <td class="end">
        ${this.removing === grant.pattern
          ? html`<button class="btn small" @click=${() => (this.removing = "")}>Keep</button>
              <button class="btn small danger" ?disabled=${this.busy} @click=${() => this.ask("DELETE", grant)}>Remove</button>`
          : html`<button class="ib" title="Remove this line" aria-label="Remove ${grant.pattern}" ?disabled=${this.busy} @click=${() => (this.removing = grant.pattern)}>${icon("delete", "s")}</button>`}
      </td>
    </tr>`;
  }

  private renderAccess() {
    const says = (pattern: string) => (pattern.includes("*") ? 0 : 1000) + pattern.replaceAll("*", "").length;
    const grants = [...(this.listing?.grants ?? [])].sort((a, b) => says(b.pattern) - says(a.pattern) || a.pattern.localeCompare(b.pattern));
    const people = [...(this.listing?.people ?? [])].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    // What the person's line allows them, to set what they have made today against.
    const allowed = (email = ""): number | null | undefined => {
      const fits = grants.filter((grant) => new RegExp(`^${grant.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`, "i").test(email));
      const line = fits[0];
      if (!line || line.role === "none" || line.role === null) return undefined;
      return line.runs !== undefined ? line.runs : line.role === "admin" ? null : this.listing!.dailyRuns;
    };
    return html`
      <h3>Access</h3>
      <p class="lede">
        Who may make things here, and how many screens a day. A pattern is an address, with * for anything. Of the lines an address fits, the one that says the
        most wins: a person's own line over their company's.
      </p>
      ${this.error ? html`<p class="note bad">${this.error}</p>` : nothing}
      ${this.listing
        ? html`
            <div class="card">
              <div class="card-head">${icon("rule", "s")}The list <small>an edit is noticed within a minute</small></div>
              <div class="scroll-x">
                <table>
                  <tr><th>Who</th><th>Role</th><th>Runs a day</th><th>Note</th><th></th></tr>
                  ${grants.map((grant) => this.renderGrant(grant))}
                </table>
              </div>
              <form
                class="add"
                @submit=${(e: Event) => {
                  e.preventDefault();
                  void this.add(e.target as HTMLFormElement);
                }}
              >
                <label class="field grow">${icon("alternate_email", "s")}<input name="pattern" required placeholder="*@example.com" aria-label="Pattern" /></label>
                <label class="field"
                  ><select name="role" aria-label="Role"><option>maker</option><option>admin</option><option>none</option></select></label
                >
                <label class="field narrow"><input name="runs" placeholder=${`runs (${this.listing.dailyRuns})`} aria-label="Runs a day: empty for the usual, or “unlimited”" title="Empty for the usual, or “unlimited”" /></label>
                <label class="field grow"><input name="note" placeholder="note" aria-label="Note" /></label>
                <button class="btn primary" type="submit" ?disabled=${this.busy}>${icon("add", "s")}Add</button>
              </form>
            </div>

            <div class="card">
              <div class="card-head">${icon("group", "s")}Who has made things</div>
              ${people.length
                ? html`<div class="scroll-x">
                    <table>
                      <tr><th>Who</th><th>Today</th><th>Last seen</th></tr>
                      ${people.map((p) => {
                        const runs = allowed(p.email);
                        return html`<tr>
                          <td><span class="person">${face(p, "small")}<span>${p.name || p.email || "–"} <small>${p.name ? p.email : ""}</small></span></span></td>
                          <td>
                            <span class="usage">
                              ${typeof runs === "number" ? html`<span class="meter ${p.today >= runs ? "spent" : ""}"><i style="width:${Math.min(100, (100 * p.today) / Math.max(1, runs))}%"></i></span>${p.today} of ${runs}` : html`${p.today} <small>${runs === null ? "no limit" : ""}</small>`}
                            </span>
                          </td>
                          <td><small>${p.lastSeen ? ago(p.lastSeen) : ""}</small></td>
                        </tr>`;
                      })}
                    </table>
                  </div>`
                : html`<p class="empty-note">${icon("hourglass_empty")}Nobody has made anything yet.</p>`}
            </div>
          `
        : this.error
          ? nothing
          : html`<p class="empty-note">${icon("hourglass_top")}Reading the list…</p>`}
    `;
  }

  render() {
    const sections = this.sections;
    const section = sections.includes(this.section) ? this.section : sections[0]!;
    const names: Record<Section, [string, string]> = { account: ["account_circle", "Account"], appearance: ["contrast", "Appearance"], models: ["neurology", "Models"], access: ["shield_person", "Access"] };
    return html`
      <nav class="snav" aria-label="Settings">
        <h2>Settings</h2>
        ${sections.map(
          (one) =>
            html`<button class="mi" aria-current=${one === section} @click=${() => this.go(one)}>${icon(names[one][0])}${names[one][1]}${one === "access" ? html`<span class="tag">admin</span>` : nothing}</button>`,
        )}
      </nav>
      <div class="pane">${section === "account" ? this.renderAccount() : section === "access" ? this.renderAccess() : section === "models" ? this.renderModels() : this.renderAppearance()}</div>
    `;
  }
}
