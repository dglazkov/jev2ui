// The pipelines over HTTP: two JSON routes and one of Server-Sent Events.
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

async function generate(load: Load, url: URL, req: IncomingMessage, res: ServerResponse) {
  const body = req.method === "POST" ? await readJson(req).catch(() => ({})) : {};
  const prompt = String(body.prompt ?? url.searchParams.get("prompt") ?? "").trim();
  const mode = body.mode ?? url.searchParams.get("mode") ?? "mock";
  if (!prompt || !["mock", "jobs", "hybrid", "baseline"].includes(mode)) {
    res.statusCode = 400;
    res.end("expected a prompt, and mode=mock|jobs|hybrid|baseline");
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

/** Answers a request under /api/ and resolves true, or resolves false: it was for someone else. */
export function api(load: Load) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname === "/api/design") await design(load, req, res);
    else if (url.pathname === "/api/generate") await generate(load, url, req, res);
    else if (url.pathname.startsWith("/api/photo/")) await photo(load, url.pathname.slice("/api/photo/".length), res);
    else return false;
    return true;
  };
}
