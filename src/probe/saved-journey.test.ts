import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { capturedJourney, criticPlace, savedPlace } from "./saved-journey.js";
import type { SavedScreen } from "../shared/saved.js";

test("real capture retains final values and generation evidence without sending the diagnosis to the critic", async () => {
  const raw = JSON.parse(await readFile(new URL("./fixtures/podcast-settings.json", import.meta.url), "utf8"));
  const original = JSON.stringify(raw);
  const { cases: [journey] } = capturedJourney(raw);
  const before = journey.start;
  const after = journey.hops[0].to;
  const firstGroups = before.content!.data.groups as Array<{ rows: Array<{ label: string; value?: string }> }>;
  assert.equal(firstGroups[2].rows[0].value, "alex.turner@example.com");
  assert.equal(after.title, "Playback Settings");
  assert.equal(before.generation!.plan!.appBarAction, "settings");
  assert.equal(after.generation!.plan!.appBarAction, null);
  assert.equal(journey.hops[0].action, "appbar: settings");
  const input = JSON.stringify(criticPlace(before));
  assert.ok(!input.includes('"generation"'));
  assert.ok(!input.includes('"expected"'));
  assert.ok(!input.includes('"decisions"'));
  assert.equal(JSON.stringify(raw), original, "extracting the final state must not rewrite the saved stream");
  raw.app.app = "changed brief";
  assert.throws(() => capturedJourney(raw), /fingerprint/);
});

test("saved data is replayed with replacements and nested updates, not concatenated streamed fragments", () => {
  const screen = { id: 1, title: "Test", request: {}, log: [], messages: [
    { updateDataModel: { path: "/groups", value: [{ title: "Partial" }] } },
    { updateDataModel: { path: "/groups", value: [{ title: "Final", rows: [{ label: "Email", value: "old" }] }] } },
    { updateDataModel: { path: "/groups/0/rows/0/value", value: "new" } },
  ] } as unknown as SavedScreen;
  assert.deepEqual(savedPlace(screen).content!.data.groups, [{ title: "Final", rows: [{ label: "Email", value: "new" }] }]);
});

test("navigation capture includes the recorded route and earlier destinations, without future screens or generation judgments", async () => {
  const raw = JSON.parse(await readFile(new URL("./fixtures/podcast-settings-return.json", import.meta.url), "utf8"));
  const { cases: [journey] } = capturedJourney(raw);
  assert.equal(journey.start.id, "4");
  assert.equal(journey.hops[0].action, "nav: Settings");
  assert.equal(journey.hops[0].to.id, "5");
  assert.deepEqual(journey.existing!.map((s) => s.id), ["1", "2", "3"]);
  assert.deepEqual(journey.history!.map((h) => [h.from.id, h.action, h.to.id]), [["1", "back: back", "4"]]);
  const input = JSON.stringify({ existing: journey.existing!.map(criticPlace), history: journey.history!.map((h) => ({ from: criticPlace(h.from), action: h.action, to: criticPlace(h.to) })) });
  assert.ok(!input.includes('"generation"'));
  assert.ok(!input.includes('"expected"'));
  raw.transition.from = 3;
  assert.throws(() => capturedJourney(raw), /source\/action/);
  raw.transition.from = 4;
  raw.transition.to = 2;
  raw.transition.from = 1;
  delete raw.history;
  const early = capturedJourney(raw).cases[0];
  assert.equal(early.existing, undefined, "later-generated screens must not leak into an earlier transition");
});
