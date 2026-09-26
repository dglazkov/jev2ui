// Every call the app makes to jev, written down to train a model like it. This drives the app in headless Chrome
// through what a person can do with it: describe an app, tap about in it, ask for changes and answer what the tool
// asks back, remix the design or paste a DESIGN.md, in every idiom. The server it starts writes each call jev answers
// as a row of a CSV (models.ts, JEV_CALLS): the body sent, the body that came back, and the milliseconds between. Jev
// is asked only by the app, as the app asks it; nothing here says what to ask.
//
//   npm run jev-calls                                              every app below in every idiom
//   npm run jev-calls -- --apps 2 --idioms kit,ios --taps 3 --edits 3 --parallel 3 --seed 1 --out .cache/jev-calls.csv
//   npm run jev-calls -- "A habit tracker with daily streaks"      apps of your own instead
//   CHROME=/path/to/chrome npm run jev-calls                       another Chrome than the Mac's
//
// Rows are added to the file and never replaced, so runs pile up. The server's own log goes beside it, in <out>.log.
// No photographs are made (MAKE_PHOTOS=0): the library still answers, and jev is asked about pictures just the same.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Request } from "playwright-core";
import { random } from "./server/grammar/fixtures.js";
import { IDIOM_IDS } from "./shared/idioms.js";

/** Apps to describe: the app's own examples first, then more of the kinds of thing people make with it. */
const APPS = [
  "Settings screen for a podcast app",
  "Checkout for a sneaker store, with order summary",
  "Home energy dashboard showing today's usage",
  "Find a dog walker: nearby walkers with ratings",
  "Recipe page for sourdough bread",
  "Kubernetes cluster health for on-call engineers",
  "Bedtime story picker for a kids' reading app",
  "A pomodoro focus timer app: a big countdown timer face the person starts and pauses, with today's sessions listed below",
  "A habit tracker with daily streaks",
  "Book a table at a neighborhood restaurant",
  "Banking app: accounts, recent transactions, and transfers",
  "A 3D scanner app that walks you through scanning an object from every angle",
  "Language learning app with a daily lesson and a streak",
  "Weather for the week ahead, with hourly detail for today",
  "Team chat: channels, direct messages, and threads",
  "Airline app: my trips, boarding pass, and flight status",
  "Photo editor with filters and crop",
  "Plant care reminders for my houseplants",
  "Sign-up form for a weekend pottery workshop",
  "Music player with a queue and lyrics",
  "Expense splitting for a group trip",
  "Smart home controls: lights, thermostat, and cameras",
  "Job board for remote designers",
  "Clinic appointment booking with doctor profiles",
];

/** Things to say to an app that is there: the app's own suggestions, then one of each other kind of change. */
const EDITS = [
  "Make it lighter",
  "Make it more playful",
  "Switch to dark mode",
  "Make the text shorter",
  "Add a settings page",
  "Use a warmer color",
  "Make the corners rounder",
  "Give it more room to breathe",
  "Make it feel serious and corporate",
  "Make the title friendlier",
  "Write it for kids",
  "Add a search bar",
  "Remove the pictures",
  "Add a buy now button",
  "Show the items as a grid",
  "Add a screen for my profile",
  "Move the details into a separate screen",
  "Add a way to share this",
  "Make it better",
  "What else can you change?",
  "Hmm, I'm not sure about this",
  "Actually, make me a recipe app instead",
];

const DESIGNS = readdirSync(new URL("./probe/designs/", import.meta.url)).map((file) => readFileSync(new URL(`./probe/designs/${file}`, import.meta.url), "utf8"));

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1]! : fallback);
const named = args.filter((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
const OUT = resolve(flag("out", ".cache/jev-calls.csv"));
const IDIOMS = flag("idioms", IDIOM_IDS.join(",")).split(",");
const APP_COUNT = Number(flag("apps", String(APPS.length)));
const TAPS = Number(flag("taps", "3"));
const EDIT_COUNT = Number(flag("edits", "3"));
const PARALLEL = Number(flag("parallel", "3"));
const SEED = Number(flag("seed", "1"));
const PORT = Number(flag("port", "8097"));
const BASE = `http://localhost:${PORT}`;

/** A request that makes jev answer something; the rest (the activity log, photographs, fonts) do not. */
const ASKS = /^\/api\/(generate|turn|design|resolve)$/;
/** How long nothing has to be asked before what was done is taken to be over: longer than a DESIGN.md edit waits (700 ms). */
const QUIET = 1500;
const LONGEST = 5 * 60_000;
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * What a person could tap on the screen on top, marked so that one can be tapped, and named: whatever the catalog made
 * a button or a link of, or gave a pointer. Words and not a function, which tsx would name with a helper the page lacks.
 */
const TAPPABLE = `(() => {
  for (const old of document.querySelectorAll("[data-jev-tap]")) delete old.dataset.jevTap;
  const pointer = (el) => el instanceof HTMLElement && getComputedStyle(el).cursor === "pointer";
  const found = [...document.querySelectorAll(".screen *")].filter((el) =>
    (el.matches("button, a, [role=button]") || (pointer(el) && !pointer(el.parentElement))) && !el.closest("[inert]") && !el.disabled && el.getClientRects().length > 0);
  found.forEach((el, i) => (el.dataset.jevTap = String(i)));
  return found.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40));
})()`;

/** Rows in the CSV: its line breaks outside quotes, less the header. */
function rows(): number {
  if (!existsSync(OUT)) return 0;
  const text = readFileSync(OUT, "utf8");
  let quoted = false;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) quoted = !quoted;
    else if (c === 10 && !quoted) lines++;
  }
  return Math.max(0, lines - 1);
}

/** The built server, writing jev's calls to OUT and its log beside it; resolves to a way to stop it. */
async function serve(): Promise<() => void> {
  if (!existsSync("dist-server/main.js")) throw new Error("Nothing is built: run `npm run build` first.");
  const log = openSync(`${OUT}.log`, "a");
  // Sign-in stays off, so that the browser may make things without a name.
  const server = spawn(process.execPath, ["dist-server/main.js"], { env: { ...process.env, PORT: String(PORT), JEV_CALLS: OUT, MAKE_PHOTOS: "0", FIREBASE_PROJECT: "" }, stdio: ["ignore", log, log] });
  for (let tries = 0; tries < 150; tries++) {
    if (server.exitCode !== null) throw new Error(`The server stopped: see ${OUT}.log.`);
    if (await fetch(`${BASE}/api/config`).then((r) => r.ok, () => false)) return () => server.kill();
    await new Promise((done) => setTimeout(done, 200));
  }
  server.kill();
  throw new Error(`The server didn't answer on port ${PORT}.`);
}

interface Session {
  n: number;
  app: string;
  idiom: string;
}

/** One person's go at one app: made, then tapped about in, talked to and repainted, in an order of the seed's. */
async function drive(browser: Browser, { n, app, idiom }: Session) {
  const rng = random(SEED * 10_000 + n);
  const pick = <T>(from: readonly T[]) => from[Math.floor(rng() * from.length)]!;
  const said = (what: string) => console.log(`${String(n).padStart(3)} ${idiom.padEnd(7)} ${app.slice(0, 40).padEnd(40)} ${what}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // A baked component's sandboxed frame has no localStorage, and throws.
  await context.addInitScript((idiom) => {
    try {
      localStorage.setItem("jev2ui.idiom", idiom);
    } catch {}
  }, idiom);
  const page = await context.newPage();
  page.on("pageerror", (error) => said(`page error: ${error.message.split("\n")[0]}`));

  // Done is when nothing that asks jev has been in flight for a while.
  let asking = 0;
  let moved = Date.now();
  const track = (by: number) => (request: Request) => {
    if (!ASKS.test(new URL(request.url()).pathname)) return;
    asking += by;
    if (by > 0) asked++;
    moved = Date.now();
  };
  page.on("request", track(1));
  page.on("requestfinished", track(-1));
  page.on("requestfailed", track(-1));
  let asked = 0;
  const act = async (what: string, doing: () => Promise<unknown>) => {
    const start = Date.now();
    const before = asked;
    moved = start;
    await doing();
    while (asking > 0 || Date.now() - moved < QUIET) {
      if (Date.now() - start > LONGEST) throw new Error(`${what}: still working after ${LONGEST / 60_000} minutes`);
      await page.waitForTimeout(250);
    }
    said(`${what} (${asked > before ? `${((Date.now() - start - QUIET) / 1000).toFixed(1)} s` : "asked nothing"})`);
  };

  const box = page.locator("aside.chat form.say textarea");
  const say = (message: string) => box.fill(message).then(() => box.press("Enter"));
  const rail = (name: string) => page.locator("nav.rail button", { hasText: name }).click();
  const tapped = new Set<string>();

  try {
    await page.goto(BASE);
    await box.waitFor();
    await act("made", () => say(app));

    const steps = [...Array<string>(TAPS).fill("tap"), ...Array<string>(EDIT_COUNT).fill("edit"), "remix"].sort(() => rng() - 0.5);
    // A DESIGN.md of the person's own comes first, so that what is made after it is painted by it.
    if (rng() < 0.25) steps.unshift("design");
    const edits = [...EDITS].sort(() => rng() - 0.5);

    for (const step of steps) {
      if (step === "tap") {
        const labels: string[] = await page.evaluate(TAPPABLE);
        const untried = labels.flatMap((label, i) => (tapped.has(label) ? [] : [i]));
        if (!labels.length) {
          said("nothing to tap");
          continue;
        }
        const i = untried.length ? pick(untried) : Math.floor(rng() * labels.length);
        tapped.add(labels[i]!);
        await act(`tapped "${labels[i]}"`, () => page.locator(`[data-jev-tap="${i}"]`).evaluate((el: HTMLElement) => el.click()));
      } else if (step === "edit") {
        const message = edits.pop()!;
        await act(`said "${message}"`, () => say(message));
        // Asked something back, a person mostly answers with one of the options offered.
        const options = page.locator("aside.chat article.turn:last-of-type .options button");
        const offered = await options.count();
        if (offered && rng() < 0.7) {
          const option = options.nth(Math.floor(rng() * offered));
          const label = await option.innerText();
          await act(`answered "${label}"`, () => option.click());
        }
      } else if (step === "remix") {
        await rail("Design");
        // Only Jev's own design can be remixed: after a DESIGN.md of the person's own, it is chosen again first.
        const remix = page.locator("section.design button", { hasText: "Remix" });
        if (!(await remix.count())) await act("chose Jev's design", () => page.locator("section.design [role=radio]").first().click());
        await act("remixed", () => remix.click());
        await rail("Chat");
      } else {
        await rail("Design");
        await act("chose own DESIGN.md", () => page.locator("section.design [role=radio]", { hasText: "Your DESIGN.md" }).click());
        await act("pasted a DESIGN.md", () => page.locator('section.design textarea[aria-label="DESIGN.md"]').fill(pick(DESIGNS)));
        await rail("Chat");
      }
    }
  } finally {
    await context.close();
  }
}

mkdirSync(dirname(OUT), { recursive: true });
const before = rows();
const stop = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? (existsSync(MAC_CHROME) ? MAC_CHROME : undefined) });
const quit = () => {
  stop();
  void browser.close().finally(() => process.exit(1));
};
process.on("SIGINT", quit);

const sessions: Session[] = (named.length ? named : APPS).slice(0, APP_COUNT).flatMap((app) => IDIOMS.map((idiom) => ({ app, idiom }))).map((s, n) => ({ ...s, n: n + 1 }));
console.log(`${sessions.length} sessions, ${PARALLEL} at a time, writing to ${OUT}\n`);
const started = Date.now();
const waiting = [...sessions];
let failed = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let session = waiting.shift(); session; session = waiting.shift())
      await drive(browser, session).catch((error: Error) => {
        failed++;
        console.log(`${String(session!.n).padStart(3)} failed: ${error.message.split("\n")[0]}`);
      });
  }),
);
await browser.close();
stop();
console.log(`\n${rows() - before} calls written to ${OUT} in ${((Date.now() - started) / 60_000).toFixed(1)} minutes; ${failed} of ${sessions.length} sessions failed.`);
