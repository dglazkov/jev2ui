import { defineConfig, type Plugin } from "vite";

/** Serves the pipelines as Server-Sent Events from the Vite dev server. */
function api(): Plugin {
  return {
    name: "jev2ui-api",
    configureServer(server) {
      server.middlewares.use("/api/generate", async (req, res) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const prompt = url.searchParams.get("prompt")?.trim();
        const mode = url.searchParams.get("mode");
        if (!prompt || (mode !== "hybrid" && mode !== "baseline")) {
          res.statusCode = 400;
          res.end("expected ?mode=hybrid|baseline&prompt=...");
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        // Loaded through Vite so edits to the pipelines apply without a restart.
        const { runHybrid } = await server.ssrLoadModule("/src/server/hybrid.ts");
        const { runBaseline } = await server.ssrLoadModule("/src/server/baseline.ts");
        const events = mode === "hybrid" ? runHybrid(prompt) : runBaseline(prompt);
        let open = true;
        req.on("close", () => (open = false));
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
});
