import { test } from "node:test";
import assert from "node:assert/strict";
import { SCREEN, partNode, readingOf } from "./graph.js";
import { applyDesign } from "./plan.js";
import { screen } from "./screen.js";
import { treeOf } from "../grammar/make.js";
import { KIT_PATTERNS } from "../grammar/patterns.js";
import { JEV, questionsOf, readGrammar } from "../grammar/read.js";
import { planOf } from "../grammar/screen-plan.js";

function feedAnswers(hero: number) {
  return Object.fromEntries(
    Object.entries(questionsOf(SCREEN)).map(([key, q]) => {
      if (q.type === "choice") {
        const choice = key === "archetype" ? "feed" : Object.keys(q.criteria)[0];
        return [key, { choice, probabilities: { [choice]: 1 } }];
      }
      return [key, { noul: key === "has_hero" ? hero : 0 }];
    }),
  );
}
const planFrom = (hero: number) => planOf(SCREEN, readGrammar(SCREEN, feedAnswers(hero), JEV, { values: { top_level: true } }));

test("a feed can render the existing hero when selected, while a plain feed stays a list", () => {
  const featured = planFrom(0.99);
  assert.deepEqual(featured.blocks, ["hero", "list"]);
  const back = readingOf(featured);
  const tree = screen(featured, null, featured.blocks.flatMap((block) => treeOf(KIT_PATTERNS, SCREEN, partNode(block), back, { contained: true, icons: true, symbol: featured.symbol })));
  assert.equal(tree.find((c) => c.id === "hero")?.component, "Image");
  assert.ok(tree.some((c) => c.id === "navbar"), "a hero does not turn the home into a detail screen");
  assert.deepEqual(planFrom(0.01).blocks, ["list"]);
});

test("an explicit design prohibition still removes a feed hero", () => {
  const designed = applyDesign(planFrom(0.99), { imagery: false, icons: true, contained: true });
  assert.deepEqual(designed.plan.blocks, ["list"]);
  assert.ok(designed.overruled.includes("no lead photograph"));
});
