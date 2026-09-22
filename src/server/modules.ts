// Every module the routes load by name (http.ts), spelled out so that the bundler can see them.
export const MODULES = {
  apps: () => import("./apps.js"),
  auth: () => import("./auth.js"),
  baseline: () => import("./baseline.js"),
  change: () => import("./change.js"),
  "design-source": () => import("./design-source.js"),
  hybrid: () => import("./hybrid.js"),
  "ia/navigation": () => import("./ia/navigation.js"),
  idioms: () => import("./idioms.js"),
  jobs: () => import("./jobs.js"),
  "mock/pipeline": () => import("./mock/pipeline.js"),
  models: () => import("./models.js"),
  "photos/generate": () => import("./photos/generate.js"),
};

export type ServerModule = keyof typeof MODULES;
