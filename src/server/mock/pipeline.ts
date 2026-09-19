// The mock pipeline: describe a screen, get a mock.
//
//   t=0    Jev plans the tree (archetype, blocks, anatomy: one request)   }
//          Jev reads the DESIGN.md, or mixes one                          } in parallel
//          Gemini starts the header, in the brand's voice                 }
//   plan   the design overrules the plan where they disagree; the whole tree
//          is sent, bound to data paths; one writer per block starts
//   words  stream into the data model; text that has not arrived shimmers
//   refine as each group, list or form field completes, Jev reads it and its
//          answers (control, symbol, tone, primary) join the data beside it
//
// Gemini never sees a component and Jev never writes a word, so the tree is
// valid by construction, and it is on screen before the first word is.

import { ContentStreams, type PartHooks } from "../content.js";
import { loadDesign } from "../design-source.js";
import { parseDesign } from "../design-md.js";
import { picture } from "../pictures.js";
import { Run, SURFACE_ID } from "../run.js";
import { KIT_CATALOG_ID } from "../../shared/kit.js";
import type { PipelineEvent } from "../../shared/events.js";
import type { Journey } from "../../shared/journey.js";
import { destination } from "./link.js";
import { applyDesign, planQuestions, readPlan, type ScreenPlan } from "./plan.js";
import { SYSTEM_PROMPT, partPrompt, partSchema, screen, type Part } from "./screen.js";
import { refineActions, refineBanner, refineField, refineGroup, refineItems, refineNav, refineStats, type Decoration } from "./refine.js";

/** Jev's per-instance answers, kept apart from Gemini's words and merged into them on the way out. */
class Decorations {
  private readonly byPart = new Map<string, Decoration[]>();

  add(part: string, decorations: Decoration[]) {
    this.byPart.set(part, [...(this.byPart.get(part) ?? []), ...decorations]);
  }

  apply(part: string, value: any): any {
    const decorations = this.byPart.get(part);
    if (!decorations?.length) return value;
    const copy = structuredClone(value);
    for (const { at, values } of decorations) {
      let target = copy;
      for (const key of at) target = target?.[key];
      if (target && typeof target === "object") Object.assign(target, values);
    }
    return copy;
  }
}

/**
 * `markdown` is the developer's DESIGN.md; without one, Jev mixes a design from the description.
 * With a `journey`, the screen is the one a tap leads to, in the same app as the screen it was tapped on.
 */
export function runMock(described: string, markdown?: string, journey?: Journey): AsyncGenerator<PipelineEvent> {
  const run = new Run("mock");
  const surfaceId = SURFACE_ID;
  const to = journey && destination(journey);
  const prompt = to?.screen ?? described;

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    const decorations = new Decorations();
    let plan: ScreenPlan | undefined;

    /** Runs a refinement, then re-sends the part so the answers reach the screen. */
    const refine = (part: Part, work: Promise<Decoration[]>) =>
      streams.spawn(
        work.then((found) => {
          decorations.add(part, found);
          streams.refresh(part);
        }),
      );
    /** Calls `each` once for every element that is complete: all but the last while streaming, all of them at the end. */
    const asTheyComplete = (each: (item: any, i: number) => void) => {
      let seen = 0;
      return (items: any, complete: boolean) => {
        const streamed: any[] = Array.isArray(items) ? items : [];
        const ready = complete ? streamed.length : streamed.length - 1;
        for (; seen < ready; seen++) each(streamed[seen], seen);
      };
    };
    const once = (then: (value: any) => void) => {
      let done = false;
      return (value: any, complete: boolean) => {
        if (!complete || done) return;
        done = true;
        then(value);
      };
    };

    const fields = asTheyComplete((field, i) => refine("form", refineField(run, prompt, i, field)));
    const hooks: Partial<Record<Part, PartHooks>> = {
      banner: { onValue: once((banner) => refine("banner", refineBanner(run, prompt, banner))) },
      stats: { onValue: once((stats) => plan!.statDeltas && refine("stats", refineStats(run, prompt, stats))) },
      groups: { onValue: asTheyComplete((group, g) => refine("groups", refineGroup(run, prompt, g, group, plan!.icons, typeof to?.about?.value === "string" ? to.about.value : undefined))) },
      nav: { onValue: once((nav) => plan!.icons && refine("nav", refineNav(run, prompt, nav.items ?? []))) },
      actions: { onValue: once((actions) => actions.length && refine("actions", refineActions(run, prompt, actions))) },
      form: { onValue: (form, complete) => fields(form?.fields, complete) },
      list: {
        onValue: once((list) => {
          const want = { tones: plan!.list.parts.includes("status") || plan!.list.parts.includes("progress"), icons: plan!.list.leading === "icon" && plan!.list.layout === "rows" };
          refine("list", refineItems(run, prompt, list.items ?? [], want));
        }),
        decorate: (value, complete) => {
          const pictured = plan!.list.leading === "thumbnail";
          if (!pictured || !Array.isArray(value?.items)) return value;
          const items: any[] = value.items;
          // While streaming, the last title may still be growing; a picture seeded from it would flicker.
          const size = plan!.list.layout === "rows" ? [160, 160] : [640, 400];
          return { ...value, items: items.map((item, i) => (item?.title && (complete || i < items.length - 1) ? { ...item, imageUrl: picture(item.title, size[0], size[1]) } : item)) };
        },
      },
      facts: {
        // The last line of a bill is its total; the tree binds `strong` and code says which row it is.
        decorate: (value, complete) => (plan!.factsTotal && complete && Array.isArray(value) ? value.map((row, i) => (i === value.length - 1 ? { ...row, strong: true } : row)) : value),
      },
    };

    // Parsing is local and instant, so even the header, requested before Jev has answered, is written in the brand's voice.
    const setting = { voice: markdown ? parseDesign(markdown).voice : "", ...(to ? { app: journey!.app, reachedBy: to.reachedBy, about: to.about } : {}) };
    const write = (part: Part, agreeWith?: unknown) => {
      const own = hooks[part];
      return streams.write(
        part,
        { system: SYSTEM_PROMPT, prompt: partPrompt(prompt, part, plan ?? null, setting, agreeWith), schema: partSchema(part, plan ?? null) },
        { ...own, decorate: (value, complete) => decorations.apply(part, own?.decorate ? own.decorate(value, complete) : value) },
      );
    };

    // t=0: the header is needed whatever the plan turns out to be.
    write("header");
    if (to) run.trace({ stage: `Link: ${to.screen}`, ms: 0, detail: `reached by ${to.reachedBy}` });
    const designing = loadDesign(markdown ? { markdown } : { brief: journey?.app ?? prompt });
    const state = to ? { app: journey!.app, reached_by: to.reachedBy, screen: prompt } : { screen: prompt };
    const planned = await run.askJev("Jev: plan the screen", state, planQuestions());
    const read = readPlan(planned.answers, to ? { topLevel: to.topLevel } : {});
    run.trace({ stage: planned.stage, ms: planned.ms, decisions: read.decisions, tokens: { input: planned.inputTokens, output: 0 } });

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
    const designed = applyDesign(read.plan, look);
    plan = designed.plan;
    if (designed.overruled.length) run.trace({ stage: `${design.name} overrules the plan: ${designed.overruled.join(", ")}`, ms: 0 });

    run.send({ createSurface: { surfaceId, catalogId: KIT_CATALOG_ID } });
    run.send({ updateComponents: { surfaceId, components: screen(plan, read.screenIcon) } });
    // The lead picture is seeded from the description, so it needs no words at all.
    if (plan.blocks.includes("hero")) run.send({ updateDataModel: { surfaceId, path: "/hero", value: { imageUrl: picture(prompt, 960, 540) } } });

    // The app's navigation is established once; every main screen after that shows the same one.
    const nav = journey?.nav;
    if (nav && plan.topLevel) {
      const active = nav.items.findIndex((item) => item.label === journey!.via.label);
      run.send({ updateDataModel: { surfaceId, path: "/nav", value: { items: nav.items, active: Math.max(0, active) } } });
    }
    const parts: Part[] = ["header", ...(plan.topLevel && !nav ? (["nav"] as Part[]) : []), ...plan.blocks.filter((b): b is Exclude<typeof b, "hero"> => b !== "hero")];
    streams.open(new Set<string>(parts));
    // Writers cannot see each other, so a bill would not add up. Totals wait for the line items and are shown them.
    const billed = plan.factsTotal && plan.blocks.includes("list");
    for (const part of parts) {
      if (streams.has(part) || (billed && part === "facts")) continue;
      const written = write(part);
      if (billed && part === "list") streams.spawn(written.then((list) => void (list && write("facts", list.items))));
    }
    await streams.settle();
  });
}
