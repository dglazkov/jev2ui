import { defineConfig, type Plugin } from "vite";
import { api as routes } from "./src/server/http.js";

/** Serves the pipelines from the Vite dev server. Deployed, src/server/main.ts serves the same routes. */
function api(): Plugin {
  return {
    name: "jev2ui-api",
    configureServer(server) {
      // Loaded through Vite so edits to the pipelines apply without a restart.
      const answer = routes((module) => server.ssrLoadModule(`/src/server/${module}.ts`));
      server.middlewares.use((req, res, next) => {
        // Connect hands over the URL as it arrived only when the middleware has no path of its own.
        answer(req, res).then((answered) => answered || next(), next);
      });
    },
  };
}

export default defineConfig({
  plugins: [api()],
  server: { port: 5173 },
  build: { rollupOptions: { input: ["index.html", "compare.html"] } },
});
