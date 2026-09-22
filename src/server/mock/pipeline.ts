// The mock pipeline: describe a screen, get a mock.
//
// What a screen is made of is a file, grammar/screen.md, and what draws it is
// another, grammar/kit.md (docs/grammar.md); which pair, and so which idiom the
// screen is imagined in, is the request's (../idioms.ts). This is the run of it:
//
//   t=0    Jev is asked the file's questions (one request)                   }
//          Jev reads the DESIGN.md, or mixes one                             } in parallel
//          Gemini starts the header, in the brand's voice                    }
//   plan   the answers are read as the file says; the design overrules the
//          plan where they disagree; each part is drawn by the pattern the
//          file names, bound to data paths, and the whole tree is sent; one
//          writer per part starts, asked for what the part's fields say
//   words  stream into the data model; text that has not arrived shimmers
//   fill   what nobody writes comes from the chain the file gives it: the
//          custom part from the app's shelf, else baked, else the slot closes
//          (bake.ts); a picture from the library, else painted (pictures.ts)
//   decide as each part completes, Jev is asked what the file says is decided
//          once the words exist (a row's control, a status's tone, the main
//          button), and the answers join the data beside the words
//
// Gemini never sees a component and Jev never writes a word, so the tree is
// valid by construction, and it is on screen before the first word is. The one
// exception is what fills a custom slot, which is checked instead (bake.ts).

import { architectureNav, type ArchitectureRequest } from "../../shared/architecture.js";
import type { AskArchitecture } from "../ia/live.js";
import { initialNavigationQuestions, initialArchitecture } from "../ia/bootstrap.js";
import { bindControls } from "../ia/controls.js";
import { ContentStreams, type PartHooks } from "../content.js";
import { loadDesign, type DesignSource } from "../design-source.js";
import { parseDesign } from "../design-md.js";
import { resized } from "../photos/library.js";
import { Run, SURFACE_ID } from "../run.js";
import { idiom } from "../idioms.js";
import type { PipelineEvent } from "../../shared/events.js";
import type { Journey } from "../../shared/journey.js";
import { bakeCustom, shelfFrom } from "./bake.js";
import { destination, destinationIntent, homeTask } from "./link.js";
import { applyDesign, keepPlan, type Block, type ScreenPlan } from "./plan.js";
import type { ScreenEdit } from "../../shared/turn.js";
import { Pictures, itemWords } from "./pictures.js";
import { SYSTEM_PROMPT, partPrompt, knownSubjects, type Part, type Setting } from "./screen.js";
import { refineField } from "./refine.js";
import { decide, type Decoration } from "../grammar/decide.js";
import { boundIn, frameOf, treeOf } from "../grammar/make.js";
import { JEV, questionsOf, readGrammar } from "../grammar/read.js";
import { planOf } from "../grammar/screen-plan.js";

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
 * `fresh` is set when the developer asks for a screen again: whatever is custom on it is baked anew.
 * `notes` are what they have said about this screen since it was first made; it is made again with them in mind.
 * `edit` is what they settled by saying it: the parts the screen has, the plan that holds for the parts that stay, and
 * the words that stay. A part whose words stay has no writer, no refinement and no photograph looked for: it is sent as it was.
 */
export function runMock(described: string, source?: DesignSource, journey?: Journey, fresh = false, notes: string[] = [], edit?: ScreenEdit, architectureRequest?: ArchitectureRequest): AsyncGenerator<PipelineEvent> {
  // The idiom the request is imagined in: its grammar is what is asked and read, its patterns draw the answers.
  const { graph, patterns, catalogId } = idiom();
  const { grammar } = graph;
  const markdown = source && "markdown" in source ? source.markdown : undefined;
  const run = new Run("mock");
  const surfaceId = SURFACE_ID;
  const to = journey && destination(journey);
  const existing = architectureRequest && "state" in architectureRequest ? architectureRequest : undefined;
  const destinationId = existing?.destination ?? "first";
  const target = existing?.state.map.nodes.find((n) => n.id === destinationId);
  const catalogEntry = existing?.state.catalog?.find((c) => c.id === destinationId);
  // Old sessions may have materialized a generic planned Details node without recording
  // the subject that opened it. Its original journey still supplies that subject on regeneration.
  const observedTask = catalogEntry?.evidence.from.archetype === "plan" && to && ["row", "item", "itemAction", "part"].includes(journey!.via.kind) ? to.screen : catalogEntry ? destinationIntent(catalogEntry.evidence) : undefined;
  const catalogTask = catalogEntry ? `${destinationId === "home" ? homeTask(existing!.state.seed.brief) : observedTask}
${existing!.state.notes.filter((n) => n.destination === destinationId).map((n) => n.message).join("\n")}` : undefined;
  const destinationPrompt = catalogEntry ? `Make this destination, ${target!.label}: ${catalogTask}
The app was introduced by this first-screen brief (background context only): ${existing!.state.seed.brief}
` : target ? `${destinationId === "first" ? "The original requested screen" : `A DIFFERENT screen in the same app: ${target.label}`}.
The app was introduced by this first-screen brief (background context only): ${existing!.state.seed.brief}
THIS screen's assignment: ${destinationId === "home" ? "The app's main landing page. Show entry points to the app's primary activities below. The original first screen already exists separately; do not recreate it here." : target.purpose}
Its allowed destinations and activities: ${JSON.stringify(target.actions.map((a) => ({ activity: a.label, disposition: a.kind, destination: a.target, purpose: existing!.state.map.nodes.find((n) => n.id === a.target)?.purpose })))}
Choose the layout and all content for THIS assignment. The first-screen brief identifies the product, not this screen's layout.
${existing!.state.notes.filter((n) => n.destination === destinationId).map((n) => n.message).join("\n")}` : undefined;
  // Jev and the writers read the notes as part of the description: they are the developer's words as much as it is.
  const prompt = [destinationPrompt ?? to?.screen ?? described, ...(notes.length ? [`The developer has seen this screen and asked for these changes, which come before anything above that they contradict:\n${notes.map((note) => `- ${note}`).join("\n")}`] : [])].join("\n\n");

  const kept: Record<string, any> = edit?.kept ?? {};
  const settled = edit?.blocks.filter((block): block is Block => (graph.blocks as readonly string[]).includes(block));

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    const decorations = new Decorations();
    const pictures = new Pictures(run, prompt, journey?.app ?? prompt);
    let plan: ScreenPlan | undefined;
    let architecture = existing?.state;
    const askArchitecture: AskArchitecture = async (stage, state, questions) => {
      const result = await run.askJev(stage, state, questions);
      run.trace({ stage, ms: result.ms, tokens: { input: result.inputTokens, output: 0 } });
      return result;
    };

    /** Runs a refinement, then re-sends the part so the answers reach the screen. */
    const refine = (part: Part, work: Promise<Decoration[]>) =>
      streams.spawn(
        work.then((found) => {
          decorations.add(part, found);
          streams.refresh(part);
        }),
        part,
      );
    /** Calls `each` once for every element that is complete: all but the last while streaming, all of them at the end. */
    const asTheyComplete = (each: (item: any, i: number, all: any[]) => void) => {
      let seen = 0;
      return (items: any, complete: boolean) => {
        const streamed: any[] = Array.isArray(items) ? items : [];
        const ready = complete ? streamed.length : streamed.length - 1;
        for (; seen < ready; seen++) each(streamed[seen], seen, streamed);
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

    /** What is drawn of each part, and so which of its fields Jev has any reason to be asked about. */
    const drawn = new Map<string, Set<string>>();
    /**
     * What the file says is decided once a part's words exist, asked of them. One request per part, or per element of an
     * outer list (the rows of one group); `only` picks the request that is about the element that has just completed.
     */
    const later = (part: Part, value: unknown, only?: (outer: number | undefined) => boolean) => {
      const node = graph.partNode(part);
      const bound = drawn.get(part) ?? new Set<string>();
      const chosen = typeof to?.about?.value === "string" ? to.about.value : undefined;
      const same = (x: unknown, y: unknown) => String(x).trim().toLowerCase() === String(y).trim().toLowerCase();
      const asked = decide(grammar, node, value, {
        description: prompt,
        reading: graph.readingOf(plan!),
        calibration: JEV,
        needed: (path) => bound.has(path),
        // Exactly one option of a picker is chosen: the value the person saw on the row they tapped, if that is how they got here.
        known: (field, element) => field.name === "on" && !!chosen && same(element?.label, chosen),
      });
      for (const one of asked) {
        if (only && !only(one.outer)) continue;
        const about = one.outer !== undefined && Array.isArray(value) ? `rows of "${value[one.outer]?.title}"` : `read the ${part}`;
        refine(
          part,
          (async () => {
            if (!Object.keys(one.questions).length) return one.read({}).decorations;
            const answered = await run.askJev(`Jev: ${about}`, one.state, one.questions);
            const { decorations, decisions } = one.read(answered.answers);
            run.trace({ stage: answered.stage, ms: answered.ms, decisions, tokens: { input: answered.inputTokens, output: 0 } });
            return decorations;
          })(),
        );
      }
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
      streams.spawn(pictures.find(people ? { subject: "portrait", of: itemWords(item), ratio: "1:1", size } : { ...plan!.pictures.items, of: itemWords(item), ratio: "4:3", size }, shown, graph.chainOf("list", "imageUrl")));
    });
    // A refinement re-sends the part, which calls its hook again: everything asked once the words exist is asked once.
    const tones = once((list) => later("list", list));
    const hooks: Partial<Record<Part, PartHooks>> = {
      banner: { onValue: once((banner) => later("banner", banner)) },
      stats: { onValue: once((stats) => later("stats", stats)) },
      // A group's rows are read as each group completes, so that no group waits for the rest.
      groups: { onValue: asTheyComplete((_, g, groups) => later("groups", groups, (outer) => outer === g)) },
      nav: { onValue: once((nav) => later("nav", nav)) },
      actions: { onValue: once((actions) => later("actions", actions)) },
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
    const setting: Setting = { voice: markdown ? parseDesign(markdown).voice : "", ...(to ? { app: journey!.app, reachedBy: to.reachedBy, ...(to.about ? { about } : {}) } : {}) };
    setting.knownScreens = knownSubjects(existing?.state.catalog, destinationId);
    const write = (part: Part, agreeWith?: unknown) => {
      const own = hooks[part];
      return streams.write(
        part,
        { system: SYSTEM_PROMPT, prompt: partPrompt(prompt, part, plan ?? null, setting, agreeWith), schema: graph.partSchema(part, plan ?? null) },
        { ...own, decorate: (value, complete) => decorations.apply(part, own?.decorate ? own.decorate(value, complete) : value) },
      );
    };

    // t=0: the header is needed whatever the plan turns out to be.
    const header: Promise<any> = kept.header ? Promise.resolve(kept.header) : write("header");
    if (to) run.trace({ stage: `Link: ${to.screen}`, ms: 0, detail: `reached by ${to.reachedBy}` });
    const designing = loadDesign(source ?? { brief: journey?.app ?? prompt });
    const screenTask = catalogTask ? [catalogTask, ...notes].join("\n\n") : prompt;
    const state = to ? { first_screen: journey!.app, reached_by: to.reachedBy, screen: screenTask } : { screen: screenTask };
    const startingApp = architectureRequest && "create" in architectureRequest;
    const navigationQuestions = startingApp ? initialNavigationQuestions() : {};
    const planned = await run.askJev("Jev: plan the screen", state, { ...questionsOf(grammar), ...navigationQuestions });
    const was = typeof edit?.plan.archetype === "string" ? [edit.plan.archetype] : undefined;
    // What is settled before Jev is asked: by how the person got here, or by what the developer said.
    const arrived: { topLevel?: boolean; among?: string[] } = existing?.state.navigation?.includes(destinationId) && (destinationId !== "first" || existing.state.map.home === "first") ? { topLevel: true } : catalogEntry && to ? { topLevel: to.topLevel, among: to.among } : target ? (destinationId === "first" ? {} : { topLevel: destinationId === "home" }) : to ? { topLevel: to.topLevel, among: to.among } : {};
    const reading = readGrammar(grammar, planned.answers, JEV, {
      ...(settled ? { blocks: settled, ...(was ? { among: was } : {}) } : arrived.among ? { among: arrived.among } : {}),
      ...(arrived.topLevel !== undefined ? { values: { top_level: arrived.topLevel } } : {}),
    });
    const read = { plan: planOf(grammar, reading), decisions: reading.decisions };
    for (const id of Object.keys(navigationQuestions)) read.decisions.push({ id, question: id === "nav_home" ? "initial home destination" : `initial navigation: ${id.slice(4)}`, answer: planned.answers[id].choice, p: planned.answers[id].probabilities[planned.answers[id].choice] });
    run.trace({ stage: planned.stage, ms: planned.ms, decisions: read.decisions, tokens: { input: planned.inputTokens, output: 0 } });

    if (startingApp) {
      architecture = initialArchitecture(described, read.plan, planned.answers);
      if (architecture.map.home === "first") read.plan.topLevel = true;
      run.architecture({ type: "architecture", architecture });
    }

    const { design, read: look, report, mixed } = await designing.loaded;
    if (designing.fresh) {
      run.stats.jevCalls++;
      run.stats.jevInputTokens += look.jevInputTokens;
    }
    run.design(report, mixed);
    run.trace({
      stage: mixed ? "Jev: generate a DESIGN.md" : `Jev: read ${design.name}`,
      ms: designing.fresh ? look.ms : 0,
      endpoint: report.endpoint,
      detail: designing.fresh ? "alongside the plan" : "read before; reused",
      decisions: look.decisions,
      tokens: { input: designing.fresh ? look.jevInputTokens : 0, output: 0 },
    });
    // What stays of the screen keeps the plan it had; what is new takes the plan just made.
    const designed = applyDesign(edit && settled ? keepPlan(graph, read.plan, edit.plan, read.plan.blocks) : read.plan, look);
    plan = designed.plan;
    run.plan(plan as unknown as Record<string, unknown> & { archetype: string; blocks: string[] });
    pictures.drawn = plan.illustrated;
    if (designed.overruled.length) run.trace({ stage: `${design.name} overrules the plan: ${designed.overruled.join(", ")}`, ms: 0 });

    // Each part is drawn by the pattern the file names for it, from what the file says it is made of, as the plan now
    // stands; then the frame, by the pattern the kinds name, set by the kind's traits and the answers at the top of the file.
    const asRead = graph.readingOf(plan);
    const drawing = { contained: plan.contained, icons: plan.icons, symbol: plan.symbol };
    const parts = plan.blocks.map((block) => [block, treeOf(patterns, grammar, graph.partNode(block), asRead, drawing)] as const);
    for (const [block, tree] of parts) drawn.set(block, boundIn(tree));
    const frame = frameOf(patterns, grammar, asRead, drawing, parts.map(([name, tree]) => ({ name, root: tree[0].id })));
    if (!frame) throw new Error(`the "${grammar.name}" grammar names no frame for its kinds`);
    drawn.set("nav", boundIn(frame));
    run.send({ createSurface: { surfaceId, catalogId } });
    run.send({ updateComponents: { surfaceId, components: [...frame, ...parts.flatMap(([, tree]) => tree)] } });
    // The lead picture is of what the header names. The description will not do: it lists what is on the screen, and a picture of that is a picture of a phone.
    if (plan.blocks.includes("hero")) {
      const shown = (url: string) => run.send({ updateDataModel: { surfaceId, path: "/hero", value: { imageUrl: url } } });
      if (kept.hero) run.send({ updateDataModel: { surfaceId, path: "/hero", value: kept.hero } });
      else if (typeof carried === "string") shown(resized(carried, 960, 540));
      else streams.spawn((async () => pictures.find({ ...plan.pictures.hero, of: itemWords(await header) || prompt, ratio: "16:9", size: [960, 540] }, shown, graph.chainOf("hero", "imageUrl")))());
    }

    // A profile opens with the person's portrait: the one from the list they were tapped in, if that is how the person got
    // here. It joins the header, which fills the frame, as any other of Jev's answers joins its part.
    if (plan.person && plan.imagery && kept.header === undefined) {
      const shown = (url: string) => (decorations.add("header", [{ at: [], values: { imageUrl: url } }]), streams.refresh("header"));
      if (typeof carried === "string") shown(resized(carried, 320, 320));
      else streams.spawn((async () => pictures.find({ subject: "portrait", of: itemWords(await header) || prompt, ratio: "1:1", size: [320, 320] }, shown, graph.chainOf("header", "imageUrl")))());
    }

    // The app's navigation is established once; every main screen after that shows the same one.
    const nav = architectureRequest ? undefined : journey?.nav;
    if (nav && plan.topLevel) {
      const active = nav.items.findIndex((item) => item.label === journey!.via.label);
      run.send({ updateDataModel: { surfaceId, path: "/nav", value: { items: nav.items, active: Math.max(0, active) } } });
    }
    // Navigation is already available from the screen plan. No extra model round trip.
    const written: Part[] = ["header", ...(plan.topLevel && !nav && !architectureRequest ? (["nav"] as Part[]) : []), ...plan.blocks.filter((b): b is Exclude<typeof b, "hero" | "custom"> => b !== "hero" && b !== "custom")];
    streams.open(new Set<string>(written));
    const draft = architecture;
    if (draft) {
      const node = draft.map.nodes.find((n) => n.id === destinationId)!;
      if (!draft.catalog) setting.architecture = `Closed app contract: ${JSON.stringify({ responsibility: node.purpose, actions: node.actions, destinations: draft.map.nodes.map(({ id, label, purpose }) => ({ id, label, purpose })) })}\nUse only these navigation responsibilities. Local controls may work in place; do not invent other destinations.\n`;
      if (plan.topLevel) run.send({ updateDataModel: { surfaceId, path: "/nav", value: architectureNav(draft, destinationId) } });
    }
    // Baking takes seconds, not milliseconds. It starts now and the slot shimmers, like a picture that has not loaded.
    if (plan.custom) streams.spawn(bakeCustom(run, surfaceId, prompt, plan, { ...setting, voice: setting.voice || (mixed ? parseDesign(mixed).voice : "") }, shelfFrom(journey?.shelf), fresh));
    const staying = written.filter((part) => kept[part] !== undefined);
    for (const part of staying) run.send({ updateDataModel: { surfaceId, path: `/${part}`, value: kept[part] } });
    if (staying.length) run.trace({ stage: `Unchanged: ${staying.join(", ")}`, ms: 0, detail: "nobody asked for these to change, so nothing wrote them again" });
    // Writers cannot see each other, so a bill would not add up. Totals wait for the line items and are shown them.
    const billed = plan.factsTotal && plan.blocks.includes("list") && kept.facts === undefined && kept.list === undefined;
    for (const part of written) {
      if (streams.has(part) || kept[part] !== undefined || (billed && part === "facts")) continue;
      const written = write(part);
      if (billed && part === "list") streams.spawn(written.then((list) => void (list && write("facts", list.items))));
    }
    // Only older closed-map requests require rendered-control binding.
    if (architecture && !architecture.catalog) streams.spawn((async () => {
      try {
        await streams.ready(new Set(["groups", "list", "form", "actions"]));
        const routes = await bindControls(architecture!, destinationId, run.sent, askArchitecture);
        run.architecture({ type: "routes", destination: destinationId, routes });
      } catch (error) {
        run.architecture({ type: "architecture-error", message: `Screen controls could not be connected: ${(error as Error).message}` });
      }
    })());
    await streams.settle();
  });
}
