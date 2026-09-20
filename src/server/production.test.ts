import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { initialArchitecture, initialNavigationQuestions } from "./ia/bootstrap.js";
import type { ScreenPlan } from "./mock/plan.js";
import { SAVED_APP } from "../shared/saved.js";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

test("the production bundle loads the link resolver through its HTTP route", { timeout: 20_000 }, async (t) => {
  await promisify(execFile)("npm", ["run", "build:server"]);
  const cwd = await mkdtemp(join(tmpdir(), "apparite-production-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, "dist"));
  await writeFile(join(cwd, "dist", "index.html"), "Production smoke test");

  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((done) => reservation.close(() => done()));

  // Fake only the model service; exercise the bundled SDK, endpoint selection,
  // resolver, and serialization over real local HTTP.
  let sameCandidate: string | undefined = "c0", modelCalls = 0;
  const model = createHttpServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { questions } = JSON.parse(body);
    modelCalls++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ answers: Object.fromEntries(Object.keys(questions).map((id) => {
      const choice = id === sameCandidate ? "same" : "different";
      return [id, { choice, probabilities: { [choice]: 1 } }];
    })), usage: { input_tokens: 1 } }));
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  t.after(() => new Promise<void>((done) => model.close(() => done())));
  const modelPort = (model.address() as { port: number }).port;

  // Isolated local process: no real credentials, auth service, or model calls.
  const server = spawn(process.execPath, [resolve("dist-server/main.js")], {
    cwd, env: { PATH: process.env.PATH, PORT: String(port), FIREBASE_PROJECT: "", FIREBASE_API_KEY: "", GEV_API_KEY: "local-test", GEV_BASE_URL: `http://127.0.0.1:${modelPort}`, DOTENV_CONFIG_PATH: join(cwd, "absent.env") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (server.exitCode !== null || server.signalCode !== null) return;
    const exited = once(server, "exit");
    server.kill();
    await exited;
  });
  await new Promise<void>((ready, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Production server did not start: ${output}`)), 8_000);
    const failed = (error: Error) => { clearTimeout(timer); reject(error); };
    server.once("error", failed);
    server.once("exit", (code) => failed(new Error(`Production server exited (${code}): ${output}`)));
    server.stderr.on("data", (chunk) => { output += chunk; });
    server.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes(`Apparite on :${port}`)) { clearTimeout(timer); ready(); }
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/resolve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 400);
  // Malformed input must reach the real resolver's validation, not fail module lookup.
  const issues = JSON.parse(await response.text());
  assert.deepEqual(issues.map((issue: { path: string[] }) => issue.path), [["state"], ["from"], ["via"]]);

  const answers = Object.fromEntries(Object.keys(initialNavigationQuestions()).map((id) => {
    const choice = id === "nav_home" ? "first" : "omit";
    return [id, { choice, probabilities: { [choice]: 1 } }];
  }));
  let state = initialArchitecture("Home", { archetype: "feed", topLevel: true } as ScreenPlan, answers);
  const resolveLink = async (label: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-System-One": "gev" },
      body: JSON.stringify({ state, from: { destination: "first", title: "Home", archetype: "feed" }, via: { kind: "asked", label } }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await response.text();
    assert.equal(response.status, 200, body);
    return JSON.parse(body);
  };
  const existing = await resolveLink("Home");
  assert.equal(existing.result.kind, "existing");
  assert.equal(existing.destination, "first");
  sameCandidate = undefined;
  const added = await resolveLink("Theme");
  assert.equal(added.result.kind, "new");
  assert.equal(added.state.map.nodes.length, 2);
  // A save/reopen must retain the catalog and bindings for the next resolve call.
  const saved = SAVED_APP.parse(JSON.parse(JSON.stringify({
    version: 3, app: "Home", architecture: added.state, design: { choice: "auto", markdown: "", seed: 0 },
    screens: [{ id: 1, destination: "first", keys: ["start"], title: "Home", archetype: "feed", topLevel: true, dialog: false,
      messages: [{ version: "v0.9" }], log: [], links: { "asked:Theme": added.destination }, request: { prompt: "Home" } }], stack: [1],
  })));
  state = saved.architecture!;
  sameCandidate = "c1";
  const reused = await resolveLink("Theme");
  assert.equal(reused.destination, added.destination);
  assert.equal(reused.state.map.nodes.length, 2);
  assert.equal(modelCalls, 3, "each unresolved link makes one identity request");
});
