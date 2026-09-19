// The jobs pipeline: Jev profiles the person, code picks the pattern, Gemini writes.
//
// Where the hybrid pipeline asks Jev about the screen ("should it have a
// list?"), this one asks only about the person: where they are in getting what
// they want, what done looks like, what is at stake, what worries them, what
// they will choose on. Design knowledge lives in job-patterns.ts, as rules from
// job to pattern. See docs/jtbd-probe.md for why this is believed to work.
//
//   t=0   Jev profiles the job                              } in parallel
//         Gemini starts the header and, as a bet, the verdict }
//   plan  the pattern's whole tree is sent, bound to data paths; the losing
//         bet is cancelled; every other part gets its own Gemini request,
//         briefed with the person's situation
//   form  grows field by field, as in the hybrid pipeline

import { ContentStreams, type PartHooks } from "./content.js";
import { growForm } from "./form.js";
import { profileQuestions, readProfile, type JobProfile } from "./job-profile.js";
import { OPENING_PARTS, choosePattern, jobSkeleton, partsFor, showsPictures, situation, type PartSpec } from "./job-patterns.js";
import { CONTENT_SYSTEM_PROMPT } from "./plan.js";
import { picture } from "./pictures.js";
import { CATALOG_ID, Run, SURFACE_ID } from "./run.js";
import type { PipelineEvent } from "../shared/events.js";

export function runJobs(prompt: string): AsyncGenerator<PipelineEvent> {
  const run = new Run("jobs");
  const surfaceId = SURFACE_ID;

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    let profile: JobProfile | undefined;
    let allParts: string[] | undefined;

    const mediaPicture = { imageUrl: picture(prompt, 960, 320) };
    const hooks: Record<string, PartHooks> = {
      form: { onValue: growForm(run, streams, surfaceId, prompt) },
      media: { decorate: (value) => ({ ...value, ...mediaPicture }) },
      items: {
        decorate: (value, complete) => {
          if (!profile || !showsPictures(profile) || !Array.isArray(value?.items)) return value;
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

    const written = new Map<string, Promise<any>>();
    const write = ({ part, schema, brief }: PartSpec, mustAgreeWith?: unknown) => {
      const lines = [`User request: ${prompt}`];
      if (profile) lines.push(situation(profile));
      if (allParts) lines.push(`The screen has these parts: ${allParts.join(", ")}.`);
      if (mustAgreeWith) lines.push(`Already on the screen, and not to be contradicted: ${JSON.stringify(mustAgreeWith)}`);
      lines.push(`Write the "${part}" part.`);
      if (brief) lines.push(brief);
      written.set(part, streams.write(part, { system: CONTENT_SYSTEM_PROMPT, prompt: lines.join("\n"), schema }, hooks[part]));
    };

    // t=0: every pattern opens with either a header or a verdict, so both are started and one is cancelled.
    OPENING_PARTS.forEach((spec) => write(spec));

    const asked = await run.askJev("Jev: profile the job", { user_request: prompt }, profileQuestions());
    const read = readProfile(asked.answers);
    profile = read.profile;
    run.trace({ stage: asked.stage, ms: asked.ms, decisions: read.decisions, tokens: { input: asked.inputTokens, output: 0 } });

    const { pattern, because } = choosePattern(profile);
    run.trace({ stage: `Code: "${pattern}" pattern`, ms: 0, detail: because });

    run.send({ createSurface: { surfaceId, catalogId: CATALOG_ID } });
    run.send({ updateComponents: { surfaceId, components: jobSkeleton(pattern, profile) } });

    const parts = partsFor(pattern, profile);
    allParts = parts.map((spec) => spec.part);
    // The hero picture is seeded from the prompt, so it needs no text at all.
    if (allParts.includes("media")) run.send({ updateDataModel: { surfaceId, path: "/media", value: mediaPicture } });

    streams.open(new Set(allParts));
    for (const spec of parts.filter((spec) => !spec.after)) if (!streams.has(spec.part)) write(spec);
    // Parts that must agree with another wait for it; everything else is already in flight.
    for (const spec of parts.filter((spec) => spec.after)) {
      streams.spawn(written.get(spec.after!)!.then((value) => write(spec, value)));
    }
    await streams.settle();
  });
}
