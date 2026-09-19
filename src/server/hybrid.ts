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
//
// As a mock (runMock) the same pipeline is also given a design: a DESIGN.md, or
// one Jev mixes from the prompt. The design is worked out alongside the plan.
// Its tokens paint the mock in the browser; its prose changes the plan (no
// photographs in an instrument panel, no cards in a newspaper) and gives the
// writers a voice.

import { ContentStreams, type PartHooks } from "./content.js";
import { growForm } from "./form.js";
import { CONTENT_SYSTEM_PROMPT, SECTIONS, partPrompt, partSchema, planQuestions, readPlan, type Plan, type Section } from "./plan.js";
import { primaryActionQuestions, readPrimaryAction } from "./design.js";
import { actionComponents, actionsContainer, factTileComponents, factTilesContainer, skeleton } from "./emit.js";
import { CATALOG_ID, Run, SURFACE_ID } from "./run.js";
import { picture } from "./pictures.js";
import { loadDesign, type DesignSource } from "./design-source.js";
import { parseDesign } from "./design-md.js";
import type { PipelineEvent, RunStats } from "../shared/events.js";

type Part = "header" | Section;

/**
 * SPECULATE=1 starts every section's writer before the plan exists and cancels
 * the losers, saving one Jev round trip on all text. It costs eight Gemini
 * requests per run, which a free-tier key (15 requests/minute) cannot sustain,
 * so it is opt-in.
 */
const SPECULATE = process.env.SPECULATE === "1";

export const runHybrid = (prompt: string) => runSections("hybrid", prompt);

/** `markdown` is the developer's DESIGN.md; without one, Jev mixes a design from the prompt. */
export const runMock = (prompt: string, markdown?: string) => runSections("mock", prompt, markdown ? { markdown } : { brief: prompt });

function runSections(mode: RunStats["mode"], prompt: string, source?: DesignSource): AsyncGenerator<PipelineEvent> {
  const run = new Run(mode);
  const surfaceId = SURFACE_ID;

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    let plan: Plan | undefined;

    // --- Actions: buttons attach as they appear; primary is decided last ----
    // Writers cannot see each other, and the actions writer likes to repeat the form's submit button.
    // The submit label comes early in the form's stream, so buttons wait for it and the duplicate is left out.
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    let submitLabel: string | undefined;
    let actionsSeen: { actions: any; complete: boolean } | undefined;
    let actionsRead = 0;
    const attachedActions: number[] = [];
    const onActions = (actions: any, complete: boolean) => {
      actionsSeen = { actions, complete };
      const hasForm = plan!.sections.includes("form");
      if (hasForm && submitLabel === undefined) return;
      const streamed: Array<{ label: string }> = Array.isArray(actions) ? actions : [];
      const ready = complete ? streamed.length : streamed.length - 1;
      const components = [];
      for (; actionsRead < ready; actionsRead++) {
        if (hasForm && same(streamed[actionsRead].label ?? "", submitLabel!)) continue;
        attachedActions.push(actionsRead);
        components.push(...actionComponents(actionsRead, streamed[actionsRead].label, false));
      }
      if (components.length) {
        run.send({ updateComponents: { surfaceId, components: [...components, actionsContainer(attachedActions)] } });
      }
      if (complete && streamed.length > 0 && !hasForm) {
        // A form's submit button is already the primary call to action.
        streams.spawn(pickPrimary(streamed));
      }
    };
    const onForm = (form: any, complete: boolean) => {
      // The label is whole once the stream has moved on to the fields.
      if (submitLabel === undefined && typeof form?.submitLabel === "string" && (complete || form.fields !== undefined)) {
        submitLabel = form.submitLabel;
        if (actionsSeen) onActions(actionsSeen.actions, actionsSeen.complete);
      } else if (complete && submitLabel === undefined) {
        submitLabel = "";
        if (actionsSeen) onActions(actionsSeen.actions, actionsSeen.complete);
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

    // --- Fact tiles attach as facts arrive, two to a row ---------------------
    let tilesAttached = 0;
    const onFacts = (facts: any, complete: boolean) => {
      if (plan!.factsLayout !== "tiles") return;
      const streamed: unknown[] = Array.isArray(facts) ? facts : [];
      const ready = complete ? streamed.length : streamed.length - 1;
      const components = [];
      for (; tilesAttached < ready; tilesAttached++) components.push(...factTileComponents(tilesAttached, tilesAttached + 1, plan!.contained));
      if (components.length) run.send({ updateComponents: { surfaceId, components: [...components, factTilesContainer(tilesAttached)] } });
    };

    // --- Content: one Gemini request per part ------------------------------
    const growFields = growForm(run, streams, surfaceId, prompt, mode !== "mock");
    const mediaPicture = { imageUrl: picture(prompt, 960, 320) };
    const hooks: Partial<Record<Part, PartHooks>> = {
      form: {
        onValue: (form, complete) => {
          onForm(form, complete);
          growFields(form, complete);
        },
      },
      actions: { onValue: onActions },
      facts: { onValue: onFacts },
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
    // Parsing is local and instant, so even the header, requested before Jev has answered, is written in the brand's voice.
    const voice = source && "markdown" in source ? parseDesign(source.markdown).voice : "";
    const write = (part: Part) =>
      streams.write(
        part,
        { system: CONTENT_SYSTEM_PROMPT, prompt: partPrompt(prompt, part, plan?.sections ?? null, voice), schema: partSchema(part) },
        hooks[part],
      );

    // t=0: text is requested before the plan exists. The header is always needed; sections are a bet.
    write("header");
    if (SPECULATE) SECTIONS.forEach(write);

    const designing = source && loadDesign(source);
    const planned = await run.askJev("Jev: plan the surface", { user_request: prompt }, planQuestions());
    const read = readPlan(planned.answers);
    plan = read.plan;
    run.trace({ stage: planned.stage, ms: planned.ms, decisions: read.decisions, tokens: { input: planned.inputTokens, output: 0 } });

    if (designing) {
      const { design, read: look, report, mixed } = await designing.loaded;
      if (designing.fresh) {
        run.stats.jevCalls++;
        run.stats.jevInputTokens += look.jevInputTokens;
      }
      run.design(report, mixed);
      run.trace({
        stage: mixed ? "Jev: mix a DESIGN.md" : `Jev: read ${design.name}`,
        ms: designing.fresh ? look.ms : 0,
        detail: designing.fresh ? "alongside the plan" : "read before; reused",
        decisions: look.decisions,
        tokens: { input: designing.fresh ? look.jevInputTokens : 0, output: 0 },
      });
      // The design overrules the plan where they disagree, and says so.
      const overruled: string[] = [];
      if (!look.imagery && (plan.sections.includes("media") || plan.collectionImages)) overruled.push("no photographs");
      if (!look.icons && plan.icon) overruled.push("no icons");
      if (!look.contained) overruled.push("no cards");
      plan = {
        ...plan,
        sections: look.imagery ? plan.sections : plan.sections.filter((s) => s !== "media"),
        collectionImages: plan.collectionImages && look.imagery,
        icon: look.icons ? plan.icon : null,
        contained: look.contained,
      };
      if (overruled.length) run.trace({ stage: `${design.name} overrules the plan: ${overruled.join(", ")}`, ms: 0 });
    }

    run.send({ createSurface: { surfaceId, catalogId: CATALOG_ID } });
    run.send({ updateComponents: { surfaceId, components: skeleton(plan) } });
    // The hero picture is seeded from the prompt, so it needs no text at all.
    if (plan.sections.includes("media")) run.send({ updateDataModel: { surfaceId, path: "/media", value: mediaPicture } });

    streams.open(new Set<string>(["header", ...plan.sections]));
    for (const section of plan.sections) if (!streams.has(section)) write(section);
    await streams.settle();
  });
}
