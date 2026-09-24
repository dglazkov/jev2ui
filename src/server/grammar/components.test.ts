import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { childRefs, id, str, children, type ComponentSet } from "../../shared/components.js";
import { KIT_CATALOG_ID } from "../../shared/kit.js";
import { registerSet, setOf } from "../../shared/sets.js";
import { validateMessages } from "../validate.js";
import { answersTo, random } from "./fixtures.js";
import { checkGrammar, parseGrammar } from "./format.js";
import { checkBindings, frameOf, partsOf, treeOf, type Catalog } from "./make.js";
import { bind, catalogOf, slots } from "./patterns.js";
import { JEV, questionsOf, readGrammar } from "./read.js";

// A catalog that shares no component with the kit, a grammar drawn by it, and nothing else: whatever the tool needs of a
// set of components, it must get from the set, and not from the kit's names.

const STUB_ID = "https://example.com/catalogs/stub/v1";
const STUB = {
  Window: z.object({ title: str, content: id }).strict(),
  Column: z.object({ children }).strict(),
  Line: z.object({ text: str }).strict(),
};
const STUB_SET: ComponentSet = { schemas: STUB, refs: (c) => [...childRefs(c), c.content].filter((r): r is string => typeof r === "string") };

const STUB_PATTERNS: Catalog = {
  window: {
    name: "window",
    card: "A window with a title and what is in it.",
    slots: slots("- `title` required — what the window is called"),
    knobs: {},
    draw: (id, b, _knobs, _look, parts = []) => [
      { id, component: "Window", title: bind(b.one("title")), content: "window_content" },
      { id: "window_content", component: "Column", children: parts.map((part) => part.root) },
    ],
  },
  lines: {
    name: "lines",
    card: "Lines of text, one under another.",
    slots: slots("- `lines` required\n  - `text` required — the words of one line"),
    knobs: {},
    draw: (id, b) => {
      const lines = b.each("lines")!;
      return [
        { id, component: "Column", children: { path: lines.path, componentId: `${id}_line` } },
        { id: `${id}_line`, component: "Line", text: bind(lines.bound.one("text")) },
      ];
    },
  },
};

const GRAMMAR = `# note

> \`note\` describes one note in a notebook app. Work out what that note is made of.

A grammar no idiom has, drawn by a catalog that shares no component with the kit.

## header

- \`title\` as title — What the note is called.

## kind → window

> What kind of note is this?

- **checklist** — Things to do, one to a line.
  \`LINES\`
- **jotting** — A few lines of text.
  \`LINES\`

### lines → lines

> Does the note have lines of its own?

+ It has lines.
- It is empty.

- \`lines\` 2–5, as lines — The lines.
  - \`text\` as text — The words of one line.

## Examples

- Groceries for the week → kind is checklist
`;

const surface = (catalogId: string, components: unknown[]) => [
  { version: "v0.9", createSurface: { surfaceId: "main", catalogId } },
  { version: "v0.9", updateComponents: { surfaceId: "main", components } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/header", value: { title: "Groceries" } } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/lines", value: [{ text: "Eggs" }, { text: "Milk" }] } },
];

test("a catalog whose components share nothing with the kit's draws a grammar, and its screens are checked against its own set", () => {
  registerSet(STUB_ID, STUB_SET);
  assert.equal(setOf(STUB_ID), STUB_SET);
  const grammar = parseGrammar(GRAMMAR);
  assert.deepEqual(checkGrammar(grammar).errors, []);
  assert.deepEqual(checkBindings(grammar, catalogOf("stub", "A catalog of three components.", STUB_PATTERNS)).errors, []);

  const rng = random(3);
  const look = { contained: true, icons: true, symbol: "image" };
  for (let i = 0; i < 20; i++) {
    const reading = readGrammar(grammar, answersTo(questionsOf(grammar), rng), JEV);
    const parts = partsOf(grammar, reading).map((node) => ({ name: node.name, tree: treeOf(STUB_PATTERNS, grammar, node, reading, look) }));
    const frame = frameOf(STUB_PATTERNS, grammar, reading, look, parts.map(({ name, tree }) => ({ name, root: tree[0].id })));
    assert.ok(frame);
    const components = [...frame, ...parts.flatMap(({ tree }) => tree)];
    assert.deepEqual(new Set(components.map((c) => c.component)), new Set(["Window", "Column", "Line"]));

    // Under its own catalog id, it is what it says it is.
    assert.deepEqual(validateMessages(surface(STUB_ID, components) as never), []);
    // Under the kit's, none of it is the kit's.
    assert.ok(validateMessages(surface(KIT_CATALOG_ID, components) as never).some((error) => error.includes('unknown component "Window"')));
  }
  // And the kit's components are not the stub's.
  assert.ok(validateMessages(surface(STUB_ID, [{ id: "root", component: "Screen", body: "x" }]) as never).some((error) => error.includes('unknown component "Screen"')));
});
