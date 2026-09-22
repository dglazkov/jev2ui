// A picture for one thing on the screen: the lead photograph, or one item of a
// list. Looking through the library is code; choosing is Jev's, and one of the
// choices is always "none of these", because a wrong photograph is worse than
// a painted frame. When Jev says none, the image model makes one, and the
// library has it next time.

import { choice } from "@typesafe-ai/sdk";
import { fill } from "../grammar/fill.js";
import type { Source } from "../grammar/format.js";
import { ranked } from "../models.js";
import { idiom } from "../idioms.js";
import { makesPhotos, makePhoto, type Brief } from "../photos/generate.js";
import { photoUrl, shortlist, type Photo } from "../photos/library.js";
import { SUBJECTS, type SubjectName } from "../photos/subjects.js";
import type { Run } from "../run.js";

const OFFERED = 5;

/** The model this file calls, where a test can stand in for it. */
export const calls = { makePhoto, makesPhotos };

export const SUBJECT_OPTIONS = Object.fromEntries(Object.entries(SUBJECTS).map(([name, subject]) => [name, subject.criteria]));

/** Below this, the plan's reading of the subject was a guess, and the words are read instead. */
const SURE = 0.75;

export interface Wanted {
  subject: SubjectName;
  /** How sure the subject is. It was chosen from the description of the screen, before there were words: "Order #4821" does not say the order is headphones. */
  p?: number;
  /** The words on the screen for the thing pictured: an item's title and secondary line, or the screen's description. */
  of: string;
  ratio: Brief["ratio"];
  size: [number, number];
}

/** Pictures for one screen. No photograph is shown twice on it. */
export class Pictures {
  private readonly used = new Set<string>();

  /** Set once the design is known: its pictures are drawn, so photographs are passed over and whatever is made is an illustration. */
  drawn = false;

  /** What the design's pictures are called, in the trace and in what Jev is asked. Jev reads questions literally: offered "photographs" of a fairy tale, it has reason to say none. */
  private get medium() {
    return this.drawn ? "illustration" : "photograph";
  }

  constructor(
    private readonly run: Run,
    private readonly screen: string,
    /** The description the session began with; the same for every screen of the app. */
    private readonly app: string,
  ) {}

  /**
   * Calls `show` with a picture, if the chain ends in one. `chain` is where the file says a picture comes from
   * (`from library by item_subject else painted else placeholder`); the order is its.
   */
  async find(wanted: Wanted, show: (url: string) => void, chain: Source): Promise<void> {
    wanted = await this.settle(wanted);
    const filled = await fill<string | null>(chain, { library: () => this.library(wanted), painted: () => this.painted(wanted), placeholder: async () => null }, idiom().graph.sources);
    if (filled?.value) show(filled.value);
  }

  /** A subject read off the description, before there were words, may have been a guess. If it was, the words are read instead. */
  async settle(wanted: Wanted): Promise<Wanted> {
    return (wanted.p ?? 1) < SURE ? { ...wanted, subject: await this.subject(wanted) } : wanted;
  }

  /** The places a picture can come from, each by the name a graph file calls it (grammar/kit.md, Sources); each comes back empty when it has none. */
  async library(wanted: Wanted): Promise<string | undefined> {
    const found = await this.choose(wanted);
    return found && photoUrl(found, ...wanted.size);
  }

  async painted(wanted: Wanted): Promise<string | undefined> {
    if (!calls.makesPhotos()) return undefined;
    const start = performance.now();
    try {
      const made = await calls.makePhoto({ subject: wanted.subject, of: wanted.of, screen: this.screen, ratio: wanted.ratio, drawn: this.drawn, app: this.app });
      this.used.add(made.id);
      this.run.trace({ stage: `Gemini: ${this.drawn ? "illustrate" : "photograph"} "${wanted.of.slice(0, 40)}"`, ms: performance.now() - start, detail: `nothing in the library suited; ${this.drawn ? "drawn" : "shot"} as ${wanted.subject}` });
      return photoUrl(made, ...wanted.size);
    } catch (error) {
      // A picture is never worth failing a mock for; the painted frame stays.
      this.run.trace({ stage: `No ${this.medium} of "${wanted.of.slice(0, 40)}"`, ms: performance.now() - start, detail: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  private async subject({ subject, of, p }: Wanted): Promise<SubjectName> {
    const asked = await this.run.askJev(`Jev: what "${of.slice(0, 40)}" is`, { screen: this.screen, pictured: of }, { subject: choice(`An app shows ${this.drawn ? "an illustration" : "a photograph"} of \`pictured\`. What is it a picture of?`, SUBJECT_OPTIONS) });
    const read = asked.answers.subject.choice as SubjectName;
    this.run.trace({
      stage: asked.stage,
      ms: asked.ms,
      decisions: [{ id: "subject", question: `the ${this.medium} is of…`, answer: read, p: asked.answers.subject.probabilities[read], ...(read !== subject ? { note: `the plan guessed "${subject}" at ${p!.toFixed(2)}, before there were words` } : {}) }],
      tokens: { input: asked.inputTokens, output: 0 },
    });
    return read;
  }

  private async choose({ subject, of }: Wanted): Promise<Photo | undefined> {
    const offered = shortlist(subject, of, OFFERED, this.used, this.drawn);
    if (!offered.length) return undefined;
    const options = { ...Object.fromEntries(offered.map((photo, i) => [`photo_${i}`, photo.alt])), none: `None of these ${this.medium}s shows that, or anything a person would take for it.` };
    const asked = await this.run.askJev(`Jev: ${this.drawn ? "an illustration" : "a photograph"} for "${of.slice(0, 40)}"`, { screen: this.screen, pictured: of }, { photo: choice(`An app shows ${this.drawn ? "an illustration" : "a photograph"} of \`pictured\`. Which of these ${this.medium}s could it be?`, options) });
    // Jev's ranking, walked to the first photograph nobody else on the screen took while it was thinking.
    const [pick, p] = ranked(asked.answers.photo).find(([name]) => name === "none" || !this.used.has(offered[Number(name.split("_")[1])].id))!;
    const photo = pick === "none" ? undefined : offered[Number(pick.split("_")[1])];
    if (photo) this.used.add(photo.id);
    this.run.trace({
      stage: asked.stage,
      ms: asked.ms,
      decisions: [{ id: "photo", question: `of ${offered.length} on the ${subject} shelf`, answer: photo ? photo.alt : "none of them", p }],
      tokens: { input: asked.inputTokens, output: 0 },
    });
    return photo;
  }
}

/** The words for an item's picture: what it is called and its secondary line, which is usually what kind of thing it is. */
export const itemWords = (item: any) => [item?.title, item?.subtitle].filter((s) => typeof s === "string" && s.trim()).join(" · ");
