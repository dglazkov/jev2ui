// The pipeline holds nothing but the reading: what the design overrules is rules in the file with the design's
// facts given, and what stays of a screen made again is what the browser sent back of its reading.

import { test } from "node:test";
import assert from "node:assert/strict";
import { IDIOMS } from "../idioms.js";
import { DESIGN_SAYS } from "../grammar/fixtures.js";
import { frameOf, treeOf } from "../grammar/make.js";
import { JEV, questionsOf, readGrammar } from "../grammar/read.js";

const { graph, patterns } = IDIOMS.kit;
const SCREEN = graph.grammar;
const partNode = graph.partNode.bind(graph);

function feedAnswers(hero: number, leading = "thumbnail", layout = "cards") {
  return Object.fromEntries(
    Object.entries(questionsOf(SCREEN)).map(([key, q]) => {
      if (q.type === "choice") {
        const choice = key === "archetype" ? "feed" : key === "item_leading" ? leading : key === "list_layout" ? layout : Object.keys(q.criteria)[0];
        return [key, { choice, probabilities: { [choice]: 1 } }];
      }
      return [key, { noul: key === "has_hero" ? hero : key === "has_list" ? 1 : 0 }];
    }),
  );
}
const read = (hero: number, design = DESIGN_SAYS, leading?: string, layout?: string) => readGrammar(SCREEN, feedAnswers(hero, leading, layout), JEV, { values: { top_level: true, ...design } });

test("a feed can render the existing hero when selected, while a plain feed stays a list", () => {
  const featured = read(0.99);
  assert.deepEqual(featured.blocks, ["hero", "list"]);
  const look = { contained: true, icons: true, symbol: "image" };
  const parts = featured.blocks.map((block) => treeOf(patterns, SCREEN, partNode(block), featured, look));
  const tree = [...frameOf(patterns, SCREEN, featured, look, parts.map((tree, i) => ({ name: featured.blocks[i], root: tree[0].id })))!, ...parts.flat()];
  assert.equal(tree.find((c) => c.id === "hero")?.component, "Image");
  assert.ok(tree.some((c) => c.id === "navbar"), "a hero does not turn the home into a detail screen");
  assert.deepEqual(read(0.01).blocks, ["list"]);
});

test("what the design rules out, the file's rules take off the screen, and say why", () => {
  const noPhotographs = read(0.99, { ...DESIGN_SAYS, photographs: false });
  assert.deepEqual(noPhotographs.blocks, ["list"]);
  assert.match(noPhotographs.decisions.find((d) => d.id === "has_hero")!.note!, /no photographs/);
  // Items led by a thumbnail are led by a symbol instead, and laid out as rows; with no symbols either, by nothing.
  assert.deepEqual([noPhotographs.values.item_leading, noPhotographs.values.list_layout], ["icon", "rows"]);
  const nothing = read(0.99, { photographs: false, symbols: false, cards: true });
  assert.deepEqual([nothing.values.item_leading, nothing.values.list_layout], ["none", "rows"]);
  // Without cards, picture cards and reels become rows; a grid stays a grid.
  assert.equal(read(0.5, { ...DESIGN_SAYS, cards: false }).values.list_layout, "rows");
  assert.equal(read(0.5, { ...DESIGN_SAYS, cards: false }, "thumbnail", "grid").values.list_layout, "grid");
  // A design that says nothing changes nothing.
  assert.deepEqual([read(0.99).values.item_leading, read(0.99).values.list_layout], ["thumbnail", "cards"]);
});

test("people are pictured as portraits: a rule, not a special case", () => {
  assert.equal(read(0.5, DESIGN_SAYS, "avatar").values.item_subject, "portrait");
  assert.notEqual(read(0.5, DESIGN_SAYS, "thumbnail").values.item_subject, "portrait");
});

test("what stays of a reading the browser sent back: valid answers, under the parts that stay, and the old plan shape still read", () => {
  const sent = { kind: "feed", blocks: ["list"], values: { top_level: false, item_leading: "avatar", list_layout: "grid", search: true, item_price: true, custom_size: "tall", screen_icon: "not_a_symbol", stat_deltas: "yes" }, p: {} };
  // The list stays: its answers are kept. The filters do not: `search` is not. A value that is not an option is not.
  assert.deepEqual(graph.keptOf(sent, ["list"]), { top_level: false, list_layout: "grid", item_leading: "avatar", item_price: true });
  assert.deepEqual(graph.keptOf(sent, ["list", "filters", "custom"]), { top_level: false, list_layout: "grid", item_leading: "avatar", item_price: true, search: true, custom_size: "tall" });
  // An app saved before readings travelled holds a plan: it is read as one.
  const plan = { archetype: "feed", blocks: ["list"], topLevel: true, person: false, appBarAction: "search", list: { layout: "rows", leading: "avatar", trailing: "chevron", parts: ["price"] }, search: false, statDeltas: false, factsTotal: true, symbol: "image", pictures: { hero: { subject: "dish", p: 1 }, items: { subject: "portrait", p: 1 } } };
  const kept = graph.keptOf(plan, ["list", "facts"]);
  assert.deepEqual([kept.top_level, kept.app_bar_action, kept.list_layout, kept.item_price, kept.item_rating, kept.facts_total, kept.screen_icon, kept.item_subject], [true, "search", "rows", true, false, true, "none", "portrait"]);
  // And what is kept is read as settled: certain, and said so; the rules still have their say over it (a grid of avatars is rows).
  const consistent = { ...sent, values: { ...sent.values, item_leading: "thumbnail" } };
  const again = readGrammar(SCREEN, feedAnswers(0.01), JEV, { blocks: ["list"], values: { ...DESIGN_SAYS, ...graph.keptOf(consistent, ["list"]) } });
  assert.deepEqual([again.values.list_layout, again.values.item_leading, again.decisions.find((d) => d.id === "list_layout")?.note, again.decisions.find((d) => d.id === "list_layout")?.p], ["grid", "thumbnail", "settled beforehand", 1]);
  assert.equal(readGrammar(SCREEN, feedAnswers(0.01), JEV, { blocks: ["list"], values: { ...DESIGN_SAYS, ...graph.keptOf(sent, ["list"]) } }).values.list_layout, "rows");
});
