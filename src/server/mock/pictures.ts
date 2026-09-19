// A picture for one thing on the screen: the lead photograph, or one item of a
// list. Looking through the library is code; choosing is Jev's, and one of the
// choices is always "none of these", because a wrong photograph is worse than
// a painted frame. When Jev says none, the image model makes one, and the
// library has it next time.

import { choice } from "@typesafe-ai/sdk";
import { ranked } from "../models.js";
import { makesPhotos, makePhoto, type Brief } from "../photos/generate.js";
import { photoUrl, shortlist, type Photo } from "../photos/library.js";
import { SUBJECTS, type SubjectName } from "../photos/subjects.js";
import type { Run } from "../run.js";

const OFFERED = 5;

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

  constructor(
    private readonly run: Run,
    private readonly screen: string,
  ) {}

  /** Calls `show` with a photograph from the library if one suits, and with a made one if none did. */
  async find(wanted: Wanted, show: (url: string) => void): Promise<void> {
    if ((wanted.p ?? 1) < SURE) wanted = { ...wanted, subject: await this.subject(wanted) };
    const found = await this.choose(wanted);
    if (found) return show(photoUrl(found, ...wanted.size));
    if (!makesPhotos()) return;
    const start = performance.now();
    try {
      const made = await makePhoto({ subject: wanted.subject, of: wanted.of, screen: this.screen, ratio: wanted.ratio });
      this.used.add(made.id);
      show(photoUrl(made, ...wanted.size));
      this.run.trace({ stage: `Gemini: photograph "${wanted.of.slice(0, 40)}"`, ms: performance.now() - start, detail: `nothing in the library suited; shot as ${wanted.subject}` });
    } catch (error) {
      // A picture is never worth failing a mock for; the painted frame stays.
      this.run.trace({ stage: `No photograph of "${wanted.of.slice(0, 40)}"`, ms: performance.now() - start, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  private async subject({ subject, of, p }: Wanted): Promise<SubjectName> {
    const asked = await this.run.askJev(`Jev: what "${of.slice(0, 40)}" is`, { screen: this.screen, pictured: of }, { subject: choice("An app shows a photograph of `pictured`. What is it a photograph of?", SUBJECT_OPTIONS) });
    const read = asked.answers.subject.choice as SubjectName;
    this.run.trace({
      stage: asked.stage,
      ms: asked.ms,
      decisions: [{ id: "subject", question: "the photograph is of…", answer: read, p: asked.answers.subject.probabilities[read], ...(read !== subject ? { note: `the plan guessed "${subject}" at ${p!.toFixed(2)}, before there were words` } : {}) }],
      tokens: { input: asked.inputTokens, output: 0 },
    });
    return read;
  }

  private async choose({ subject, of }: Wanted): Promise<Photo | undefined> {
    const offered = shortlist(subject, of, OFFERED, this.used);
    if (!offered.length) return undefined;
    const options = { ...Object.fromEntries(offered.map((photo, i) => [`photo_${i}`, photo.alt])), none: "None of these photographs shows that, or anything a person would take for it." };
    const asked = await this.run.askJev(`Jev: a photograph for "${of.slice(0, 40)}"`, { screen: this.screen, pictured: of }, { photo: choice("An app shows a photograph of `pictured`. Which of these photographs could it be?", options) });
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
