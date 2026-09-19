// The hybrid pipeline: Jev decides, Gemini writes, code assembles.
//
// Structure never waits for text:
//
//   t=0   Jev plans the surface from the prompt            } in parallel
//         Gemini starts writing the header and, speculatively,
//         every section, one request each                  }
//   plan  the full skeleton is sent, bound to data paths; writers for sections
//         the plan left out are cancelled (Jev answers well inside Gemini's
//         time to first token, so they have produced nothing yet); the rest
//         stream into their own corners of the data model
//   form  each field is designed by Jev the moment it is complete in the
//         stream, and attached as soon as the fields before it are
//   acts  each button is attached as it appears; once all are known Jev picks
//         the primary one and that single button is re-issued
//
// Gemini never sees or emits A2UI, so the component tree is valid by construction.

import { askJev, streamGeminiJson } from "./models.js";
import { CONTENT_SYSTEM_PROMPT, SECTIONS, partPrompt, partSchema, planQuestions, readPlan, type Plan, type Section } from "./plan.js";
import { fieldQuestions, primaryActionQuestions, readField, readPrimaryAction } from "./design.js";
import {
  actionComponents,
  actionsContainer,
  fieldComponent,
  formContainer,
  initialFieldValue,
  skeleton,
  valuePath,
  type FieldContent,
  type FieldDesign,
} from "./emit.js";
import { CATALOG_ID, Run, SURFACE_ID } from "./run.js";
import type { PipelineEvent } from "../shared/events.js";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Placeholder photography: Gemini can't produce real image URLs, so pictures are seeded stand-ins.
const picture = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${slug(seed) || "x"}/${w}/${h}`;

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
    let plan: Plan | undefined;
    /** Work that was kicked off without being awaited; the run ends when all of it has. */
    const background: Promise<void>[] = [];
    let failure: unknown;
    // Guarded so a failure surfaces as this run's error instead of an unhandled rejection.
    const spawn = (work: Promise<void>) => {
      const guarded = work.catch((error) => void (failure ??= error));
      background.push(guarded);
      return guarded;
    };
    /** Content that arrives before the surface exists is held until it does. */
    let surfaceReady = false;
    const held: Array<{ part: Part; handle: () => void }> = [];
    const whenSurfaceReady = (part: Part, handle: () => void) => (surfaceReady ? handle() : held.push({ part, handle }));

    const jev = async (stage: string, state: unknown, questions: Parameters<typeof askJev>[1]) => {
      const result = await askJev(state, questions);
      run.stats.jevCalls++;
      run.stats.jevInputTokens += result.inputTokens;
      return { ...result, stage };
    };

    // --- Form: fields are designed and attached one by one -----------------
    const designs: FieldDesign[] = [];
    const fields: FieldContent[] = [];
    let fieldsStarted = 0;
    let fieldsAttached = 0;

    const attachReadyFields = () => {
      const components = [];
      while (designs[fieldsAttached]) {
        const i = fieldsAttached++;
        run.send({ updateDataModel: { surfaceId, path: valuePath(i), value: initialFieldValue(fields[i], designs[i]) } });
        components.push(fieldComponent(i, fields[i], designs[i]));
      }
      if (components.length) {
        run.send({ updateComponents: { surfaceId, components: [...components, formContainer(fieldsAttached)] } });
      }
    };

    const designField = async (i: number) => {
      const asked = await jev(`Jev: design field "${fields[i].label}"`, { user_request: prompt, form_field: fields[i] }, fieldQuestions());
      const read = readField(asked.answers, fields[i]);
      designs[i] = read.design;
      run.trace({ stage: asked.stage, ms: asked.ms, decisions: read.decisions, tokens: { input: asked.inputTokens, output: 0 } });
      attachReadyFields();
    };

    const onForm = (form: any, complete: boolean) => {
      const streamed: FieldContent[] = Array.isArray(form?.fields) ? form.fields : [];
      // The last field in a partial stream may still be growing.
      const ready = complete ? streamed.length : streamed.length - 1;
      for (; fieldsStarted < ready; fieldsStarted++) {
        fields[fieldsStarted] = streamed[fieldsStarted];
        spawn(designField(fieldsStarted));
      }
    };

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
        spawn(pickPrimary(streamed));
      }
    };

    const pickPrimary = async (actions: Array<{ label: string }>) => {
      let primary = 0;
      if (actions.length > 1) {
        const asked = await jev("Jev: pick the primary action", { user_request: prompt, actions }, primaryActionQuestions(actions));
        const read = readPrimaryAction(asked.answers, actions);
        primary = read.primary;
        run.trace({ stage: asked.stage, ms: asked.ms, decisions: read.decisions, tokens: { input: asked.inputTokens, output: 0 } });
      }
      if (primary >= 0) {
        run.send({ updateComponents: { surfaceId, components: actionComponents(primary, actions[primary].label, true) } });
      }
    };

    // --- Content: one Gemini request per part, streamed into the data model --
    /** Adds the code-owned parts of the data model (image URLs) to Gemini's content. */
    const decorate = (part: Part, value: any, complete: boolean) => {
      if (part === "media" && value) return { ...value, imageUrl: picture(prompt, 960, 320) };
      if (part === "collection" && plan?.collectionImages && Array.isArray(value?.items)) {
        const items: any[] = value.items;
        // While streaming, the last item's title may still be growing; seeding from it would flicker.
        return {
          ...value,
          items: items.map((item, i) =>
            item?.title && (complete || i < items.length - 1) ? { ...item, imageUrl: picture(item.title, 320, 200) } : item,
          ),
        };
      }
      return value;
    };

    const writers = new Map<Part, AbortController>();
    const write = async (part: Part) => {
      const controller = new AbortController();
      writers.set(part, controller);
      let last = "";
      const forward = (document: any, complete: boolean) => {
        const value = document?.[part];
        if (value === undefined || value === null) return;
        whenSurfaceReady(part, () => {
          const decorated = decorate(part, value, complete);
          const json = JSON.stringify(decorated);
          if (json !== last) {
            last = json;
            run.send({ updateDataModel: { surfaceId, path: `/${part}`, value: decorated } });
          }
          if (part === "form") onForm(value, complete);
          if (part === "actions") onActions(value, complete);
        });
      };
      const generated = await streamGeminiJson(
        {
          system: CONTENT_SYSTEM_PROMPT,
          prompt: partPrompt(prompt, part, plan?.sections ?? null),
          schema: partSchema(part),
          signal: controller.signal,
        },
        (partial) => forward(partial, false),
      ).catch((error) => {
        if (controller.signal.aborted) return undefined;
        throw error;
      });
      if (!generated) return;
      run.stats.geminiInputTokens += generated.inputTokens;
      run.stats.geminiOutputTokens += generated.outputTokens;
      forward(JSON.parse(generated.text), true);
      run.trace({
        stage: `Gemini: write ${part}`,
        ms: generated.ms,
        detail: `first chunk ${Math.round(generated.firstChunkMs)} ms`,
        tokens: { input: generated.inputTokens, output: generated.outputTokens },
      });
    };

    // t=0: text is requested before the plan exists. The header is always needed; sections are a bet.
    spawn(write("header"));
    if (SPECULATE) for (const section of SECTIONS) spawn(write(section));

    const planned = await jev("Jev: plan the surface", { user_request: prompt }, planQuestions());
    const read = readPlan(planned.answers);
    plan = read.plan;
    run.trace({ stage: planned.stage, ms: planned.ms, decisions: read.decisions, tokens: { input: planned.inputTokens, output: 0 } });

    run.send({ createSurface: { surfaceId, catalogId: CATALOG_ID } });
    run.send({ updateComponents: { surfaceId, components: skeleton(plan) } });
    // The hero picture is seeded from the prompt, so it needs no text at all.
    if (plan.sections.includes("media")) {
      run.send({ updateDataModel: { surfaceId, path: "/media", value: decorate("media", {}, false) } });
    }

    const wanted = new Set<Part>(["header", ...plan.sections]);
    let cancelled = 0;
    for (const [part, controller] of writers) {
      if (wanted.has(part)) continue;
      controller.abort();
      cancelled++;
    }
    if (cancelled) run.trace({ stage: `Cancelled ${cancelled} speculative writers`, ms: 0 });
    surfaceReady = true;
    for (const { part, handle } of held.splice(0)) if (wanted.has(part)) handle();
    for (const section of plan.sections) if (!writers.has(section)) spawn(write(section));
    // Settling one task can start another (a field's design is queued by the form stream).
    while (background.length) await Promise.all(background.splice(0));
    if (failure) throw failure;
  });
}
