// The hybrid pipeline: Jev decides, Gemini writes, code assembles.
//
//   1. Jev (prompt only)  -> which sections, icon, layouts        ~1 request
//   2. skeleton components are sent immediately, bound to data paths
//   3. Gemini streams content JSON -> forwarded as updateDataModel as it arrives
//   4. Jev (content)      -> per-field widgets, primary action     ~1 request
//   5. remaining components are sent
//
// Gemini never sees or emits A2UI, so the component tree is valid by construction.

import { askJev, streamGeminiJson } from "./models.js";
import { CONTENT_SYSTEM_PROMPT, contentSchema, planQuestions, readPlan, type Plan } from "./plan.js";
import { designQuestions, readDesign } from "./design.js";
import { completion, initialFieldValue, skeleton, type FieldContent } from "./emit.js";
import { CATALOG_ID, Run, SURFACE_ID } from "./run.js";
import type { PipelineEvent } from "../shared/events.js";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Placeholder photography: Gemini can't produce real image URLs, so pictures are seeded stand-ins.
const picture = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${slug(seed) || "x"}/${w}/${h}`;

/** Adds the code-owned parts of the data model (image URLs) to Gemini's content. */
function decorate(content: any, plan: Plan, complete: boolean): any {
  const data = structuredClone(content);
  if (plan.sections.includes("media") && data.header?.title && data.media) {
    data.media.imageUrl = picture(data.header.title, 960, 320);
  }
  if (plan.collectionImages && Array.isArray(data.collection?.items)) {
    const items: any[] = data.collection.items;
    // While streaming, the last item's title may still be growing; seeding from it would flicker.
    items.forEach((item, i) => {
      if (item?.title && (complete || i < items.length - 1)) item.imageUrl = picture(item.title, 320, 200);
    });
  }
  return data;
}

export function runHybrid(prompt: string): AsyncGenerator<PipelineEvent> {
  const run = new Run("hybrid");
  const surfaceId = SURFACE_ID;

  return run.drive(async () => {
    // 1. Plan.
    const planned = await askJev({ user_request: prompt }, planQuestions());
    run.stats.jevCalls++;
    run.stats.jevInputTokens += planned.inputTokens;
    const { plan, decisions } = readPlan(planned.answers);
    run.trace({
      stage: "Jev: plan the surface",
      ms: planned.ms,
      decisions,
      tokens: { input: planned.inputTokens, output: 0 },
    });

    // 2. Skeleton.
    run.send({ createSurface: { surfaceId, catalogId: CATALOG_ID } });
    run.send({ updateComponents: { surfaceId, components: skeleton(plan) } });

    // 3. Content, streamed into the data model one top-level key at a time.
    const sent = new Map<string, string>();
    const forward = (content: any, complete: boolean) => {
      if (!content || typeof content !== "object") return;
      for (const [key, value] of Object.entries(decorate(content, plan, complete))) {
        const json = JSON.stringify(value);
        if (json === sent.get(key)) continue;
        sent.set(key, json);
        run.send({ updateDataModel: { surfaceId, path: `/${key}`, value } });
      }
    };
    const generated = await streamGeminiJson(
      { system: CONTENT_SYSTEM_PROMPT, prompt, schema: contentSchema(plan.sections) },
      (partial) => forward(partial, false),
    );
    run.stats.geminiInputTokens += generated.inputTokens;
    run.stats.geminiOutputTokens += generated.outputTokens;
    const content = JSON.parse(generated.text);
    forward(content, true);
    run.trace({
      stage: "Gemini: write the content",
      ms: generated.ms,
      tokens: { input: generated.inputTokens, output: generated.outputTokens },
    });

    // 4. Design decisions that need the content.
    const fields: FieldContent[] = plan.sections.includes("form") ? (content.form?.fields ?? []) : [];
    const actions: Array<{ label: string }> = plan.sections.includes("actions") ? (content.actions ?? []) : [];
    const questions = designQuestions(fields, actions);
    let design = { fields: [], primaryAction: actions.length === 1 ? 0 : -1 } as ReturnType<typeof readDesign>["design"];
    if (Object.keys(questions).length > 0) {
      const designed = await askJev({ user_request: prompt, form_fields: fields, actions }, questions);
      run.stats.jevCalls++;
      run.stats.jevInputTokens += designed.inputTokens;
      const read = readDesign(designed.answers, fields, actions);
      design = read.design;
      run.trace({
        stage: "Jev: design form and actions",
        ms: designed.ms,
        decisions: read.decisions,
        tokens: { input: designed.inputTokens, output: 0 },
      });
    }

    // 5. Completion.
    const rest = completion(plan, content, design);
    if (rest.length > 0) {
      if (fields.length > 0) {
        const values = Object.fromEntries(fields.map((f, i) => [`f${i}`, initialFieldValue(f, design.fields[i])]));
        run.send({ updateDataModel: { surfaceId, path: "/form/values", value: values } });
      }
      run.send({ updateComponents: { surfaceId, components: rest } });
    }
  });
}
