import { test } from "node:test";
import assert from "node:assert/strict";
import type { Baked } from "../../shared/kit.js";
import { bakeCustom, calls as bakeCalls } from "../mock/bake.js";
import { Pictures, calls as pictureCalls, type Wanted } from "../mock/pictures.js";
import type { ScreenPlan } from "../mock/plan.js";
import type { Run } from "../run.js";
import { fill, sourcesOf } from "./fill.js";
import { SCREEN as TOOL, chainOf } from "../mock/graph.js";
import { checkGrammar, parseGrammar, walk, type Field, type Grammar, type Node, type Source } from "./format.js";
import { loadGrammar } from "./load.js";
import { checkBindings } from "./make.js";

const screen = TOOL;
const kit = loadGrammar("kit.md");
const sources = sourcesOf(kit);
const named = (grammar: Grammar, name: string): Node => {
  let found: Node | undefined;
  walk(grammar.nodes, (node) => void (node.name === name && (found = node)));
  return found!;
};
const fieldOf = (node: Node, name: string): Field => {
  let found: Field | undefined;
  const into = (fields: Field[]) => fields.forEach((field) => (field.name === name && (found ??= field), into(field.fields)));
  into(node.fields);
  return found!;
};

test("a chain is tried in order, the first source that has something wins, and what is made again passes over what was already had", async () => {
  const chain: Source = [{ name: "shelf", from: true }, { name: "baked" }, { name: "closed" }];
  const tried: string[] = [];
  const fillers = (has: string[]) => Object.fromEntries(["shelf", "baked", "closed"].map((name) => [name, async () => (tried.push(name), has.includes(name) ? name.toUpperCase() : undefined)]));
  assert.deepEqual(await fill(chain, fillers(["shelf", "baked", "closed"]), sources), { from: "shelf", value: "SHELF" });
  assert.deepEqual(await fill(chain, fillers(["closed"]), sources), { from: "closed", value: "CLOSED" });
  assert.deepEqual(tried, ["shelf", "shelf", "baked", "closed"]);
  tried.length = 0;
  assert.deepEqual(await fill(chain, fillers(["shelf", "baked", "closed"]), sources, { fresh: true }), { from: "baked", value: "BAKED" });
  assert.deepEqual(tried, ["baked"], "a set is what was already had");
  assert.equal(await fill(chain.slice(0, 2), fillers([]), sources), undefined, "a chain with no terminal can end in nothing, which is why the lint asks for one");
  await assert.rejects(fill([{ name: "conjured" }], {}, sources), /nothing here knows how to get a value from "conjured"/);
});

// --- The custom part, against bakeCustom -------------------------------------------

const GOOD = { name: "Timer ring", card: "The person watches a countdown.", dataSchema: '{"type":"object"}', data: '{"minutes":25}', source: "function render(root, state, kit) { root.textContent = 'ring'; }" };
const BAD = { ...GOOD, source: "function render(root) { root.style.color = '#ff0000'; fetch('x'); }" };
const onShelf: Baked = { id: "0123456789abcdef", name: "Seating plan", card: "The person chooses seats in a venue.", source: GOOD.source, dataSchema: { type: "object" }, contract: { use: "watch", size: "square", linked: false } };
const plan = { archetype: "dashboard", blocks: ["custom", "stats"], custom: { use: "watch", size: "square", linked: false } } as unknown as ScreenPlan;

interface Script {
  shelf: Baked[];
  fresh?: boolean;
  /** What Jev says when offered the shelf. */
  jev?: string;
  /** What the small model does when asked for a reused component's data. */
  write?: "ok" | "throws";
  /** What the baker replies, attempt by attempt. */
  bakes: Array<typeof GOOD>;
}

/** Runs one way of filling the custom part under a script, and returns everything it did that anyone could see. */
async function under(script: Script, how: (run: Run) => Promise<void>): Promise<string[]> {
  const log: string[] = [];
  const run = {
    stats: { geminiInputTokens: 0, geminiOutputTokens: 0 },
    trace: (event: { stage: string; detail?: string }) => log.push(`trace ${event.stage}${event.detail?.startsWith("rejected") ? ` (${event.detail.slice(0, 40)})` : ""}`),
    send: (body: unknown) => log.push(`send ${JSON.stringify(body)}`),
    askJev: async (stage: string, _state: unknown, questions: Record<string, { criteria: Record<string, string> }>) => {
      log.push(`jev ${stage}: ${Object.keys(questions.component.criteria).join(",")}`);
      const choice = script.jev ?? "none";
      return { stage, ms: 0, inputTokens: 0, answers: { component: { choice, probabilities: { [choice]: 0.9 } } } };
    },
  } as unknown as Run;
  const bakes = [...script.bakes];
  const real = { ...bakeCalls };
  bakeCalls.bake = async () => (log.push("bake"), { text: JSON.stringify(bakes.shift() ?? BAD), ms: 0, firstChunkMs: 0, inputTokens: 0, outputTokens: 0 });
  bakeCalls.write = async () => {
    log.push("write");
    if (script.write === "throws") throw new Error("not the schema");
    return { text: '{"data":{"seats":12}}', ms: 0, firstChunkMs: 0, inputTokens: 0, outputTokens: 0 };
  };
  try {
    await how(run);
  } finally {
    Object.assign(bakeCalls, real);
  }
  return log;
}

const SCRIPTS: Record<string, Script> = {
  "nothing on the shelf, and the bake passes": { shelf: [], bakes: [GOOD] },
  "Jev takes what is on the shelf, and only its data is written": { shelf: [onShelf], jev: "c1", write: "ok", bakes: [] },
  "Jev says none of these": { shelf: [onShelf], jev: "none", bakes: [GOOD] },
  "what is on the shelf cannot be filled, so one is baked": { shelf: [onShelf], jev: "c1", write: "throws", bakes: [GOOD] },
  "the first bake is refused and the second passes": { shelf: [], bakes: [BAD, GOOD] },
  "both bakes are refused, and the slot closes": { shelf: [], bakes: [BAD, BAD] },
  "made again at the developer's word: the shelf is not looked on": { shelf: [onShelf], fresh: true, jev: "c1", bakes: [GOOD] },
  "a shelf of things that draw the list, for a part that does not": { shelf: [{ ...onShelf, contract: { ...onShelf.contract, linked: true } }], bakes: [GOOD] },
};

test("the custom part is filled as the file says, from the shelf else baked else closed, under eight scripts", async () => {
  assert.deepEqual(chainOf("custom").map((step) => step.name), ["shelf", "baked", "closed"]);
  const setting = { voice: "" };
  const told = async (name: string) => (await under(SCRIPTS[name], (run) => bakeCustom(run, "main", "Pomodoro timer", plan, setting, SCRIPTS[name].shelf, SCRIPTS[name].fresh))).map((line) => line.split(" ")[0]).join(" ");
  assert.equal(await told("nothing on the shelf, and the bake passes"), "bake trace send send");
  assert.equal(await told("Jev takes what is on the shelf, and only its data is written"), "jev trace write trace send send");
  assert.equal(await told("Jev says none of these"), "jev trace bake trace send send");
  assert.equal(await told("what is on the shelf cannot be filled, so one is baked"), "jev trace write trace bake trace send send");
  assert.equal(await told("the first bake is refused and the second passes"), "bake trace bake trace send send");
  assert.equal(await told("both bakes are refused, and the slot closes"), "bake trace bake trace send");
  assert.equal(await told("made again at the developer's word: the shelf is not looked on"), "bake trace send send");
  assert.equal(await told("a shelf of things that draw the list, for a part that does not"), "bake trace send send");
  for (const [name, script] of Object.entries(SCRIPTS)) {
    const log = await under(script, (run) => bakeCustom(run, "main", "Pomodoro timer", plan, setting, script.shelf, script.fresh));
    assert.equal(log.at(-1)!.includes('"failed":true'), name.includes("closes"), name);
  }
});

// --- A picture, against Pictures.find ----------------------------------------------

interface Shoot {
  /** What Jev says when offered photographs from the library. */
  jev: string;
  makes: "a picture" | "nothing" | "fails";
  p?: number;
}

async function shooting(shoot: Shoot, how: (pictures: Pictures, wanted: Wanted, show: (url: string) => void) => Promise<void>): Promise<string[]> {
  const log: string[] = [];
  const run = {
    trace: (event: { stage: string }) => log.push(`trace ${event.stage.replace(/".*"/, '"…"')}`),
    askJev: async (stage: string, _state: unknown, questions: Record<string, unknown>) => {
      const [id] = Object.keys(questions);
      log.push(`jev ${id}`);
      const choice = id === "subject" ? "mountain" : shoot.jev;
      return { stage, ms: 0, inputTokens: 0, answers: { [id]: { choice, probabilities: { [choice]: 0.9, none: 0.05 } } } };
    },
  } as unknown as Run;
  const real = { ...pictureCalls };
  pictureCalls.makesPhotos = () => shoot.makes !== "nothing";
  pictureCalls.makePhoto = async (brief) => {
    log.push(`paint ${brief.subject}`);
    if (shoot.makes === "fails") throw new Error("the image model is out");
    return { id: "made0001", alt: brief.of, words: [], subjects: [brief.subject] };
  };
  try {
    await how(new Pictures(run, "Hiking trails near me", "Hiking trails near me"), { subject: "mountain", p: shoot.p ?? 0.9, of: "Alpine ridge trail · 12 km", ratio: "4:3", size: [640, 480] }, (url) => log.push(`show ${url.replace(/photo-[^?]+/, "photo")}`));
  } finally {
    Object.assign(pictureCalls, real);
  }
  return log;
}

const SHOOTS: Record<string, Shoot> = {
  "Jev takes a photograph from the library": { jev: "photo_0", makes: "a picture" },
  "none of these, so one is made": { jev: "none", makes: "a picture" },
  "none of these, and the image model fails: the frame stays": { jev: "none", makes: "fails" },
  "none of these, where no pictures are made": { jev: "none", makes: "nothing" },
  "the subject was a guess, so the words are read first": { jev: "photo_1", makes: "a picture", p: 0.4 },
};

test("a picture is looked for as the file says, in the library else painted else the frame stays, under five", async () => {
  const chain = fieldOf(named(screen, "list"), "imageUrl").source!;
  assert.deepEqual(chain, [{ name: "library", from: true, by: "item_subject" }, { name: "painted" }, { name: "placeholder" }]);
  assert.deepEqual(fieldOf(named(screen, "hero"), "imageUrl").source!.map((step) => step.by ?? step.name), ["hero_subject", "painted", "placeholder"]);
  const told = async (name: string, order = chain) => (await shooting(SHOOTS[name], (pictures, wanted, show) => pictures.find(wanted, show, order))).map((line) => line.split(" ")[0]).join(" ");
  assert.equal(await told("Jev takes a photograph from the library"), "jev trace show");
  assert.equal(await told("none of these, so one is made"), "jev trace paint trace show");
  assert.equal(await told("none of these, and the image model fails: the frame stays"), "jev trace paint trace");
  assert.equal(await told("none of these, where no pictures are made"), "jev trace");
  assert.equal(await told("the subject was a guess, so the words are read first"), "jev trace jev trace show");
  // With the chain the other way round, a picture is painted before the library is looked in.
  assert.equal(await told("Jev takes a photograph from the library", [chain[1], chain[0], chain[2]]), "paint trace show");
});

// --- What a lint can say about chains, from the files alone --------------------------

test("every chain in the tool's graph and in the email graph ends in something that cannot fail, and names what the catalog has", () => {
  for (const file of ["screen.md", "examples/email.md"]) {
    const grammar = loadGrammar(file);
    assert.deepEqual(checkBindings(grammar, kit).errors, [], file);
    let chains = 0;
    const into = (fields: Field[]) => fields.forEach((field) => ((chains += field.source ? 1 : 0), into(field.fields)));
    walk(grammar.nodes, (node) => ((chains += node.filled ? 1 : 0), into(node.fields)));
    assert.ok(chains >= 3, `${file} has ${chains} chains`);
  }
});

test("a chain that can end in nothing, a source nobody has, a shelf nothing names, and a knob set to what it cannot be are all said", () => {
  const broken = parseGrammar(
    [
      "# thing",
      "## kind",
      "> What is it?",
      "- **a** — An a.",
      "  `HERO chart`",
      "- **b** — A b.",
      "  `hero`",
      "### hero → picture",
      "> Does a picture lead?",
      "- `imageUrl` as picture, from library by mood else painted",
      "- `credit` conjured else placeholder",
      "### chart → slot with ratio 2:1, depth deep",
      "> Is there a chart?",
      "→ A chart of the figures, to read.",
      "filled baked by kind else closed",
    ].join("\n"),
  );
  assert.deepEqual(checkGrammar(broken).errors, ['"imageUrl" is looked for by "mood", which is not a choice that is asked']);
  assert.deepEqual(checkBindings(broken, kit), {
    errors: [
      '"hero.imageUrl" ends in "painted", which can come up empty: end the chain with closed or placeholder',
      '"hero.credit" comes from "conjured", which the catalog does not have',
      '"chart" sets "ratio" to "2:1", and it is one of 3:1, 16:9, 1:1, 3:4',
      '"chart" sets "depth", and "slot" has no such knob',
    ],
    warnings: ['"chart": "by kind" says where in a set to look, and "baked" is not a set'],
  });
});
