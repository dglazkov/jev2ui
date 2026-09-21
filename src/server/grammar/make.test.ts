import { test } from "node:test";
import assert from "node:assert/strict";
import { KIT, kitRefs, type KitComponent } from "../../shared/kit.js";
import { planQuestions, readPlan, type Block, type ScreenPlan } from "../mock/plan.js";
import { BUILDERS, partSchema, type Part } from "../mock/screen.js";
import { answersTo, random } from "./fixtures.js";
import { idOf, parseGrammar, walk, type Field, type Grammar, type Node } from "./format.js";
import { loadGrammar } from "./load.js";
import { checkBindings, partsOf, schemaOf, treeOf, type Look } from "./make.js";
import { KIT_PATTERNS } from "./patterns.js";
import { JEV, questionsOf, readGrammar, type Reading } from "./read.js";
import { planOf } from "./screen-plan.js";

const screen = loadGrammar("screen.md");
const kit = loadGrammar("kit.md");
const named = (grammar: Grammar, name: string): Node => {
  let found: Node | undefined;
  walk(grammar.nodes, (node) => void (node.name === name && (found = node)));
  return found!;
};

/** A tree without its ids: what is drawn, and not what the pieces happen to be called. */
function nest(components: KitComponent[], root: string): unknown {
  const byId = new Map(components.map((c) => [c.id, c]));
  const go = (id: string): unknown => {
    const { id: _, ...c } = byId.get(id) as Record<string, any>;
    for (const ref of ["child", "leading", "trailing", "below"]) if (typeof c[ref] === "string" && byId.has(c[ref])) c[ref] = go(c[ref]);
    if (Array.isArray(c.children)) c.children = c.children.map(go);
    else if (c.children?.componentId) c.children = { ...c.children, componentId: go(c.children.componentId) };
    return c;
  };
  return go(root);
}

/** Readings of screens nobody asked for, with the plan the tool makes of the same answers, under a look the design might have. */
function* cases(count: number, grammar = screen): Generator<{ reading: Reading; plan: ScreenPlan; look: Look }> {
  const rng = random(42);
  for (let i = 0; i < count; i++) {
    const answers = answersTo(planQuestions(), rng);
    const reading = readGrammar(grammar, answers, JEV);
    const plan = { ...readPlan(answers).plan, contained: rng() < 0.5, icons: rng() < 0.5 };
    yield { reading, plan, look: { contained: plan.contained, icons: plan.icons, symbol: plan.symbol } };
  }
}

test("what a part is made of, in the file, is the schema partSchema asks a writer to fill: every part of 2000 screens", () => {
  for (const { reading, plan } of cases(2000)) {
    assert.deepEqual(planOf(screen, reading), { ...plan, contained: true, icons: true });
    for (const part of ["header", "nav", ...plan.blocks] as Array<Part | "hero" | "custom">) {
      const made = schemaOf(named(screen, part), reading);
      if (part === "hero" || part === "custom") assert.equal(made, null, `${part} is not written`);
      else assert.deepEqual(made, partSchema(part, plan), `${part} of a ${plan.archetype}`);
    }
  }
});

test("and it is the tree BUILDERS makes, drawn by a pattern that never saw a plan: every part of 2000 screens", () => {
  const seen = new Set<string>();
  for (const { reading, plan, look } of cases(2000)) {
    for (const node of partsOf(screen, reading)) {
      const block = node.name as Block;
      assert.deepEqual(nest(treeOf(KIT_PATTERNS, screen, node, reading, look), block), nest(BUILDERS[block](plan), block), `${block} of a ${plan.archetype}: ${JSON.stringify(plan.list)}`);
      seen.add(block === "list" ? `list ${plan.list.layout} ${plan.list.leading} ${plan.list.trailing}` : block);
    }
  }
  // Every part was drawn, and the list in every layout.
  for (const block of Object.keys(BUILDERS)) assert.ok([...seen].some((s) => s === block || s.startsWith(`${block} `)), block);
  for (const layout of ["rows", "cards", "grid", "reel"]) assert.ok([...seen].some((s) => s.startsWith(`list ${layout}`)), layout);
});

test("nothing a field says is for show: without any one `when`, `as` or source, some schema or some tree comes out differently", () => {
  const sample = [...cases(400)];
  const all = (grammar: Grammar) =>
    JSON.stringify(sample.map(({ reading, look }) => partsOf(grammar, reading).map((node) => [schemaOf(node, reading), nest(treeOf(KIT_PATTERNS, grammar, node, reading, look), node.name)])));
  const whole = all(screen);
  let tried = 0;
  // The header and the navigation belong to the frame, which is not drawn from the file yet; only the parts are tried.
  const fieldsOf = (grammar: Grammar) => {
    const out: Field[] = [];
    const into = (fields: Field[]) => fields.forEach((field) => (out.push(field), into(field.fields)));
    walk(grammar.nodes, (node) => void (node.block && into(node.fields)));
    return out;
  };
  fieldsOf(screen).forEach((field, n) => {
    for (const said of ["when", "role", "source"] as const) {
      if (field[said] === undefined) continue;
      const changed: Grammar = structuredClone(screen);
      delete fieldsOf(changed)[n][said];
      tried++;
      // A pattern that is missing a slot it cannot do without says so, which is as different as it gets.
      let after: string;
      try {
        after = all(changed);
      } catch (error) {
        assert.match((error as Error).message, /cannot be drawn without/);
        continue;
      }
      assert.notEqual(after, whole, `"${field.name}" without its ${said}`);
    }
  });
  assert.ok(tried > 60, `${tried} things were taken out`);
});

test("what is drawn from a file is a tree the kit accepts, whatever was answered: screen.md and a graph nobody wrote code for", () => {
  for (const file of ["screen.md", "examples/email.md"]) {
    const grammar = loadGrammar(file);
    const questions = questionsOf(grammar);
    const rng = random(7);
    for (let i = 0; i < 500; i++) {
      const reading = readGrammar(grammar, answersTo(questions, rng), JEV);
      const components = partsOf(grammar, reading).flatMap((node) => treeOf(KIT_PATTERNS, grammar, node, reading, { contained: rng() < 0.5, icons: rng() < 0.5, symbol: "image" }));
      const ids = new Set(components.map((c) => c.id));
      assert.equal(ids.size, components.length, `${file}: two components with one id`);
      for (const { id, component, ...props } of components) {
        const parsed = KIT[component].safeParse(props);
        assert.ok(parsed.success, `${file}: ${id} (${component}) ${parsed.success ? "" : JSON.stringify(parsed.error.issues[0])}`);
        for (const ref of kitRefs({ component, ...props })) assert.ok(ids.has(ref), `${file}: ${id} points at "${ref}", which is not there`);
      }
    }
  }
});

test("a list inside a part may have the part's own name, and is still inside it", () => {
  const email = loadGrammar("examples/email.md");
  const answers = answersTo(questionsOf(email), random(1));
  Object.assign(answers, { kind: { choice: "receipt", probabilities: { receipt: 1 } }, has_items: { noul: 0.9 } });
  const reading = readGrammar(email, answers, JEV);
  const tree = treeOf(KIT_PATTERNS, email, named(email, "items"), reading, { contained: true, icons: true, symbol: "image" });
  assert.equal((tree.find((c) => c.id === "items_items") as any).children.path, "/items/items");
  assert.deepEqual(Object.keys((schemaOf(named(email, "items"), reading) as any).properties.items.properties), ["heading", "items"]);
  // Whereas a part that is nothing but its list is that list.
  assert.equal((treeOf(KIT_PATTERNS, email, named(email, "facts"), reading, { contained: true, icons: true, symbol: "image" })[1] as any).children.path, "/facts");
});

test("a graph can be checked against a catalog by someone who has only the two files", () => {
  assert.deepEqual(checkBindings(screen, kit), { errors: [], warnings: [] });
  assert.deepEqual(checkBindings(loadGrammar("examples/email.md"), kit), { errors: [], warnings: [] });
  const broken = parseGrammar(
    [
      "# thing",
      "## kind",
      "> What is it?",
      "- **a** — An a.",
      "  `LIST gallery chart`",
      "- **b** — A b.",
      "  `list`",
      "### list → collection",
      "> Are there items?",
      "- `items` 1–3, as items",
      "  - `name` as title",
      "#### style → layout",
      "> If there are items, how are they shown?",
      "- **plain** `rows` — Plainly.",
      "- **fancy** `mosaic` — Fancily.",
      "### gallery → carousel",
      "> Is there a gallery?",
      "### chart",
      "> Is there a chart?",
    ].join("\n"),
  );
  assert.deepEqual(checkBindings(broken, kit), {
    errors: [
      '"list.items.name" goes to "title", and "collection" has no such slot there (it has headline, supporting, meta, rating, count, badge, progress, tone, picture, icon, on)',
      '"list" fills no "headline", and "collection" cannot be drawn without one',
      '"style" can yield "mosaic", and the "layout" of "collection" is one of rows, cards, grid, reel',
      '"gallery" is drawn by "carousel", which the catalog does not have',
    ],
    warnings: ['nothing draws "chart": it names no pattern'],
  });
});

test("a field line says everything about a field, and is read back as written", () => {
  const made = (text: string): Field[] => parseGrammar(`## part\n${text}`).nodes[0].fields;
  const [rows] = made("- `rows` 2–8, as rows, optional, when facts_total is yes and no list — Details.\n  - when item_trailing is switch or checkbox — Say which.\n  - each number — A figure.");
  assert.deepEqual(rows, {
    name: "rows",
    list: { min: 2, max: 8 },
    role: "rows",
    optional: true,
    when: [{ id: "facts_total", is: ["yes"], not: false }, { block: "list", present: false }],
    description: "Details.",
    notes: [{ when: [{ id: "item_trailing", is: ["switch", "checkbox"], not: false }], text: "Say which." }],
    element: { type: "number", description: "A figure." },
    fields: [],
  });
  assert.equal(idOf(named(screen, "list")), "has_list");
});
