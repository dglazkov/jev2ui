// Answers nobody gave, for holding a reader or a maker against the code it was taken from.

import type { Questions } from "@typesafe-ai/sdk";

/** A small seeded generator, so a failure can be run again. The seed is mixed first: neighbouring seeds must not open with neighbouring numbers. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    // splitmix32
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    return z / 2 ** 32;
  };
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

/** What a design says, as the graph is given it: screen.md's three given questions. A design that says nothing rules nothing out. */
export const DESIGN_SAYS = { photographs: true, symbols: true, cards: true };

/** A design nobody wrote: each of the three ruled out about a third of the time. */
export const designSays = (rng: () => number) => ({ photographs: rng() < 0.7, symbols: rng() < 0.7, cards: rng() < 0.7 });
