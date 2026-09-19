// Stocks the library from the Unsplash Lite dataset (unsplash.com/data): 25,000
// photographs with keywords scored by confidence. Each subject that has keywords
// gets a shelf of the photographs that match them most surely, best-loved first.
//
//   npm run photos:build -- /path/to/unsplash-lite
//
// The result is checked in, so nobody needs the dataset to run the app.

import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { SUBJECTS, type Subject } from "./subjects.js";
import type { Photo } from "./library.js";

type Stocked = Photo & { src: string };

const PER_SHELF = 40;
const SURE = 80;
const WORDS = 14;

async function* rows(path: string): AsyncGenerator<Record<string, string>> {
  let header: string[] | undefined;
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    const cells = line.split("\t");
    if (!header) header = cells;
    else yield Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""]));
  }
}

const dir = process.argv[2];
if (!dir) throw new Error("usage: npm run photos:build -- /path/to/unsplash-lite");

/** photo → keyword → confidence, 0 to 100. A keyword a person added counts as sure; the dataset's AI scores speak for themselves. */
const keywords = new Map<string, Map<string, number>>();
for await (const row of rows(`${dir}/keywords.tsv000`)) {
  const confidence = Math.max(Number(row.ai_service_1_confidence) || 0, (Number(row.ai_service_2_confidence) || 0) * 100, row.suggested_by_user === "t" ? 85 : 0);
  if (confidence < 50) continue;
  let of = keywords.get(row.photo_id);
  if (!of) keywords.set(row.photo_id, (of = new Map()));
  of.set(row.keyword.toLowerCase(), Math.max(of.get(row.keyword.toLowerCase()) ?? 0, confidence));
}

interface Candidate extends Stocked {
  loved: number;
}
const shelves = new Map<string, Array<{ photo: Candidate; word: string; sure: number }>>();
for await (const row of rows(`${dir}/photos.tsv000`)) {
  const of = keywords.get(row.photo_id);
  const alt = (row.ai_description || row.photo_description).trim();
  const ratio = Number(row.photo_aspect_ratio);
  // A tall photograph loses its subject when it is cropped to a card.
  if (!of || !alt || alt.length > 120 || !(ratio >= 0.75) || !row.photo_image_url.startsWith("https://images.unsplash.com/")) continue;
  const photo: Candidate = {
    id: row.photo_id,
    src: row.photo_image_url.replace("https://images.unsplash.com/", ""),
    alt,
    words: [...of].sort((a, b) => b[1] - a[1]).slice(0, WORDS).map(([word]) => word),
    subjects: [],
    loved: Math.log10(1 + Number(row.stats_downloads)) + (row.photo_featured === "t" ? 0.5 : 0),
  };
  for (const [name, subject] of Object.entries(SUBJECTS) as Array<[string, Subject]>) {
    if (!subject.keywords || subject.not?.some((word) => (of.get(word) ?? 0) >= 60)) continue;
    // Shelved under the keyword it matches most surely, so that a shelf can take a few of each.
    const [word, sure] = subject.keywords.map((word) => [word, of.get(word) ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
    if (sure >= SURE) shelves.set(name, [...(shelves.get(name) ?? []), { photo, word, sure }]);
  }
}

const kept = new Map<string, Candidate>();
for (const name of Object.keys(SUBJECTS)) {
  // Best first within each keyword, then a round of every keyword in turn: forty waterfalls are not a shelf of fresh water.
  const byWord = new Map<string, Candidate[]>();
  for (const { photo, word } of (shelves.get(name) ?? []).sort((a, b) => b.sure / 10 + b.photo.loved - (a.sure / 10 + a.photo.loved))) byWord.set(word, [...(byWord.get(word) ?? []), photo]);
  const shelf: Candidate[] = [];
  while (shelf.length < PER_SHELF && [...byWord.values()].some((of) => of.length)) for (const of of byWord.values()) if (of.length && shelf.length < PER_SHELF) shelf.push(of.shift()!);
  for (const photo of shelf) {
    photo.subjects.push(name);
    kept.set(photo.id, photo);
  }
  console.log(`${name.padEnd(12)} ${String(shelf.length).padStart(3)} of ${(shelves.get(name) ?? []).length}`);
}
const photos = [...kept.values()].map(({ loved, ...photo }) => photo);
writeFileSync(new URL("./library.json", import.meta.url), `[\n${photos.map((photo) => JSON.stringify(photo)).join(",\n")}\n]\n`);
console.log(`${photos.length} photographs`);
