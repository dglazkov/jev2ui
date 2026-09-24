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
import { appAnswers } from "./graph.js";
import type { PipelineEvent } from "../../shared/events.js";
import type { Journey } from "../../shared/journey.js";
import { bakeCustom, customOf, shelfFrom } from "./bake.js";
import { destination, destinationIntent, homeTask } from "./link.js";
import type { ScreenEdit } from "../../shared/turn.js";
import { Pictures, itemWords } from "./pictures.js";
import { SYSTEM_PROMPT, partPrompt, knownSubjects, type Setting } from "./screen.js";
import { refineField } from "./refine.js";
import type { SubjectName } from "../photos/subjects.js";
import { decide, type Decoration } from "../grammar/decide.js";
import { laterOf, type Atom, type Field, type Node } from "../grammar/format.js";
import { appliesIn, boundIn, contentNodes, filling, frameKnobsOf, frameOf, framePatternOf, knobsOf, partsOf, schemaOf, treeOf, wholeOf, type Look } from "../grammar/make.js";
import { EMPTY, JEV, givensOf, holdsIn, questionsOf, readGrammar, type Reading, type Value } from "../grammar/read.js";

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
  // What the tool needs of a frame it finds by the roles the frame's pattern gives its slots and knobs (make.ts), not by
  // any name: what is written first (whatever fills the title), where the app's destinations go, and which knob makes a
  // screen one of the app's main ones.
  const roles = framePatternOf(patterns, grammar)?.roles;
  const titled = filling(patterns, grammar, "title")!;
  const destinations = filling(patterns, grammar, "destinations");
  const mainKnob = roles?.main ?? "navigation";
  // What an app settles once, on its first screen, and every screen after it is given: the questions with the trait `app`.
  const settledBefore = appAnswers(graph, journey?.settled);
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
  const settled = edit?.blocks.filter((block) => graph.blocks.includes(block));

  return run.drive(async () => {
    const streams = new ContentStreams(run, surfaceId);
    const decorations = new Decorations();
    const pictures = new Pictures(run, prompt, journey?.app ?? prompt);
    let reading: Reading | undefined;
    /** The frame's knobs as the reading turns them: whether this is a main screen is `navigation`. */
    let frame: Record<string, Value> = {};
    /** What the design decides and no graph does: cards, symbols, and the symbol that holds a picture's place. */
    let look: Look = { contained: true, icons: true, symbol: "image" };
    let imagery = true;
    let architecture = existing?.state;
    const askArchitecture: AskArchitecture = async (stage, state, questions) => {
      const result = await run.askJev(stage, state, questions);
      run.trace({ stage, ms: result.ms, tokens: { input: result.inputTokens, output: 0 } });
      return result;
    };
    const holds = (atoms?: Atom[]) => !atoms || atoms.every((atom) => holdsIn(reading!, atom));

    /** Runs a refinement, then re-sends the part so the answers reach the screen. */
    const refine = (part: string, work: Promise<Decoration[]>) =>
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
    const later = (part: string, value: unknown, only?: (outer: number | undefined) => boolean) => {
      const node = graph.partNode(part);
      const bound = drawn.get(part) ?? new Set<string>();
      const chosen = typeof to?.about?.value === "string" ? to.about.value : undefined;
      const same = (x: unknown, y: unknown) => String(x).trim().toLowerCase() === String(y).trim().toLowerCase();
      const firstWords = (element: any) => Object.values(element ?? {}).find((v) => typeof v === "string");
      const asked = decide(grammar, node, value, {
        description: prompt,
        reading: reading!,
        calibration: JEV,
        needed: (path) => bound.has(path),
        // Exactly one option of a picker is chosen: the one the person saw on the row they tapped, if that is how they got here.
        known: (field, element) => !!field.oneWhere && !!chosen && same(firstWords(element), chosen),
      });
      for (const one of asked) {
        if (only && !only(one.outer)) continue;
        const list = node.children.map(laterOf).find((l) => l?.outer)?.outer?.list;
        const rows: any[] | undefined = Array.isArray(value) ? value : list ? (value as any)?.[list] : undefined;
        const about = one.outer !== undefined && Array.isArray(rows) ? `rows of "${firstWords(rows[one.outer])}"` : `read the ${part}`;
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

    // --- Pictures: a field whose chain looks in a set, or has one made, is a picture to find ---------------------------
    /** A field that is looked for, and that is there for this reading. */
    const looked = (field: Field) => !!field.source?.some((step) => graph.sources.get(step.name)?.includes("set")) && holds(field.when);
    /** What a picture is of, and how sure: the answer `by` names, else a portrait if that is its slot, else the words decide. */
    const subjectOf = (field: Field): { subject: SubjectName; p: number } => {
      const by = field.source?.find((step) => step.by)?.by;
      if (by) return { subject: reading!.values[by] as SubjectName, p: reading!.decisions.find((d) => d.id === by)?.p ?? reading!.p[by] ?? 1 };
      return field.role === "portrait" ? { subject: "portrait", p: 1 } : { subject: "venue", p: 0 };
    };
    /** The picture of one element of a list: a portrait is square and small; a thumbnail is landscape, and large where the layout shows it large. */
    const elementPictures = (node: Node, list: Field, inside: Field, whole: boolean) =>
      asTheyComplete((item, i) => {
        if (!item || !imagery) return;
        const wanted = subjectOf(inside);
        const big = String(knobsOf(grammar, node, reading!).layout ?? "rows") !== "rows";
        const size: [number, number] = wanted.subject === "portrait" || !big ? [160, 160] : [640, 480];
        const shown = (url: string) => (decorations.add(node.name, [{ at: [...(whole ? [] : [list.name]), i], values: { [inside.name]: url } }]), streams.refresh(node.name));
        streams.spawn(pictures.find({ ...wanted, of: itemWords(item), ratio: wanted.subject === "portrait" ? "1:1" : "4:3", size }, shown, inside.source!));
      });

    // --- Hooks: what happens to a part as its words arrive, from what the file says of the part ---------------------
    const fields = asTheyComplete((field, i) => refine("form", refineField(run, prompt, i, field)));
    const hooksOf = (node: Node): PartHooks => {
      const on: Array<(value: any, complete: boolean) => void> = [];
      const whole = wholeOf(node, holds);
      for (const list of node.fields.filter((field) => field.list && holds(field.when))) {
        const inside = list.fields.find(looked);
        // A photograph joins its item like any other of Jev's answers, and joins it again if a better one had to be made.
        if (inside) {
          const each = elementPictures(node, list, inside, list === whole);
          on.push((value, complete) => each(list === whole ? value : value?.[list.name], complete));
        }
      }
      // What is decided once the words exist: as each element of an outer list completes (the rows of a group), so that no
      // group waits for the rest; otherwise once the part is complete. A refinement re-sends the part, which calls its hook
      // again: everything asked once the words exist is asked once.
      const laters = node.children.map(laterOf).filter((l) => l);
      const outer = laters.find((l) => l?.outer)?.outer;
      if (outer) {
        // The outer list is the part (the kit's groups), or a field of it (Windows's sections): its elements are counted, and
        // what is asked of them is asked of the part as it then stands.
        let latest: any;
        const each = asTheyComplete((_, g) => later(node.name, latest, (at) => at === g));
        on.push((value, complete) => ((latest = value), each(Array.isArray(value) ? value : value?.[outer.list], complete)));
      } else if (laters.length) on.push(once((value) => later(node.name, value)));
      // The kind of a form's field is still decided by code older than the kit (refine.ts, design.ts).
      if (node.target === "form") on.push((form, complete) => fields(form?.[node.fields.find((f) => f.role === "fields")?.name ?? "fields"], complete));
      // What a pattern works out from what was written, once all of it is: the row of a bill the others add up to.
      const pattern = node.target ? patterns[node.target] : undefined;
      const computed = node.fields.flatMap((list) => (list.list ? list.fields.filter((f) => f.source?.some((step) => step.name === "computed") && holds(f.when) && pattern?.computed?.[f.role ?? ""]).map((f) => ({ list, f })) : []));
      const decorate = computed.length
        ? (value: any, complete: boolean) => {
            if (!complete) return value;
            for (const { list, f } of computed) {
              const work = pattern!.computed![f.role!];
              if (list === whole && Array.isArray(value)) value = work(value);
              else if (Array.isArray(value?.[list.name])) value = { ...value, [list.name]: work(value[list.name]) };
            }
            return value;
          }
        : undefined;
      return { ...(on.length ? { onValue: (value: any, complete: boolean) => on.forEach((hook) => hook(value, complete)) } : {}), ...(decorate ? { decorate } : {}) };
    };

    // Parsing is local and instant, so even the header, requested before Jev has answered, is written in the brand's voice.
    // The photograph of a tapped item goes with the person to the page it opens; the writers have no use for it.
    const { imageUrl: carried, ...about } = (to?.about ?? {}) as Record<string, unknown>;
    const setting: Setting = { voice: markdown ? parseDesign(markdown).voice : "", ...(to ? { app: journey!.app, reachedBy: to.reachedBy, ...(to.about ? { about } : {}) } : {}) };
    setting.knownScreens = knownSubjects(existing?.state.catalog, destinationId);
    const write = (part: string, agreeWith?: unknown) => {
      const node = graph.partNode(part);
      const own = reading ? hooksOf(node) : {};
      return streams.write(
        part,
        { system: SYSTEM_PROMPT, prompt: partPrompt(prompt, part, reading ?? null, setting, agreeWith, grammar.name, titled.name), schema: schemaOf(node, reading ?? EMPTY) },
        { ...own, decorate: (value, complete) => decorations.apply(part, own.decorate ? own.decorate(value, complete) : value) },
      );
    };

    // t=0: the header is needed whatever the plan turns out to be.
    const header: Promise<any> = kept[titled.name] ? Promise.resolve(kept[titled.name]) : write(titled.name);
    if (to) run.trace({ stage: `Link: ${to.screen}`, ms: 0, detail: `reached by ${to.reachedBy}` });
    const designing = loadDesign(source ?? { brief: journey?.app ?? prompt });
    const screenTask = catalogTask ? [catalogTask, ...notes].join("\n\n") : prompt;
    // The description is read under the key the grammar names: `screen` for the tool's own, `email` for the emails'.
    const key = grammar.stateKey ?? grammar.name;
    const state = to ? { first_screen: journey!.app, reached_by: to.reachedBy, [key]: screenTask } : { [key]: screenTask };
    const startingApp = architectureRequest && "create" in architectureRequest;
    const navigationQuestions = startingApp ? initialNavigationQuestions() : {};
    const [planned, { design, read: designRead, report, mixed }] = await Promise.all([run.askJev("Jev: plan the screen", state, { ...questionsOf(grammar), ...navigationQuestions }), designing.loaded]);
    const was = typeof edit?.plan.kind === "string" ? [edit.plan.kind] : typeof edit?.plan.archetype === "string" ? [edit.plan.archetype] : undefined;
    // What is settled before Jev is asked: by how the person got here, or by what the developer said.
    const arrived: { topLevel?: boolean; among?: string[] } = existing?.state.navigation?.includes(destinationId) && (destinationId !== "first" || existing.state.map.home === "first") ? { topLevel: true } : catalogEntry && to ? { topLevel: to.topLevel, among: to.among } : target ? (destinationId === "first" ? {} : { topLevel: destinationId === "home" }) : to ? { topLevel: to.topLevel, among: to.among } : {};
    // The question whose answer is the frame's navigation: a main screen, or one reached by drilling in.
    const mainScreen = grammar.nodes.find((node) => node.target === mainKnob && node.asking?.type === "noul");
    // What the design says, given to the graph: its rules say what a design without photographs, symbols or cards does to the screen.
    const given = { ...givensOf(grammar), ...("no_photographs" in givensOf(grammar) ? { no_photographs: !designRead.imagery, no_symbols: !designRead.icons, no_cards: !designRead.contained } : {}) };
    reading = readGrammar(grammar, planned.answers, JEV, {
      ...(settled ? { blocks: settled, ...(was ? { among: was } : {}) } : arrived.among ? { among: arrived.among } : {}),
      values: {
        ...given,
        ...settledBefore,
        // What stays of the screen keeps the reading it had, for the parts that stay; what is new takes the reading just made.
        ...(edit && settled ? graph.keptOf(edit.plan, settled) : {}),
        ...(arrived.topLevel !== undefined && mainScreen ? { [mainScreen.name]: arrived.topLevel } : {}),
      },
    });
    const decisions = [...reading.decisions];
    for (const id of Object.keys(navigationQuestions)) decisions.push({ id, question: id === "nav_home" ? "initial home destination" : `initial navigation: ${id.slice(4)}`, answer: planned.answers[id].choice, p: planned.answers[id].probabilities[planned.answers[id].choice] });
    run.trace({ stage: planned.stage, ms: planned.ms, decisions, tokens: { input: planned.inputTokens, output: 0 } });
    if (designing.fresh) {
      run.stats.jevCalls++;
      run.stats.jevInputTokens += designRead.jevInputTokens;
    }
    run.design(report, mixed);
    run.trace({
      stage: mixed ? "Jev: generate a DESIGN.md" : `Jev: read ${design.name}`,
      ms: designing.fresh ? designRead.ms : 0,
      endpoint: report.endpoint,
      detail: designing.fresh ? "alongside the plan" : "read before; reused",
      decisions: designRead.decisions,
      tokens: { input: designing.fresh ? designRead.jevInputTokens : 0, output: 0 },
    });

    const parts = partsOf(grammar, reading);
    const pattern = framePatternOf(patterns, grammar);
    const knobs = () => (pattern ? frameKnobsOf(grammar, reading!, pattern.knobs) : {});
    // A knob a question of yes or no turns is true or false; one a trait or a named option sets is "yes" or "no".
    const onMain = () => frame[mainKnob] === "yes" || frame[mainKnob] === true;
    frame = knobs();
    const custom = parts.filter((node) => node.filled).map((node) => customOf(graph, node, reading!));
    if (startingApp) {
      // As many main destinations as the grammar's list of them takes: a bar of five, a pane of eight.
      const most = destinations?.fields.find((field) => field.role === roles?.destinations)?.list?.max ?? 5;
      architecture = initialArchitecture(described, { archetype: reading.kind, topLevel: onMain(), ...(custom.length ? { custom: { use: custom[0].contract.use } } : {}) }, planned.answers, most);
      if (architecture.map.home === "first" && mainScreen) {
        reading.values[mainScreen.name] = true;
        frame = knobs();
      }
      run.architecture({ type: "architecture", architecture });
    }
    imagery = designRead.imagery;
    pictures.drawn = designRead.treatment === "illustrated";
    // The symbol of what the screen is about holds the place of every picture until it has loaded.
    const symbolOf = grammar.nodes.find((node) => node.target === "symbol");
    const symbol = symbolOf ? String(reading.values[symbolOf.name] ?? "none") : "none";
    look = { contained: designRead.contained, icons: designRead.icons, symbol: symbol === "none" ? "image" : symbol };
    run.plan({ kind: reading.kind, blocks: [...reading.blocks], values: { ...reading.values }, p: { ...reading.p } });

    // Each part is drawn by the pattern the file names for it, from what the file says it is made of, as the reading now
    // stands; then the frame, by the pattern the kinds name, set by the kind's traits and the answers at the top of the file.
    const trees = parts.map((node) => [node.name, treeOf(patterns, grammar, node, reading!, look)] as const);
    for (const [part, tree] of trees) drawn.set(part, boundIn(tree));
    const framed = frameOf(patterns, grammar, reading, look, trees.map(([name, tree]) => ({ name, root: tree[0].id })));
    if (!framed) throw new Error(`the "${grammar.name}" grammar names no frame for its kinds`);
    for (const node of contentNodes(grammar)) drawn.set(node.name, boundIn(framed));
    run.send({ createSurface: { surfaceId, catalogId } });
    run.send({ updateComponents: { surfaceId, components: [...framed, ...trees.flatMap(([, tree]) => tree)] } });
    // The browser is told what the frame is, since what it is drawn with is the catalog's: over another screen, or a main
    // one; where the screen's title and the app's destinations are; and what the app settles once, for every screen after.
    const over = Boolean(pattern?.over?.(frame));
    const titleField = titled.fields.find((field) => field.role === roles?.title);
    // The app's destinations go wherever the frame draws them: on a main screen for a bar of tabs, on every page for a pane.
    const drawsDestinations = !!destinations && [...boundIn(framed)].some((path) => path.startsWith(`/${destinations.name}/`));
    run.frame({
      over,
      main: onMain() && !over,
      ...(titleField ? { title: `/${titled.name}/${titleField.name}` } : {}),
      ...(drawsDestinations ? { destinations: `/${destinations!.name}` } : {}),
      ...(Object.keys(appAnswers(graph, reading.values)).length ? { app: appAnswers(graph, reading.values) } : {}),
    });

    // A picture at the top of a part (the lead photograph) is of what the header names: the description will not do, since
    // it lists what is on the screen, and a picture of that is a picture of a phone. The one a tapped item carried is it.
    for (const node of parts) {
      for (const field of node.fields.filter(looked)) {
        if (kept[node.name] !== undefined) continue;
        const shown = (url: string) => run.send({ updateDataModel: { surfaceId, path: `/${node.name}`, value: { [field.name]: url } } });
        if (typeof carried === "string") shown(resized(carried, 960, 540));
        else if (imagery) streams.spawn((async () => pictures.find({ ...subjectOf(field), of: itemWords(await header) || prompt, ratio: "16:9", size: [960, 540] }, shown, field.source!))());
      }
    }
    // A profile opens with the person's portrait: the one from the list they were tapped in, if that is how the person got
    // here. It joins the header, which fills the frame, as any other of Jev's answers joins its part.
    for (const node of contentNodes(grammar).filter((node) => appliesIn(grammar, node, reading!))) {
      for (const field of node.fields.filter(looked)) {
        if (kept[node.name] !== undefined || !drawn.get(node.name)?.has(`/${node.name}/${field.name}`)) continue;
        const shown = (url: string) => (decorations.add(node.name, [{ at: [], values: { [field.name]: url } }]), streams.refresh(node.name));
        if (typeof carried === "string") shown(resized(carried, 320, 320));
        else if (imagery) streams.spawn((async () => pictures.find({ ...subjectOf(field), of: itemWords(await header) || prompt, ratio: "1:1", size: [320, 320] }, shown, field.source!))());
      }
    }

    // The app's navigation is established once; every main screen after that shows the same one.
    const nav = architectureRequest ? undefined : journey?.nav;
    if (nav && drawsDestinations) {
      const active = nav.items.findIndex((item) => item.label === journey!.via.label);
      run.send({ updateDataModel: { surfaceId, path: `/${destinations!.name}`, value: { items: nav.items, active: Math.max(0, active) } } });
    }
    // What is written: the header, what else is always written where the reading opens it (the navigation, on a main screen
    // whose destinations nobody has settled), and every part a writer is asked for. A part that arrives whole has no writer.
    const written: string[] = [
      titled.name,
      ...contentNodes(grammar).filter((node) => node !== titled && appliesIn(grammar, node, reading!) && !(node === destinations && (nav || architectureRequest)) && schemaOf(node, reading!)).map((node) => node.name),
      ...parts.filter((node) => schemaOf(node, reading!)).map((node) => node.name),
    ];
    streams.open(new Set<string>(written));
    const draft = architecture;
    if (draft) {
      const node = draft.map.nodes.find((n) => n.id === destinationId)!;
      if (!draft.catalog) setting.architecture = `Closed app contract: ${JSON.stringify({ responsibility: node.purpose, actions: node.actions, destinations: draft.map.nodes.map(({ id, label, purpose }) => ({ id, label, purpose })) })}\nUse only these navigation responsibilities. Local controls may work in place; do not invent other destinations.\n`;
      if (drawsDestinations) run.send({ updateDataModel: { surfaceId, path: `/${destinations!.name}`, value: architectureNav(draft, destinationId) } });
    }
    // Baking takes seconds, not milliseconds. It starts now and the slot shimmers, like a picture that has not loaded.
    for (const one of custom) if (kept[one.part] === undefined) streams.spawn(bakeCustom(run, surfaceId, prompt, one, { ...setting, voice: setting.voice || (mixed ? parseDesign(mixed).voice : "") }, shelfFrom(journey?.shelf), fresh));
    const staying = [...written, ...parts.filter((node) => !schemaOf(node, reading!)).map((node) => node.name)].filter((part) => kept[part] !== undefined);
    for (const part of staying) run.send({ updateDataModel: { surfaceId, path: `/${part}`, value: kept[part] } });
    if (staying.length) run.trace({ stage: `Unchanged: ${staying.join(", ")}`, ms: 0, detail: "nobody asked for these to change, so nothing wrote them again" });
    // Writers cannot see each other, so a bill would not add up: a part with a note that holds (the last line is the total)
    // waits for the part it is the total of, the one drawn as a collection, and is shown its lines.
    const items = parts.find((node) => node.target === "collection" && written.includes(node.name));
    const sums = items && parts.find((node) => node !== items && written.includes(node.name) && node.fields.some((field) => field.notes.some((note) => holds(note.when))));
    const billed = !!sums && kept[sums.name] === undefined && kept[items.name] === undefined;
    for (const part of written) {
      if (streams.has(part) || kept[part] !== undefined || (billed && part === sums!.name)) continue;
      const writing = write(part);
      if (billed && part === items!.name) streams.spawn(writing.then((list) => void (list && write(sums!.name, list[items!.fields.find((f) => f.list)?.name ?? "items"] ?? list))));
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
