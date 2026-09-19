// A form that grows while its content streams: each field is designed by Jev
// the moment it is complete in the stream, and attached as soon as the fields
// before it are, so no field waits for the rest of the form.

import { fieldQuestions, readField } from "./design.js";
import { fieldComponent, formContainer, initialFieldValue, valuePath, type FieldContent, type FieldDesign } from "./emit.js";
import type { ContentStreams } from "./content.js";
import type { Run } from "./run.js";

/**
 * Returns the `onValue` hook for the part that holds `{ fields: [...] }`.
 * A mock is looked at, not filled in: with `checks` off, no field starts out flagged as invalid.
 */
export function growForm(run: Run, streams: ContentStreams, surfaceId: string, prompt: string, checks = true) {
  const fields: FieldContent[] = [];
  const designs: FieldDesign[] = [];
  let started = 0;
  let attached = 0;

  const attachReady = () => {
    const components = [];
    while (designs[attached]) {
      const i = attached++;
      run.send({ updateDataModel: { surfaceId, path: valuePath(i), value: initialFieldValue(fields[i], designs[i]) } });
      components.push(fieldComponent(i, fields[i], designs[i]));
    }
    if (components.length) {
      run.send({ updateComponents: { surfaceId, components: [...components, formContainer(attached)] } });
    }
  };

  const design = async (i: number) => {
    const asked = await run.askJev(`Jev: design field "${fields[i].label}"`, { user_request: prompt, form_field: fields[i] }, fieldQuestions());
    const read = readField(asked.answers, fields[i]);
    designs[i] = checks ? read.design : { ...read.design, required: false, email: false };
    run.trace({ stage: asked.stage, ms: asked.ms, decisions: read.decisions, tokens: { input: asked.inputTokens, output: 0 } });
    attachReady();
  };

  return (form: any, complete: boolean) => {
    const streamed: FieldContent[] = Array.isArray(form?.fields) ? form.fields : [];
    // The last field in a partial stream may still be growing.
    const ready = complete ? streamed.length : streamed.length - 1;
    for (; started < ready; started++) {
      fields[started] = streamed[started];
      streams.spawn(design(started));
    }
  };
}
