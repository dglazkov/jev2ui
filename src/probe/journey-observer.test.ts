import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { recordJourney } from "./journey-recording.js";
import { observer } from "./journey-observer.js";
import { CASES } from "./coherence-cases.js";

test("observer exposes pending, answered and failed steps, and keeps completed recordings replayable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "journey-observer-"));
  const server = observer(directory);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/runs`)).json(), { runs: [], unreadable: 0 });
    const trace = await recordJourney({ endpoint: "jev", model: "test", cases: CASES.slice(0, 1), questions: { relation: "test question" } }, directory);
    const read = async () => (await fetch(`${base}/api/runs/${trace.recording.id}`)).json();
    await trace.event("request", CASES[0].id, 0, { state: { action: "Settings" } });
    const pending = await read();
    assert.equal(pending.status, "running");
    assert.equal(pending.events[0].kind, "request");
    await trace.event("answer", CASES[0].id, 0, { answers: { relation: { choice: "starts", probabilities: { starts: .8, repeats: .2 } } }, match: true });
    await trace.event("request", CASES[0].id, 1, { state: { action: "Gear" } });
    await trace.event("error", CASES[0].id, 1, { message: "Endpoint unavailable" });
    await trace.finish("failed", { answered: 1, matched: 1, errors: 1 });
    const completed = await read();
    assert.deepEqual(completed.events.map((e: { sequence: number }) => e.sequence), [1, 2, 3, 4]);
    assert.equal(completed.events[1].data.answers.relation.probabilities.repeats, .2);
    assert.equal(completed.events[3].data.message, "Endpoint unavailable");
    assert.deepEqual(completed, JSON.parse(await readFile(trace.file, "utf8")));
    assert.equal(completed.status, "failed");
    await writeFile(join(directory, "broken.json"), "{");
    await writeFile(join(directory, "pending.json.tmp"), "{");
    const index = await (await fetch(`${base}/api/runs`)).json();
    assert.equal(index.runs.length, 1);
    assert.equal(index.unreadable, 1);
    assert.equal((await fetch(`${base}/api/runs/not-found`)).status, 404);
    assert.equal((await fetch(`${base}/api/runs/%2e%2e%2fpackage`)).status, 404);
    assert.equal((await fetch(`${base}/api/runs`, { method: "POST" })).status, 405);
    assert.match(await (await fetch(base)).text(), /IA observer/);
    assert.match(await (await fetch(`${base}/transitions`)).text(), /Journey observer/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    await rm(directory, { recursive: true, force: true });
  }
});
