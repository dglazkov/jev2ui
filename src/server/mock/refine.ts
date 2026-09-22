// The one decision about written words that grammar/screen.md does not say yet: which
// control a form's field gets. Everything else Jev decides once the words exist is
// in the file, under the part it is about, and asked by src/server/grammar/decide.ts.
// This one is older than the kit (design.ts): it asks about one field at a time and
// walks Jev's ranking to the first control the content can back.

import { fieldQuestions, readField } from "../design.js";
import type { FieldContent, Widget } from "../emit.js";
import type { Run } from "../run.js";
import type { Decoration } from "../grammar/decide.js";
import type { Decision } from "../../shared/events.js";
import type { Questions } from "@typesafe-ai/sdk";

async function ask(run: Run, stage: string, state: unknown, questions: Questions, read: (answers: Record<string, any>) => Decision[]) {
  const asked = await run.askJev(stage, state, questions);
  run.trace({ stage: asked.stage, ms: asked.ms, decisions: read(asked.answers), tokens: { input: asked.inputTokens, output: 0 } });
}

const KINDS: Record<Widget, string> = {
  shortText: "text",
  longText: "long",
  number: "number",
  obscured: "password",
  date: "date",
  time: "time",
  dateTime: "dateTime",
  checkbox: "checkbox",
  singleChoice: "select",
  multiChoice: "multi",
  slider: "slider",
};

/** The same field questions as the A2UI pipelines, mapped onto the kit's field kinds. */
export async function refineField(run: Run, screen: string, i: number, field: FieldContent): Promise<Decoration[]> {
  const out: Decoration[] = [];
  await ask(run, `Jev: design field "${field.label}"`, { user_request: screen, form_field: field }, fieldQuestions(), (a) => {
    const read = readField(a, field);
    // Material: chips or radio buttons while every option fits in view; a menu beyond that.
    const kind = read.design.widget === "singleChoice" && (field.options?.length ?? 0) <= 4 ? "chips" : KINDS[read.design.widget];
    out.push({ at: ["fields", i], values: { kind } });
    return read.decisions.filter((d) => d.id === "widget" || d.id === "control");
  });
  return out;
}
