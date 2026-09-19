// The deployed server: the routes of http.ts, and the built front end
// (`npm run build`) beside them. One process, because what a session learns
// lives in it: the shelf of baked components (mock/bake.ts), the designs
// already read (design-source.ts).

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

const routes = api((module) => import(`./${module}.js`));

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
}).listen(PORT, () => console.log(`jev2ui on :${PORT}`));
