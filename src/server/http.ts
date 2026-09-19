// The pipelines over HTTP: two JSON routes and one of Server-Sent Events; and who may use them.
// Where sign-in is on (auth.ts), each wants to know who is asking and that the
// list lets them make things, and a run is taken from their allowance for the day.
//
// Two servers mount this. In development it is the Vite dev server
// (vite.config.ts), which loads the pipelines through Vite so that edits to
// them apply without a restart; deployed, it is main.ts, which imports them.
// That is why nothing here imports a pipeline: whoever mounts the routes says
// how a module is loaded.

import type { IncomingMessage, ServerResponse } from "node:http";

/** Loads a module of src/server by its path from there, without the extension: "mock/pipeline". */
export type Load = (module: string) => Promise<any>;

/** A DESIGN.md is the largest thing anyone sends. */
const LARGEST_BODY = 1 << 20;

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > LARGEST_BODY) throw new Error("too much was sent");
  }
  return JSON.parse(body || "{}");
}

/** A DESIGN.md if one was sent, else the brief (and the seed of a remix) for Jev to mix one from. */
function designSource(body: any) {
  if (typeof body.markdown === "string" && body.markdown.trim()) return { markdown: body.markdown as string };
  const brief = String(body.brief ?? "").trim();
  return brief ? { brief, seed: Number(body.seed) || 0 } : undefined;
}

// POST {markdown} reads a DESIGN.md; POST {brief} has Jev mix one. Either way: a theme, lint findings, Jev's reading.
async function design(load: Load, req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJson(req);
    const source = designSource(body) ?? { brief: "" };
    if ("brief" in source && !source.brief) throw new Error("expected {markdown} or {brief}");
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
    res.end("expected a prompt, and mode=mock|jobs|hybrid|baseline");
    return;
  }
  const spent = !asking || (await asking.auth.spend(asking.person, asking.grant));
  await allowance(res, asking);
  if (!spent) {
    res.statusCode = 429;
    res.end(`Today's ${asking!.grant.runs} runs are used up. There are more tomorrow (the day turns over at midnight UTC).`);
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
      ? runMock(prompt, designSource(body), body.journey, Boolean(body.fresh))
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
  if (grant.role !== "admin") return refuse(403, "the list is an admin's to edit");
  if (req.method === "PUT" || req.method === "DELETE") {
    const line = req.method === "PUT" ? await readJson(req).catch(() => ({})) : { pattern: url.searchParams.get("pattern") ?? "" };
    // Nobody saws off the branch they sit on: the line that makes this person an admin stays, and stays an admin's.
    if (String(line.pattern).trim().toLowerCase() === grant.pattern && line.role !== "admin") return refuse(400, "that line is what makes you an admin; another admin can change it");
    const wrong = req.method === "PUT" ? await auth.grant(person, line) : await auth.revoke(line.pattern);
    if (wrong) return refuse(400, wrong);
  } else if (req.method !== "GET") return refuse(405, "GET, PUT or DELETE");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(await auth.everything()));
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
    if (!["/api/config", "/api/me", "/api/access", "/api/design", "/api/generate"].includes(url.pathname)) return false;
    const auth = await load("auth");
    const json = (value: unknown) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(value)));
    if (url.pathname === "/api/config") return json({ firebase: auth.firebase }), true;

    let asking: Asking | undefined;
    if (auth.firebase) {
      const person = await auth.whoIs(req.headers.authorization);
      if (!person) return (res.statusCode = 401), res.end("sign in first"), true;
      const grant = await auth.access(person);
      // Signed in and on no line of the list is something to tell the person, not an error: /api/me says so.
      if (url.pathname === "/api/me") return await allowance(res, grant && { auth, person, grant }), json({ email: person.email, role: grant?.role ?? null }), true;
      if (!grant) return (res.statusCode = 403), res.end(`${person.email ?? "this account"} is not on the list of people who can make things here`), true;
      asking = { auth, person, grant };
    } else if (url.pathname === "/api/me") return json({ role: "maker" }), true;

    if (url.pathname === "/api/access") {
      // With no sign-in there is no list.
      if (!asking) return (res.statusCode = 404), res.end("there is no list: nobody has to sign in here"), true;
      await accessList(url, req, res, asking);
    } else if (url.pathname === "/api/design") {
      await allowance(res, asking);
      await design(load, req, res);
    } else await generate(load, url, req, res, asking);
    return true;
  };
}
