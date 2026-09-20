// Read-only transition critique. Proposed repairs are recorded, never applied to the fixture or app.
import { choice } from "@typesafe-ai/sdk";
import { readFile } from "node:fs/promises";
import { askJev, endpoints, JEV_MODEL } from "../server/models.js";
import type { Endpoint } from "../shared/events.js";
import { CASES } from "./coherence-cases.js";
import { recordJourney } from "./journey-recording.js";
import { capturedJourney, criticPlace } from "./saved-journey.js";

const CONTEXT = "Inspect an observed app transition. `from` and `to` describe the actual content and behavior, `action` is what was tapped, `history` records earlier transitions, and `existing` lists known destinations. Judge semantic progress, not screen titles or IDs. A repeated title can be legitimate, and different titles can mean the same task. Do not invent unseen content.";
const questions = {
  relation: choice({ context: CONTEXT, question: "What does this transition accomplish? Choose the most specific description. If destination behavior is unknown, choose unknown." }, {
    starts: "Starts a task from an overview, or explicitly starts a separate task after the previous one finished.",
    advances: "Advances the same task to a distinct necessary stage or completes it, without merely restating its current stage.",
    narrows: "Opens one item, a narrower settings scope, or a subordinate task concerning a different subject, such as adding a guest to a booking.",
    returns: "Intentionally returns to an earlier destination, such as Back or Cancel; this is useful navigation, not a repeated forward step.",
    in_place: "Changes data or a preference on the current screen without navigating. The change accomplishes something.",
    repeats: "A forward action produces the same task, scope and stage again with no meaningful change, despite a possible new title or ID. It postpones progress or redundantly opens where the person already is.",
    unknown: "The destination has not been rendered or its behavior is not known; there is insufficient evidence to judge the transition.",
  }),
  repair: choice({ context: CONTEXT, question: "What should we do with this transition? This is a critique recommendation only. Removing an action does not itself supply a missing completion behavior." }, {
    keep: "Keep the transition: it performs a useful change and needs no existing destination substituted.",
    remove: "Remove or replace the redundant forward action that restarts the current task or repeats the current scope and stage. Redirecting it to the current screen would still accomplish nothing.",
    reuse: "Keep the useful navigation but resolve it to the matching existing destination, including an intentional return. Avoid creating a duplicate screen.",
    inspect: "Gather evidence about the destination before changing the transition: its behavior is unknown.",
  }),
};

const args = process.argv.slice(2);
const fixtures = args.includes("--fixtures");
const saved = args.find((arg) => arg.startsWith("--saved="))?.slice("--saved=".length);
const endpointArg = args.find((arg) => arg.startsWith("--endpoint="))?.split("=")[1] ?? "jev";
if (!["jev", "gev"].includes(endpointArg) || args.some((arg) => arg !== "--fixtures" && !/^--endpoint=(jev|gev)$/.test(arg) && !/^--saved=.+$/.test(arg))) {
  throw new Error("Usage: npm run probe:coherence -- [--endpoint=jev|gev] [--fixtures] [--saved=path.json]");
}
const endpoint = endpointArg as Endpoint;
if (!fixtures && !endpoints().includes(endpoint)) throw new Error(`${endpoint.toUpperCase()}_API_KEY is not configured. Use --fixtures to inspect cases without model calls.`);
const capture = saved ? capturedJourney(JSON.parse(await readFile(saved, "utf8"))) : undefined;
const cases = capture?.cases ?? CASES;
const trace = await recordJourney({ endpoint: fixtures ? null : endpoint, model: fixtures ? null : JEV_MODEL, cases, questions,
  ...(capture ? { source: "saved-app", provenance: capture.provenance } : {}) });
console.log(`Recording: ${trace.file}\nObserver: http://127.0.0.1:5174/#${trace.recording.id} (npm run observe:journeys)`);
if (fixtures) {
  await trace.finish("fixtures");
  console.log("Fixtures saved. No model calls or simulated answers.");
} else {
  let answered = 0, matched = 0, errors = 0;
  try {
    for (const journey of cases) {
      let from = journey.start;
      const history: unknown[] = (journey.history ?? []).map((hop) => ({ from: criticPlace(hop.from), action: hop.action, to: criticPlace(hop.to) }));
      for (const [step, hop] of journey.hops.entries()) {
        // Explicit construction keeps hand labels and case names out of the request.
        const state = { app: journey.app, goal: journey.goal, from: criticPlace(from), action: hop.action, to: criticPlace(hop.to), existing: (journey.existing ?? []).map(criticPlace), history: [...history] };
        await trace.event("request", journey.id, step, { state });
        try {
          const result = await askJev(state, questions, endpoint);
          for (const key of ["relation", "repair"] as const) {
            const answer = result.answers[key];
            if (!answer || typeof answer.choice !== "string" || !Number.isFinite(answer.probabilities?.[answer.choice])) throw new Error(`Invalid ${key} answer`);
          }
          const match = result.answers.relation.choice === hop.expected.relation && result.answers.repair.choice === hop.expected.repair;
          answered++;
          if (match) matched++;
          await trace.event("answer", journey.id, step, { ...result, match, expected: hop.expected });
          console.log(`${match ? "✓" : "✗"} ${journey.title} · ${step + 1}: ${result.answers.relation.choice} / ${result.answers.repair.choice}`);
        } catch (error) {
          errors++;
          await trace.event("error", journey.id, step, { message: String(error) });
          console.error(`${journey.id} step ${step + 1}: ${String(error)}`);
        }
        history.push({ from: criticPlace(from), action: hop.action, to: criticPlace(hop.to) });
        from = hop.to;
      }
    }
    await trace.finish(errors ? "failed" : "complete", { answered, matched, errors });
    console.log(`${matched}/${answered} transitions matched both hand labels; ${errors} errors. Repairs were not applied.`);
    if (errors) process.exitCode = 1;
  } catch (error) {
    await trace.finish("failed", { answered, matched, errors }, String(error));
    throw error;
  }
}
