import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
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

  // Isolated local process: no credentials, auth service, or model calls.
  const server = spawn(process.execPath, [resolve("dist-server/main.js")], {
    cwd, env: { PATH: process.env.PATH, PORT: String(port), FIREBASE_PROJECT: "", FIREBASE_API_KEY: "", DOTENV_CONFIG_PATH: join(cwd, "absent.env") },
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
});
