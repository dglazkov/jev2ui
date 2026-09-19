// The comparison point: Gemini writes the A2UI messages directly, one shot,
// no repair loop. Whatever it produces is validated and forwarded as-is.

import { streamGeminiJson } from "./models.js";
import { ICON_NAMES } from "./plan.js";
import { A2UI_VERSION, CATALOG_ID, Run, SURFACE_ID } from "./run.js";
import type { PipelineEvent } from "../shared/events.js";

const SYSTEM_PROMPT = `You generate user interfaces as A2UI ${A2UI_VERSION} messages.
Respond with a JSON array of messages and nothing else.

Message shapes (always use surfaceId "${SURFACE_ID}" and version "${A2UI_VERSION}"):
  {"version":"${A2UI_VERSION}","createSurface":{"surfaceId":"${SURFACE_ID}","catalogId":"${CATALOG_ID}"}}
  {"version":"${A2UI_VERSION}","updateComponents":{"surfaceId":"${SURFACE_ID}","components":[...]}}
  {"version":"${A2UI_VERSION}","updateDataModel":{"surfaceId":"${SURFACE_ID}","path":"/","value":{...}}}

Components are a FLAT list; each is {"id": "...", "component": "<Type>", ...props}. Exactly one has id "root".
Children are referenced by id, never inlined. Unknown properties are rejected.
A dynamic value is either a literal or a data binding {"path":"/json/pointer"}.
Containers take "children": ["id", ...] or a template {"path":"/list","componentId":"template_id"};
inside a template, relative paths like {"path":"title"} resolve against the current item.
Optional on any child of a Row/Column: "weight": number.

Catalog:
  Text        text (dynamic string, simple markdown), variant: h1|h2|h3|h4|h5|caption|body
  Image       url, description?, fit: contain|cover|fill|none|scaleDown, variant: icon|avatar|smallFeature|mediumFeature|largeFeature|header
  Icon        name: one of ${ICON_NAMES.join("|")}
  Row         children, justify: start|center|end|spaceBetween|spaceAround|spaceEvenly|stretch, align: start|center|end|stretch
  Column      children, justify (same as Row), align: start|center|end|stretch
  List        children, direction: vertical|horizontal, listStyle: ordered|unordered|none
  Card        child (single id)
  Tabs        tabs: [{"title": string, "child": id}]
  Divider     axis: horizontal|vertical
  Modal       trigger (id), content (id)
  Button      child (id of a Text), variant: default|primary|borderless, action: {"event":{"name":"...","context":{key: dynamic value}}}
  TextField   label, value ({"path":...}), variant: shortText|longText|number|obscured, checks?
  CheckBox    label, value (path to boolean)
  ChoicePicker label?, options: [{"label": string, "value": string}], value (path to string array), variant: mutuallyExclusive|multipleSelection, displayStyle: checkbox|chips
  Slider      label?, min, max (required), value (path to number)
  DateTimeInput label?, value (path to ISO string), enableDate: boolean, enableTime: boolean
  checks: [{"condition":{"call":"required"|"email","args":{"value":{"path":...}},"returnType":"boolean"},"message":"..."}]

Put display content in the data model and bind to it where practical. Initialise every bound input value.
For pictures use https://picsum.photos/seed/<word>/<width>/<height>.
Make the UI complete, realistic and well organised.`;

export function runBaseline(prompt: string): AsyncGenerator<PipelineEvent> {
  const run = new Run("baseline");
  return run.drive(async () => {
    // Forward each message as soon as the next one starts, so the baseline
    // gets the same streaming advantage the hybrid pipeline has.
    let sent = 0;
    const flush = (messages: unknown, complete: boolean) => {
      if (!Array.isArray(messages)) return;
      const ready = complete ? messages.length : messages.length - 1;
      for (; sent < ready; sent++) run.send(messages[sent]);
    };
    const generated = await streamGeminiJson({ system: SYSTEM_PROMPT, prompt }, (partial) => flush(partial, false));
    run.stats.geminiInputTokens += generated.inputTokens;
    run.stats.geminiOutputTokens += generated.outputTokens;
    const parsed = JSON.parse(generated.text);
    flush(Array.isArray(parsed) ? parsed : (parsed.messages ?? [parsed]), true);
    run.trace({
      stage: "Gemini: write A2UI directly",
      ms: generated.ms,
      tokens: { input: generated.inputTokens, output: generated.outputTokens },
    });
  });
}
