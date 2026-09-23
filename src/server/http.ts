// The pipelines over HTTP: three JSON routes and one of Server-Sent Events; who may use them; and what they saved.
// Where sign-in is on (auth.ts), each wants to know who is asking and that the
// list lets them make things, and a run is taken from their allowance for the day.
//
// Which endpoint answers System One (jev or gev, models.ts) and which idiom the app is imagined in (idioms.ts) are
// the person's to say, in a header each on every request: everything the request sets going is answered by that
// endpoint and imagined in that idiom.
//
// Two servers mount this. In development it is the Vite dev server
// (vite.config.ts), which loads the pipelines through Vite so that edits to
// them apply without a restart; deployed, it is main.ts, which imports them.
// That is why nothing here imports a pipeline: whoever mounts the routes says
// how a module is loaded.

import { ARCHITECTURE, ARCHITECTURE_REQUEST, SCREEN_BINDINGS } from "../shared/architecture.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerModule } from "./modules.js";

/** Loads a module of src/server by its path from there, without the extension: "mock/pipeline". */
export type Load = (module: ServerModule) => Promise<any>;

/** A DESIGN.md is the largest thing anyone sends. */
const LARGEST_BODY = 1 << 20;

/** An app that has been tapped through for a while, to be saved. */
const LARGEST_APP = 8 << 20;

async function readJson(req: IncomingMessage, largest = LARGEST_BODY): Promise<any> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > largest) throw new Error("The request body is too large.");
  }
  return JSON.parse(body || "{}");
}

/** A DESIGN.md if one was sent, else the brief (and the seed of a remix) for Jev to mix one from. */
function designSource(body: any) {
  if (typeof body.markdown === "string" && body.markdown.trim()) return { markdown: body.markdown as string };
  const brief = String(body.brief ?? "").trim();
  return brief ? { brief, seed: Number(body.seed) || 0, ...(body.change ? { change: paintChange(body.change) } : {}) } : undefined;
}

/** What has been changed about a mix, as a browser sent it: numbers where numbers go, and nothing that is not a dial or a choice. */
function paintChange(sent: any) {
  const dials = Object.fromEntries(["vivid", "light", "warmth", "round", "air"].flatMap((key) => (Number.isFinite(sent?.dials?.[key]) ? [[key, Math.max(-4, Math.min(4, Number(sent.dials[key])))]] : [])));
  const pins = Object.fromEntries(
    Object.entries({ hue: "string", dark: "boolean", type: "string", elevation: "string", photos: "boolean", photo_look: "string", cards: "boolean" }).flatMap(([key, kind]) => (typeof sent?.pins?.[key] === kind ? [[key, sent.pins[key]]] : [])),
  );
  return { dials, pins };
}

/** A screen to be made again to the person's word (shared/turn.ts), as a browser sent it. What the plan holds is checked where it is used (mock/plan.ts). */
function screenEdit(sent: any) {
  if (!sent || typeof sent.plan !== "object" || !Array.isArray(sent.blocks)) return undefined;
  const kept = sent.kept && typeof sent.kept === "object" ? Object.fromEntries(Object.entries(sent.kept).filter(([path]) => /^[a-z]{1,20}$/.test(path)).slice(0, 20)) : {};
  return { plan: sent.plan, blocks: sent.blocks.slice(0, 20).map(String), kept };
}

// POST a message typed to an app that is already there (shared/turn.ts); answers what to do about it (change.ts).
// It reads and repaints, and makes no screen, so it takes no run from the day's allowance.
async function turn(load: Load, req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJson(req);
    const message = String(body.message ?? "").trim().slice(0, 2000);
    const app = String(body.app ?? "").trim().slice(0, 4000);
    const design = designSource(body.design ?? {});
    if (!message || !app || !design) throw new Error("The request must include message, app, design, and showing.");
    const about = (sent: any) => ({ ...(typeof sent?.destination === "string" ? { destination: sent.destination.slice(0, 40) } : {}), id: Number(sent?.id) || 0, title: String(sent?.title ?? "").slice(0, 200), archetype: String(sent?.archetype ?? "").slice(0, 80), ...(Array.isArray(sent?.blocks) ? { blocks: sent.blocks.slice(0, 20).map(String) } : {}) });
    const others = (Array.isArray(body.others) ? body.others : []).slice(0, 12).map(about);
    const showing = { ...about(body.showing), decisions: (Array.isArray(body.showing?.decisions) ? body.showing.decisions : []).slice(0, 60).map((d: any) => ({ question: String(d?.question ?? "").slice(0, 200), answer: String(d?.answer ?? "").slice(0, 200) })) };
    const answering = body.answering?.message && body.answering?.question ? { message: String(body.answering.message).slice(0, 2000), question: String(body.answering.question).slice(0, 600) } : undefined;
    const { readTurn } = await load("change");
    const answer = await readTurn({ message, app, design: "markdown" in design ? design : { brief: design.brief, seed: design.seed, change: design.change ?? {} }, showing, others, ...(body.architecture ? { architecture: ARCHITECTURE.parse(body.architecture), bindings: SCREEN_BINDINGS.optional().parse(body.bindings) } : {}), ...(answering ? { answering } : {}) });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(answer));
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : String(error));
  }
}

// POST {markdown} reads a DESIGN.md; POST {brief} has Jev mix one. Either way: a theme, lint findings, Jev's reading.
async function design(load: Load, req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJson(req);
    const source = designSource(body) ?? { brief: "" };
    if ("brief" in source && !source.brief) throw new Error("The request must include either markdown or brief.");
    const { loadDesign } = await load("design-source");
    const { report, mixed } = await loadDesign(source).loaded;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ report, markdown: mixed }));
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : String(error));
  }
}

// Photographs the image model made (photos/generate.ts).
async function photo(load: Load, id: string, res: ServerResponse) {
  const { readMade } = await load("photos/generate");
  const made = readMade(id);
  if (!made) return void ((res.statusCode = 404), res.end());
  res.writeHead(200, { "Content-Type": made.mime, "Cache-Control": "public, max-age=31536000, immutable" });
  res.end(made.bytes);
}

async function generate(load: Load, url: URL, req: IncomingMessage, res: ServerResponse, asking: Asking | undefined) {
  const body = req.method === "POST" ? await readJson(req).catch(() => ({})) : {};
  const prompt = String(body.prompt ?? url.searchParams.get("prompt") ?? "").trim();
  const mode = body.mode ?? url.searchParams.get("mode") ?? "mock";
  if (!prompt || !["mock", "jobs", "hybrid", "baseline"].includes(mode)) {
    res.statusCode = 400;
    res.end("The request must include a prompt and a mode of mock, jobs, hybrid, or baseline.");
    return;
  }
  const parsedArchitecture = ARCHITECTURE_REQUEST.optional().safeParse(body.architecture);
  if (!parsedArchitecture.success || (parsedArchitecture.data && "state" in parsedArchitecture.data && !parsedArchitecture.data.state.map.nodes.some((n) => n.id === (parsedArchitecture.data as { destination: string }).destination))) {
    res.statusCode = 400;
    res.end("The app map or destination is invalid.");
    return;
  }
  const spent = !asking || (await asking.auth.spend(asking.person, asking.grant));
  await allowance(res, asking);
  if (!spent) {
    res.statusCode = 429;
    res.end(`You've used all ${asking!.grant.runs} of today's runs. Your runs reset at midnight UTC.`);
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Proxies that buffer a response would hold the whole run back until it ended.
    "X-Accel-Buffering": "no",
  });
  const { runHybrid } = await load("hybrid");
  const { runMock } = await load("mock/pipeline");
  const { runBaseline } = await load("baseline");
  const { runJobs } = await load("jobs");
  const events =
    mode === "mock"
      ? runMock(prompt, designSource(body), body.journey, Boolean(body.fresh), (Array.isArray(body.notes) ? body.notes : []).slice(0, 12).map((note: unknown) => String(note).slice(0, 2000)), screenEdit(body.edit), parsedArchitecture.data)
      : mode === "jobs"
        ? runJobs(prompt)
        : mode === "hybrid"
          ? runHybrid(prompt)
          : runBaseline(prompt);
  let open = true;
  res.on("close", () => (open = false));
  for await (const event of events) {
    if (!open) break;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
}

// The access list, for admins: GET reads it (and who has made what today), PUT writes a line, DELETE ?pattern= removes one.
async function accessList(url: URL, req: IncomingMessage, res: ServerResponse, asking: Asking) {
  const { auth, person, grant } = asking;
  const refuse = (status: number, why: string) => void ((res.statusCode = status), res.end(why));
  if (grant.role !== "admin") return refuse(403, "Only admins can edit the access list.");
  if (req.method === "PUT" || req.method === "DELETE") {
    const line = req.method === "PUT" ? await readJson(req).catch(() => ({})) : { pattern: url.searchParams.get("pattern") ?? "" };
    // Nobody saws off the branch they sit on: the line that makes this person an admin stays, and stays an admin's.
    if (String(line.pattern).trim().toLowerCase() === grant.pattern && line.role !== "admin") return refuse(400, "You can't change the pattern that grants you admin access. Ask another admin to change it.");
    const wrong = req.method === "PUT" ? await auth.grant(person, line) : await auth.revoke(line.pattern);
    if (wrong) return refuse(400, wrong);
  } else if (req.method !== "GET") return refuse(405, "This endpoint supports only GET, PUT, and DELETE requests.");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(await auth.everything()));
}

// Saved apps (apps.ts). Saving is for those the list lets make things. Opening is for anyone, signed in or not,
// if the app is shared by link: reading costs the models nothing, so it needs no name.
//   GET /api/apps        what the person has saved          POST /api/apps          saves one, answers {id}
//   GET /api/apps/<id>   {about, app}                       PATCH {visibility}, DELETE: its owner's to do
async function savedApps(load: Load, id: string, req: IncomingMessage, res: ServerResponse, auth: any) {
  const refuse = (status: number, why: string) => void ((res.statusCode = status), res.end(why));
  const json = (value: unknown) => void (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(value)));
  if (!auth.firebase) return refuse(404, "This server doesn't save apparitions, because it doesn't require sign-in.");
  const apps = await load("apps");
  const person = await auth.whoIs(req.headers.authorization);
  if (id && req.method === "GET") {
    const found = await apps.open(id, person);
    return found ? json(found) : refuse(404, "That apparition doesn't exist, or it isn't shared.");
  }
  if (!person) return refuse(401, "Sign in to continue.");
  if (!id && req.method === "GET") return json({ apps: await apps.mine(person) });
  const grant = await auth.access(person);
  if (!id && req.method === "POST") {
    // Saving needs a name, which a signed-in person has whatever the list says; the models it cost were paid by the list or by their own keys.
    if (!grant && !ownKeysNamed(req)) return refuse(403, "To save an apparition, your address must be on the access list, or you must use your own API keys.");
    const saved = await apps.save(person, await readJson(req, LARGEST_APP).catch(() => undefined));
    return "wrong" in saved ? refuse(400, `Can't save this apparition: ${saved.wrong}`) : json(saved);
  }
  if (id && req.method === "PATCH") {
    const { visibility } = await readJson(req).catch(() => ({}));
    if (visibility !== "private" && visibility !== "link") return refuse(400, "Visibility must be private or link.");
    return (await apps.share(id, person, visibility)) ? json({ id, visibility }) : refuse(404, "You don't have an apparition with that ID.");
  }
  if (id && req.method === "DELETE") return (await apps.forget(id, person, grant?.role === "admin")) ? json({ id }) : refuse(404, "You don't have an apparition with that ID.");
  refuse(405, "This endpoint doesn't support that request method.");
}

/**
 * The keys a request brought of its own, if it brought both (models.ts says what they are for). They are read here and
 * handed on, and appear nowhere else: not in a log, a trace, or an answer.
 */
function ownKeysNamed(req: IncomingMessage): { jev: string; gemini: string } | undefined {
  const one = (name: string) => {
    const said = req.headers[name];
    const key = (Array.isArray(said) ? said[0] : said)?.trim() ?? "";
    return /^[\w.-]{16,256}$/.test(key) ? key : "";
  };
  const jev = one("x-jev-key");
  const gemini = one("x-gemini-key");
  return jev && gemini ? { jev, gemini } : undefined;
}

/** Who is asking, and what the list grants them; `auth` is the module that said so (auth.ts). */
interface Asking {
  auth: any;
  person: { uid: string; email?: string; name?: string };
  grant: { pattern: string; role: string; runs: number | null };
}

/** Every answer says what is left of the day's allowance, so the browser can show it; "unlimited" where there is no limit. */
async function allowance(res: ServerResponse, asking: Asking | undefined) {
  if (!asking) return;
  res.setHeader("X-Runs-Left", String((await asking.auth.left(asking.person, asking.grant)) ?? "unlimited"));
  res.setHeader("X-Runs-Daily", String(asking.grant.runs ?? "unlimited"));
}

/** Answers a request under /api/ and resolves true, or resolves false: it was for someone else. */
export function api(load: Load) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "", "http://localhost");
    // A photograph is asked for by an <img>, which cannot say who is asking. Its name is a hash, and serving it costs nothing.
    if (url.pathname.startsWith("/api/photo/")) return await photo(load, url.pathname.slice("/api/photo/".length), res), true;
    const saved = url.pathname.match(/^\/api\/apps(?:\/([^/]*))?$/);
    if (!saved && !["/api/config", "/api/me", "/api/keys", "/api/access", "/api/design", "/api/turn", "/api/resolve", "/api/generate"].includes(url.pathname)) return false;
    const auth = await load("auth");
    if (saved) return await savedApps(load, saved[1] ?? "", req, res, auth), true;
    const json = (value: unknown) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(value)));
    const models = await load("models");
    if (url.pathname === "/api/config") return json({ firebase: auth.firebase, endpoints: models.endpoints() }), true;
    // Whether a pair of keys works is anyone's to ask: they are the asker's keys, and the answer costs the house nothing.
    if (url.pathname === "/api/keys") {
      if (req.method !== "POST") return (res.statusCode = 405), res.end("Use POST."), true;
      const { jev, gemini } = await readJson(req).catch(() => ({}));
      if (typeof jev !== "string" || typeof gemini !== "string" || !jev.trim() || !gemini.trim()) return (res.statusCode = 400), res.end("Send a Jev API key and a Gemini API key."), true;
      return json(await models.checkKeys({ jev: jev.trim(), gemini: gemini.trim() })), true;
    }

    // The list first, keys second: a name the list grants is answered with the house's keys and counted, whatever else
    // the request carried; keys of the person's own count only where the list grants nothing (models.ts).
    let asking: Asking | undefined;
    let keys: ReturnType<typeof ownKeysNamed>;
    if (auth.firebase) {
      const person = await auth.whoIs(req.headers.authorization);
      const grant = person && (await auth.access(person));
      // Signed in and on no line of the list is something to tell the person, not an error: /api/me says so.
      if (url.pathname === "/api/me") {
        if (!person) return (res.statusCode = 401), res.end("Sign in to continue."), true;
        return await allowance(res, grant ? { auth, person, grant } : undefined), json({ email: person.email, role: grant?.role ?? null }), true;
      }
      if (grant) asking = { auth, person, grant };
      else if (!(keys = ownKeysNamed(req))) {
        if (!person) return (res.statusCode = 401), res.end("Sign in to continue, or use your own API keys."), true;
        return (res.statusCode = 403), res.end(`${person.email ?? "This account"} isn't on the access list.`), true;
      }
    } else if (url.pathname === "/api/me") return json({ role: "maker" }), true;

    if (url.pathname === "/api/access") {
      // With no sign-in there is no list.
      if (!asking) return (res.statusCode = 404), res.end("This server has no access list, because it doesn't require sign-in."), true;
      await accessList(url, req, res, asking);
      return true;
    }
    const idioms = await load("idioms");
    await idioms.imaginedIn(idioms.idiomNamed(req.headers["x-idiom"]), () =>
      models.answeredBy(models.endpointNamed(req.headers["x-system-one"]), async () => {
        if (url.pathname === "/api/design") {
          await allowance(res, asking);
          await design(load, req, res);
        } else if (url.pathname === "/api/resolve") {
          if (req.method !== "POST") { res.statusCode = 405; res.end("Use POST."); return; }
          try {
            const { resolveNavigation } = await load("ia/navigation");
            json(await resolveNavigation(await readJson(req)));
          } catch (error) { res.statusCode = 400; res.end((error as Error).message); }
        } else if (url.pathname === "/api/turn") {
          await allowance(res, asking);
          await turn(load, req, res);
        } else await generate(load, url, req, res, asking);
      }, keys),
    );
    return true;
  };
}
