// The photographs a mock can show. Some come from Unsplash (build.ts stocks
// the shelves that dataset is good at); the rest were made by the image model
// (generate.ts) for a screen that needed one, and shelved here for the next.
// Each has a caption, a few words, and the subjects (subjects.ts) it is
// shelved under.
//
// Looking something up is plain word matching, and it only has to be good
// enough to put the right photograph among a handful: Jev makes the choice.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { madePhotos } from "./generate.js";
import { SUBJECTS, type Subject } from "./subjects.js";

export interface Photo {
  id: string;
  /** Path on images.unsplash.com, which crops and resizes to order. A made photograph has none and is served from the cache. */
  src?: string;
  /** One line saying what the photograph shows. It is what Jev reads when it chooses between photographs. */
  alt: string;
  words: string[];
  subjects: string[];
}

let stock: Photo[] | undefined;
export const library = (): Photo[] => [...(stock ??= JSON.parse(readFileSync(new URL("./library.json", import.meta.url), "utf8")) as Photo[]), ...madePhotos()];

export const photoUrl = (photo: Photo, w: number, h: number) =>
  photo.src ? `https://images.unsplash.com/${photo.src}?w=${w}&h=${h}&fit=crop&crop=entropy&auto=format&q=70` : `/api/photo/${photo.id}`;

/** The same photograph at another size: a thumbnail that was tapped becomes the lead picture of the page it opens. */
export const resized = (url: string, w: number, h: number) => (url.startsWith("https://images.unsplash.com/") ? url.replace(/\bw=\d+&h=\d+/, `w=${w}&h=${h}`) : url);

const STOP = new Set("a an and the of in on at to for with by from is are this that its it as or one page item screen app list new best top all your our".split(" "));
/** Lower case, no punctuation, no plurals: crude, but the same on both sides of the match. */
export const tokens = (text: string): string[] => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^a-zà-ÿ]+/)
      .filter((word) => word.length > 2 && !STOP.has(word))
      .map((word) => word.replace(/(?<=[a-z]{3})(es|s)$/, "")),
  ),
];

const SHELF = 3;

/**
 * The photographs most likely to suit `text`, best first: those on the subject's shelf, and any from elsewhere whose
 * caption shares a word with it. A rare word counts for more than a common one. Ties fall differently for different
 * text, so that eight items with nothing to tell them apart are not all offered the same five photographs.
 */
export function shortlist(subject: string, text: string, count: number, without: ReadonlySet<string> = new Set()): Photo[] {
  const photos = library();
  const seen = new Map<string, number>();
  const wordsOf = new Map<Photo, Set<string>>();
  for (const photo of photos) {
    const words = new Set([...tokens(photo.alt), ...photo.words.flatMap(tokens)]);
    wordsOf.set(photo, words);
    for (const word of words) seen.set(word, (seen.get(word) ?? 0) + 1);
  }
  const wanted = tokens(text);
  const tiebreak = (photo: Photo) => createHash("md5").update(`${text}|${photo.id}`).digest().readUInt32BE(0) / 2 ** 32;
  return photos
    .filter((photo) => !without.has(photo.id) && (!(SUBJECTS as Record<string, Subject>)[subject]?.own || photo.subjects.includes(subject)))
    .map((photo) => {
      const shared = wanted.filter((word) => wordsOf.get(photo)!.has(word));
      const score = shared.reduce((sum, word) => sum + Math.log(photos.length / seen.get(word)!), 0) + (photo.subjects.includes(subject) ? SHELF : 0);
      return { photo, score: score + tiebreak(photo) * 0.5 };
    })
    .filter(({ score }) => score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ photo }) => photo);
}
