// Local, read-only observer for probe artifacts. Kept separate from the deployed app and its auth/routes.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RECORDINGS, type Recording } from "./journey-recording.js";
import type { IARecording } from "./ia-recording.js";

export function observer(directory = RECORDINGS) {
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "GET") { res.writeHead(405); res.end("Read only"); return; }
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/" || url.pathname === "/transitions" || url.pathname === "/samples") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(await readFile(new URL(url.pathname === "/" ? "./ia-observer.html" : url.pathname === "/samples" ? "./ia-samples-observer.html" : "./journey-observer.html", import.meta.url)));
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (url.pathname === "/api/suites") {
        const root = resolve(".cache/ia-suites");
        const names = await readdir(root).catch((e: NodeJS.ErrnoException) => { if(e.code === "ENOENT") return []; throw e; });
        const found = await Promise.allSettled(names.filter((n) => /^[\w-]+$/.test(n)).sort().reverse().map(async (n) => JSON.parse(await readFile(resolve(root, n, "report.json"), "utf8"))));
        res.end(JSON.stringify({ suites: found.flatMap((r) => r.status === "fulfilled" ? [{ id: r.value.id, started: r.value.started, variants: r.value.variants }] : []) })); return;
      }
      const suite = /^\/api\/suites\/([\w-]+)$/.exec(url.pathname);
      if (suite) { res.end(await readFile(resolve(".cache/ia-suites", suite[1], "report.json"))); return; }
      if (url.pathname === "/api/runs") {
        const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
        const results = await Promise.allSettled(files.filter((file) => /^[\w-]+\.json$/.test(file)).sort().reverse().map(async (file) => {
          const run: Recording | IARecording = JSON.parse(await readFile(resolve(directory, file), "utf8"));
          return { id: run.id, version: run.version, started: run.started, updated: run.updated, status: run.status, endpoint: run.endpoint, summary: run.summary, ...(run.version === 3 ? { phase: run.phase, title: run.seed.brief, sample: run.sample } : {}) };
        }));
        const runs = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
        res.end(JSON.stringify({ runs, unreadable: results.length - runs.length }));
        return;
      }
      const match = /^\/api\/runs\/([\w-]+)$/.exec(url.pathname);
      if (match) {
        res.end(await readFile(resolve(directory, `${match[1]}.json`)));
        return;
      }
      res.writeHead(404); res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      res.writeHead(missing ? 404 : 500);
      res.end(JSON.stringify({ error: missing ? "Recording not found" : "Could not read recording" }));
      if (!missing) console.error(error);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.JOURNEY_PORT ?? 5174);
  const server = observer();
  server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`IA observer: http://127.0.0.1:${port}\nWatching ${RECORDINGS}\nRun npm run probe:ia in another terminal. Ctrl+C stops the observer.`));
}
