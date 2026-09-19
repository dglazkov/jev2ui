// The hybrid pipeline: Jev decides, Gemini writes, code assembles.
//
// Structure never waits for text:
//
//   t=0   Jev plans the surface from the prompt            } in parallel
//         Gemini starts writing the header (and, with
//         SPECULATE=1, every section), one request each    }
//   plan  the full skeleton is sent, bound to data paths; writers for sections
//         the plan left out are cancelled; the rest stream into their own
//         corners of the data model
//   form  each field is designed by Jev the moment it is complete in the
//         stream, and attached as soon as the fields before it are
//   acts  each button is attached as it appears; once all are known Jev picks
//         the primary one and that single button is re-issued
//
// Gemini never sees or emits A2UI, so the component tree is valid by construction.

import { ContentStreams, type PartHooks } from "./content.js";
import { growForm } from "./form.js";
import { CONTENT_SYSTEM_PROMPT, SECTIONS, partPrompt, partSchema, planQuestions, readPlan, type Plan, type Section } from "./plan.js";
import { primaryActionQuestions, readPrimaryAction } from "./design.js";
import { actionComponents, actionsContainer, skeleton } from "./emit.js";
import { CATALOG_ID, Run, SURFACE_ID } from "./run.js";
import { picture } from "./pictures.js";
import type { PipelineEvent } from "../shared/events.js";

type Part = "header" | Section;

/**
 * SPECULATE=1 starts every section's writer before the plan exists and cancels
 * the losers, saving one Jev round trip on all text. It costs eight Gemini
 * requests per run, which a free-tier key (15 requests/minute) cannot sustain,
 * so it is opt-in.
 */
const SPECULATE = process.env.SPECULATE === "1";

export function runHybrid(prompt: string): AsyncGenerator<PipelineEvent> {
  const run = new Run("hybrid");
  const surfaceId = SURFACE_ID;

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    let plan: Plan | undefined;

    // --- Actions: buttons attach as they appear; primary is decided last ----
    let actionsAttached = 0;
    const onActions = (actions: any, complete: boolean) => {
      const streamed: Array<{ label: string }> = Array.isArray(actions) ? actions : [];
      const ready = complete ? streamed.length : streamed.length - 1;
      const components = [];
      for (; actionsAttached < ready; actionsAttached++) {
        components.push(...actionComponents(actionsAttached, streamed[actionsAttached].label, false));
      }
      if (components.length) {
        run.send({ updateComponents: { surfaceId, components: [...components, actionsContainer(actionsAttached)] } });
      }
      if (complete && streamed.length > 0 && !plan!.sections.includes("form")) {
        // A form's submit button is already the primary call to action.
        streams.spawn(pickPrimary(streamed));
      }
    };

    const pickPrimary = async (actions: Array<{ label: string }>) => {
      let primary = 0;
      if (actions.length > 1) {
        const asked = await run.askJev("Jev: pick the primary action", { user_request: prompt, actions }, primaryActionQuestions(actions));
        const read = readPrimaryAction(asked.answers, actions);
        primary = read.primary;
        run.trace({ stage: asked.stage, ms: asked.ms, decisions: read.decisions, tokens: { input: asked.inputTokens, output: 0 } });
      }
      if (primary >= 0) {
        run.send({ updateComponents: { surfaceId, components: actionComponents(primary, actions[primary].label, true) } });
      }
    };

    // --- Content: one Gemini request per part ------------------------------
    const mediaPicture = { imageUrl: picture(prompt, 960, 320) };
    const hooks: Partial<Record<Part, PartHooks>> = {
      form: { onValue: growForm(run, streams, surfaceId, prompt) },
      actions: { onValue: onActions },
      media: { decorate: (value) => ({ ...value, ...mediaPicture }) },
      collection: {
        decorate: (value, complete) => {
          if (!plan?.collectionImages || !Array.isArray(value?.items)) return value;
          const items: any[] = value.items;
          // While streaming, the last item's title may still be growing; seeding from it would flicker.
          return {
            ...value,
            items: items.map((item, i) =>
              item?.title && (complete || i < items.length - 1) ? { ...item, imageUrl: picture(item.title, 320, 200) } : item,
            ),
          };
        },
      },
    };
    const write = (part: Part) =>
      streams.write(
        part,
        { system: CONTENT_SYSTEM_PROMPT, prompt: partPrompt(prompt, part, plan?.sections ?? null), schema: partSchema(part) },
        hooks[part],
      );

    // t=0: text is requested before the plan exists. The header is always needed; sections are a bet.
    write("header");
    if (SPECULATE) SECTIONS.forEach(write);

    const planned = await run.askJev("Jev: plan the surface", { user_request: prompt }, planQuestions());
    const read = readPlan(planned.answers);
    plan = read.plan;
    run.trace({ stage: planned.stage, ms: planned.ms, decisions: read.decisions, tokens: { input: planned.inputTokens, output: 0 } });

    run.send({ createSurface: { surfaceId, catalogId: CATALOG_ID } });
    run.send({ updateComponents: { surfaceId, components: skeleton(plan) } });
    // The hero picture is seeded from the prompt, so it needs no text at all.
    if (plan.sections.includes("media")) run.send({ updateDataModel: { surfaceId, path: "/media", value: mediaPicture } });

    streams.open(new Set<string>(["header", ...plan.sections]));
    for (const section of plan.sections) if (!streams.has(section)) write(section);
    await streams.settle();
  });
}
