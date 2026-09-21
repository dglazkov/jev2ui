// Answers nobody gave, for holding a reader or a maker against the code it was taken from.

import type { Questions } from "@typesafe-ai/sdk";

/** A small seeded generator, so a failure can be run again. */
export function random(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
}

/** An answer to every question: some near certain and others torn, as Jev's are. */
export function answersTo(questions: Questions, rng: () => number): Record<string, any> {
  return Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (question.type === "noul") return [id, { noul: rng() }];
      if (question.type === "score") return [id, { score: rng() * (question.criteria.length - 1) }];
      const weights = Object.keys(question.criteria).map(() => rng() ** 4);
      const total = weights.reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(Object.keys(question.criteria).map((name, i) => [name, weights[i] / total]));
      const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
      return [id, { choice, probabilities }];
    }),
  );
}
