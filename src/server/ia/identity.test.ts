import { test } from "node:test";
import assert from "node:assert/strict";
import { identityRequest, readIdentity, resolveIdentity, type IdentityInput } from "./identity.js";
import { scoreIdentity } from "../../probe/identity.js";
import { identityCases } from "../../probe/identity-cases.js";
const evidence = { from: { title: "Preferences", archetype: "settings" }, link: { kind: "row", label: "Theme" }, intent: "Choose app theme" };
const input: IdentityInput = { app: "Energy app", requested: evidence, catalog: [{ id: "stable-a", evidence, status: "generating" }, { id: "stable-b", evidence: { ...evidence, intent: "Choose energy units" }, status: "made" }] };
const answer = (choice: string) => ({ choice, probabilities: { [choice]: .8 } });

test("selection maps shuffled choice keys back to stable IDs, including in-flight destinations", () => {
  assert.deepEqual(readIdentity(input, "select", { destination: answer("c0") }), { kind: "existing", destination: "stable-a" });
  assert.deepEqual(readIdentity({ ...input, catalog: [...input.catalog].reverse() }, "select", { destination: answer("c1") }), { kind: "existing", destination: "stable-a" });
  assert.throws(() => readIdentity(input, "select", { destination: answer("c9") }), /Invalid/);
});
test("pair reduction distinguishes novel, conflicting and unresolved destinations", () => {
  assert.deepEqual(readIdentity(input, "pairs", { c0: answer("different"), c1: answer("different") }), { kind: "new" });
  assert.deepEqual(readIdentity(input, "pairs", { c0: answer("same"), c1: answer("same") }), { kind: "uncertain" });
  assert.deepEqual(readIdentity(input, "pairs", { c0: answer("same"), c1: answer("uncertain") }), { kind: "uncertain" });
  assert.throws(() => readIdentity(input, "pairs", { c0: answer("same") }), /Invalid/);
});
test("an empty catalog establishes novelty without any model call", async () => {
  const result = await resolveIdentity({ ...input, catalog: [] }, "select", async () => { throw new Error("must not call"); });
  assert.deepEqual(result.result, { kind: "new" });
  assert.equal(result.calls, 0);
});
test("incorrect reuse, duplicates and uncertainty have distinct scores", () => {
  assert.equal(scoreIdentity({ kind: "existing", destination: "a" }, { kind: "new" }).duplicate, true);
  assert.equal(scoreIdentity({ kind: "new" }, { kind: "existing", destination: "a" }).incorrectReuse, true);
  assert.equal(scoreIdentity({ kind: "uncertain" }, { kind: "new" }).prematureNew, true);
  assert.equal(scoreIdentity({ kind: "uncertain" }, { kind: "uncertain" }).correct, true);
});
test("capture provenance is verified and gold labels never enter either model request", async () => {
  const cases = await identityCases();
  assert.equal(cases.length, 20);
  assert.equal(cases.filter((c) => c.provenance.startsWith("recorded")).length, 6);
  for (const c of cases) for (const strategy of ["select", "pairs"] as const) {
    const request = JSON.stringify(identityRequest(c.input, strategy));
    assert.ok(!request.includes(c.id));
    assert.ok(!request.includes(c.rationale));
    assert.ok(!request.includes("expected"));
  }
});
