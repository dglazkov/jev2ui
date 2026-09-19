// When nothing in the library suits, the picture is made. The brief is put
// together from parts that already exist: Gemini's words for the thing, the
// developer's description of the screen for its setting, and the art direction
// of the subject Jev chose (subjects.ts). Nobody writes a prompt.
//
// Pictures are made in natural colour whatever the design, because how
// photographs look is paint (theme.ts): a remix changes the treatment and
// keeps the picture. What is made is kept in .cache/photos and joins the
// library, so the shelves Unsplash could not stock fill up with use.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { SUBJECTS, type SubjectName } from "./subjects.js";
import { tokens, type Photo } from "./library.js";

export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-lite-image";
/** MAKE_PHOTOS=0 keeps to the library: no image requests, and a picture nothing suits stays a painted frame. */
export const makesPhotos = () => process.env.MAKE_PHOTOS !== "0";
/** PHOTOS_DIR says where made photographs are kept when the working directory does not last: deployed, a mounted bucket. */
const DIR = process.env.PHOTOS_DIR ?? join(process.cwd(), ".cache", "photos");
const AT_ONCE = 4;

let made: Photo[] | undefined;
export function madePhotos(): Photo[] {
  if (made) return made;
  made = [];
  if (existsSync(DIR)) for (const file of readdirSync(DIR)) if (file.endsWith(".json")) made.push(JSON.parse(readFileSync(join(DIR, file), "utf8")));
  return made;
}

/** The bytes of a made photograph, for the route that serves them. */
export function readMade(id: string): { bytes: Buffer; mime: string } | undefined {
  if (!/^[a-f0-9]{16}$/.test(id)) return undefined;
  const file = ["png", "jpg", "webp"].map((ext) => join(DIR, `${id}.${ext}`)).find(existsSync);
  return file ? { bytes: readFileSync(file), mime: `image/${file.endsWith("jpg") ? "jpeg" : file.split(".").pop()}` } : undefined;
}

export interface Brief {
  subject: SubjectName;
  /** What the picture is of, in the words already on the screen: "Margherita · Wood-fired, San Marzano". Becomes its caption. */
  of: string;
  /** The developer's description of the screen, so that the picture belongs to the app. */
  screen: string;
  ratio: "16:9" | "4:3" | "1:1";
  /** An illustration, for a design whose pictures are drawn. */
  drawn?: boolean;
  /** The app the screen belongs to. An illustrator's hand is chosen for the app, so that every screen of it is drawn by the same one. */
  app?: string;
}

let gemini: GoogleGenAI | undefined;
let running = 0;
const waiting: Array<() => void> = [];
const making = new Map<string, Promise<Photo>>();

export function makePhoto(brief: Brief): Promise<Photo> {
  const id = createHash("sha256").update(`${IMAGE_MODEL}|${brief.subject}|${brief.of.toLowerCase()}|${brief.ratio}${brief.drawn ? "|drawn" : ""}`).digest("hex").slice(0, 16);
  const kept = madePhotos().find((photo) => photo.id === id);
  if (kept) return Promise.resolve(kept);
  let work = making.get(id);
  if (!work) {
    work = make(id, brief).finally(() => making.delete(id));
    making.set(id, work);
  }
  return work;
}

async function make(id: string, brief: Brief): Promise<Photo> {
  if (running >= AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set (expected in .env)");
    gemini ??= new GoogleGenAI({ apiKey });
    // The description is of a screen, and a model shown one draws a phone. It is there for the setting and nothing else.
    // The style is a rule over the app's description and not a free choice, so that eight pictures in a list, and every screen after it, look like one illustrator's work.
    const drawn = [
      `An illustration of: ${brief.of}`,
      `It is for this app: "${brief.app ?? brief.screen}". Draw it in the one style this rule gives for that app. For young children, stories or learning: a hand-painted picture-book illustration in gouache and coloured pencil, with soft rounded shapes, gentle texture and warm light. For games, fantasy or science fiction: painterly concept art with dramatic light. For anything else: a clean editorial illustration with flat shapes and a limited palette. Never a photograph, 3D render or clip art.`,
      `How such a thing is usually framed, for composition only: ${SUBJECTS[brief.subject].shot}`,
      `For the setting and the mood only: it illustrates that in an app a developer described as "${brief.screen}". Draw the thing itself. Never show a phone, a screen, an app or a book cover.`,
      "The picture fills the frame edge to edge. No text, lettering, titles, logos, watermarks, borders or user interface anywhere in the image.",
    ];
    const shot = [
      `A photograph of: ${brief.of}`,
      SUBJECTS[brief.subject].shot,
      `For the setting only: it illustrates that in an app a developer described as "${brief.screen}". Photograph the thing itself. Never show a phone, a screen, an app or a website.`,
      "Realistic and in natural colour. No text, lettering, logos, watermarks, borders or user interface anywhere in the image.",
    ];
    const prompt = (brief.drawn ? drawn : shot).join("\n");
    const response = await gemini.models.generateContent({ model: IMAGE_MODEL, contents: prompt, config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: brief.ratio } } });
    const image = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!image?.data) throw new Error(`${IMAGE_MODEL} returned no image for "${brief.of}"`);
    const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
    const photo: Photo = { id, alt: brief.of, words: tokens(brief.of), subjects: [brief.subject], ...(brief.drawn ? { drawn: true } : {}) };
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${id}.${ext}`), Buffer.from(image.data, "base64"));
    writeFileSync(join(DIR, `${id}.json`), JSON.stringify(photo));
    madePhotos().push(photo);
    return photo;
  } finally {
    running--;
    waiting.shift()?.();
  }
}
