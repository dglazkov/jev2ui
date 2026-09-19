import { defineConfig, type Plugin } from "vite";
import type { IncomingMessage } from "node:http";

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

/** A DESIGN.md if one was sent, else the brief (and the seed of a remix) for Jev to mix one from. */
function designSource(body: any) {
  if (typeof body.markdown === "string" && body.markdown.trim()) return { markdown: body.markdown as string };
  const brief = String(body.brief ?? "").trim();
  return brief ? { brief, seed: Number(body.seed) || 0 } : undefined;
}

/** Serves the pipelines as Server-Sent Events from the Vite dev server. */
function api(): Plugin {
  return {
    name: "jev2ui-api",
    configureServer(server) {
      // Loaded through Vite so edits to the pipelines apply without a restart.
      const load = (path: string) => server.ssrLoadModule(path);

      // POST {markdown} reads a DESIGN.md; POST {brief} has Jev mix one. Either way: a theme, lint findings, Jev's reading.
      server.middlewares.use("/api/design", async (req, res) => {
        try {
          const body = await readJson(req);
          const source = designSource(body) ?? { brief: "" };
          if ("brief" in source && !source.brief) throw new Error("expected {markdown} or {brief}");
          const { loadDesign } = await load("/src/server/design-source.ts");
          const { report, mixed } = await loadDesign(source).loaded;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ report, markdown: mixed }));
        } catch (error) {
          res.statusCode = 400;
          res.end(error instanceof Error ? error.message : String(error));
        }
      });

      // Photographs the image model made, kept in .cache/photos.
      server.middlewares.use("/api/photo/", async (req, res) => {
        const { readMade } = await load("/src/server/photos/generate.ts");
        const made = readMade((req.url ?? "").replace(/^\//, "").split("?")[0]);
        if (!made) return void ((res.statusCode = 404), res.end());
        res.writeHead(200, { "Content-Type": made.mime, "Cache-Control": "public, max-age=31536000, immutable" });
        res.end(made.bytes);
      });

      server.middlewares.use("/api/generate", async (req, res) => {
        const url = new URL(req.url ?? "", "http://localhost");
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
        });
        const { runHybrid } = await load("/src/server/hybrid.ts");
        const { runMock } = await load("/src/server/mock/pipeline.ts");
        const { runBaseline } = await load("/src/server/baseline.ts");
        const { runJobs } = await load("/src/server/jobs.ts");
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
      });
    },
  };
}

export default defineConfig({
  plugins: [api()],
  server: { port: 5173 },
  build: { rollupOptions: { input: ["index.html", "compare.html"] } },
});
