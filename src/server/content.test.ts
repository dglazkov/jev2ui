import { test } from "node:test";
import assert from "node:assert/strict";
import { ContentStreams } from "./content.js";
import { Run } from "./run.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("control readiness includes refinements spawned by writers and excludes pictures, baking and unrelated text", async () => {
  const streams = new ContentStreams(new Run("mock"), "main");
  const text = deferred(), refinement = deferred(), picture = deferred(), bake = deferred(), prose = deferred();
  let ready = false, settled = false;
  streams.spawn(text.promise.then(() => { streams.spawn(refinement.promise, "groups"); }), "groups");
  streams.spawn(picture.promise);
  streams.spawn(bake.promise);
  streams.spawn(prose.promise, "prose");
  const controls = streams.ready(new Set(["groups", "list", "form", "actions"])).then(() => { ready = true; });
  const all = streams.settle().then(() => { settled = true; });
  text.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready, false, "rendered text alone does not settle control types");
  refinement.resolve();
  await controls;
  assert.equal(ready, true);
  assert.equal(settled, false, "assets and unrelated text are still pending when links become ready");
  picture.resolve(); bake.resolve(); prose.resolve();
  await all;
});

test("failed control refinement prevents binding, but failed images do not prevent it", async () => {
  const streams = new ContentStreams(new Run("mock"), "main");
  streams.spawn(Promise.reject(new Error("image unavailable")));
  streams.spawn(Promise.resolve(), "list");
  await streams.ready(new Set(["list"]));
  await assert.rejects(streams.settle(), /image unavailable/);

  const broken = new ContentStreams(new Run("mock"), "main");
  broken.spawn(Promise.reject(new Error("control type unavailable")), "groups");
  await assert.rejects(broken.ready(new Set(["groups"])), /control type unavailable/);
  await assert.rejects(broken.settle(), /control type unavailable/);
});
