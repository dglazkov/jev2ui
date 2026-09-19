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
//   photos as each pictured item completes, Jev picks its photograph from the
//          library; if none suits, the image model makes one (pictures.ts)
//
// Gemini never sees a component and Jev never writes a word, so the tree is
// valid by construction, and it is on screen before the first word is.

import { ContentStreams, type PartHooks } from "../content.js";
import { loadDesign, type DesignSource } from "../design-source.js";
import { parseDesign } from "../design-md.js";
import { resized } from "../photos/library.js";
import { Run, SURFACE_ID } from "../run.js";
import { KIT_CATALOG_ID } from "../../shared/kit.js";
import type { PipelineEvent } from "../../shared/events.js";
import type { Journey } from "../../shared/journey.js";
import { destination } from "./link.js";
import { applyDesign, planQuestions, readPlan, type ScreenPlan } from "./plan.js";
import { Pictures, itemWords } from "./pictures.js";
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
 * `source` is the developer's DESIGN.md, or the brief and seed of a mix; without one, Jev mixes a design from the description.
 * With a `journey`, the screen is the one a tap leads to, in the same app as the screen it was tapped on.
 */
export function runMock(described: string, source?: DesignSource, journey?: Journey): AsyncGenerator<PipelineEvent> {
  const markdown = source && "markdown" in source ? source.markdown : undefined;
  const run = new Run("mock");
  const surfaceId = SURFACE_ID;
  const to = journey && destination(journey);
  const prompt = to?.screen ?? described;

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    const decorations = new Decorations();
    const pictures = new Pictures(run, prompt);
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
    // A photograph joins its item like any other of Jev's answers, and joins it again if a better one had to be made.
    const photographs = asTheyComplete((item, i) => {
      // People are pictured too: an avatar is a portrait, unless the design has no photographs.
      const people = plan!.list.leading === "avatar" && plan!.imagery;
      if ((plan!.list.leading !== "thumbnail" && !people) || !item?.title) return;
      const big = plan!.list.layout !== "rows";
      const shown = (url: string) => (decorations.add("list", [{ at: ["items", i], values: { imageUrl: url } }]), streams.refresh("list"));
      const size: [number, number] = people || !big ? [160, 160] : [640, 480];
      streams.spawn(pictures.find(people ? { subject: "portrait", of: itemWords(item), ratio: "1:1", size } : { ...plan!.pictures.items, of: itemWords(item), ratio: "4:3", size }, shown));
    });
    const tones = once((list) => {
      const want = { tones: plan!.list.parts.includes("status") || plan!.list.parts.includes("progress"), icons: plan!.list.leading === "icon" && plan!.list.layout === "rows" };
      refine("list", refineItems(run, prompt, list.items ?? [], want));
    });
    const hooks: Partial<Record<Part, PartHooks>> = {
      banner: { onValue: once((banner) => refine("banner", refineBanner(run, prompt, banner))) },
      stats: { onValue: once((stats) => plan!.statDeltas && refine("stats", refineStats(run, prompt, stats))) },
      groups: { onValue: asTheyComplete((group, g) => refine("groups", refineGroup(run, prompt, g, group, plan!.icons, typeof to?.about?.value === "string" ? to.about.value : undefined))) },
      nav: { onValue: once((nav) => plan!.icons && refine("nav", refineNav(run, prompt, nav.items ?? []))) },
      actions: { onValue: once((actions) => actions.length && refine("actions", refineActions(run, prompt, actions))) },
      form: { onValue: (form, complete) => fields(form?.fields, complete) },
      list: { onValue: (list, complete) => (photographs(list?.items, complete), tones(list, complete)) },
      facts: {
        // The last line of a bill is its total; the tree binds `strong` and code says which row it is.
        decorate: (value, complete) => (plan!.factsTotal && complete && Array.isArray(value) ? value.map((row, i) => (i === value.length - 1 ? { ...row, strong: true } : row)) : value),
      },
    };

    // Parsing is local and instant, so even the header, requested before Jev has answered, is written in the brand's voice.
    // The photograph of a tapped item goes with the person to the page it opens; the writers have no use for it.
    const { imageUrl: carried, ...about } = (to?.about ?? {}) as Record<string, unknown>;
    const setting = { voice: markdown ? parseDesign(markdown).voice : "", ...(to ? { app: journey!.app, reachedBy: to.reachedBy, ...(to.about ? { about } : {}) } : {}) };
    const write = (part: Part, agreeWith?: unknown) => {
      const own = hooks[part];
      return streams.write(
        part,
        { system: SYSTEM_PROMPT, prompt: partPrompt(prompt, part, plan ?? null, setting, agreeWith), schema: partSchema(part, plan ?? null) },
        { ...own, decorate: (value, complete) => decorations.apply(part, own?.decorate ? own.decorate(value, complete) : value) },
      );
    };

    // t=0: the header is needed whatever the plan turns out to be.
    const header = write("header");
    if (to) run.trace({ stage: `Link: ${to.screen}`, ms: 0, detail: `reached by ${to.reachedBy}` });
    const designing = loadDesign(source ?? { brief: journey?.app ?? prompt });
    const state = to ? { first_screen: journey!.app, reached_by: to.reachedBy, screen: prompt } : { screen: prompt };
    const planned = await run.askJev("Jev: plan the screen", state, planQuestions());
    const read = readPlan(planned.answers, to ? { topLevel: to.topLevel, among: to.among } : {});
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
    // The lead picture is of what the header names. The description will not do: it lists what is on the screen, and a picture of that is a picture of a phone.
    if (plan.blocks.includes("hero")) {
      const shown = (url: string) => run.send({ updateDataModel: { surfaceId, path: "/hero", value: { imageUrl: url } } });
      if (typeof carried === "string") shown(resized(carried, 960, 540));
      else streams.spawn((async () => pictures.find({ ...plan.pictures.hero, of: itemWords(await header) || prompt, ratio: "16:9", size: [960, 540] }, shown))());
    }

    // A profile opens with the person's portrait: the one from the list they were tapped in, if that is how the person got here.
    if (plan.person && plan.imagery) {
      const shown = (url: string) => run.send({ updateDataModel: { surfaceId, path: "/person", value: { imageUrl: url } } });
      if (typeof carried === "string") shown(resized(carried, 320, 320));
      else streams.spawn((async () => pictures.find({ subject: "portrait", of: itemWords(await header) || prompt, ratio: "1:1", size: [320, 320] }, shown))());
    }

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
