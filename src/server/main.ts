// The deployed server: the routes of http.ts, and the built front end
// (`npm run build`) beside them. It runs as one file (`build:server`): under
// tsx, with every package found file by file in node_modules, loading the
// pipelines took 0.7 s on a laptop and some 3.5 s of a cold Cloud Run
// instance, and the first person to click paid it. As one file it is 0.08 s,
// and it is done before the server listens, so nobody pays it at all. The session is the browser's
// (shared/journey.ts), so nothing here has to last: the designs already read
// (design-source.ts) are a saving, and made photographs are files.

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { api } from "./http.js";

const DIST = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT) || 8080;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/** The file in dist that a path names, or nothing: no such file, or a path that climbs out. */
function built(pathname: string): string | undefined {
  const path = normalize(join(DIST, decodeURIComponent(pathname)));
  if (path !== DIST && !path.startsWith(DIST + sep)) return undefined;
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, "index.html") : path;
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

if (!existsSync(join(DIST, "index.html"))) throw new Error("nothing is built: run `npm run build` first");

// Every module the routes load by name (http.ts), spelled out so that the bundler can see them.
const MODULES: Record<string, () => Promise<unknown>> = {
  apps: () => import("./apps.js"),
  auth: () => import("./auth.js"),
  baseline: () => import("./baseline.js"),
  change: () => import("./change.js"),
  "design-source": () => import("./design-source.js"),
  hybrid: () => import("./hybrid.js"),
  jobs: () => import("./jobs.js"),
  "mock/pipeline": () => import("./mock/pipeline.js"),
  models: () => import("./models.js"),
  "photos/generate": () => import("./photos/generate.js"),
};
const routes = api((module) => MODULES[module]?.() ?? Promise.reject(new Error(`main.ts does not know the module "${module}"`)));
// Loaded now, while the instance is starting, and not when the first person clicks.
await Promise.all(Object.values(MODULES).map((load) => load()));

createServer(async (req, res) => {
  try {
    if (await routes(req, res)) return;
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    const file = built(pathname);
    if (!file) return void ((res.statusCode = 404), res.end("not found"));
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      // Vite names what is in assets/ after its contents, so it can be kept for good; the pages cannot.
      "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  }
}).listen(PORT, () => console.log(`Apparite on :${PORT}`));
