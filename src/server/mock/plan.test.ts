import { test } from "node:test";
import assert from "node:assert/strict";
import { planQuestions, readPlan, applyDesign } from "./plan.js";
import { screen } from "./screen.js";

function feedAnswers(hero: number) {
  const answers: Record<string, any> = Object.fromEntries(Object.entries(planQuestions()).map(([key, q]) => {
    if (q.type === "choice") {
      const choice = key === "archetype" ? "feed" : Object.keys(q.criteria)[0];
      return [key, { choice, probabilities: { [choice]: 1 } }];
    }
    return [key, { noul: key === "has_hero" ? hero : 0 }];
  }));
  return answers;
}

test("a feed can render the existing hero when selected, while a plain feed stays a list", () => {
  const featured = readPlan(feedAnswers(0.99), { topLevel: true }).plan;
  assert.deepEqual(featured.blocks, ["hero", "list"]);
  const tree = screen(featured, null);
  assert.equal(tree.find((c) => c.id === "hero")?.component, "Image");
  assert.ok(tree.some((c) => c.id === "navbar"), "a hero does not turn the home into a detail screen");
  assert.deepEqual(readPlan(feedAnswers(0.01), { topLevel: true }).plan.blocks, ["list"]);
});

test("an explicit design prohibition still removes a feed hero", () => {
  const featured = readPlan(feedAnswers(0.99), { topLevel: true }).plan;
  const designed = applyDesign(featured, { imagery: false, icons: true, contained: true });
  assert.deepEqual(designed.plan.blocks, ["list"]);
  assert.ok(designed.overruled.includes("no lead photograph"));
});
