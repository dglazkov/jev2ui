// Probe: a graph kept in a file, drawn (docs/grammar.md).
//
// Everything that is specific to what is being made comes from the file: what Jev is
// asked, how the answers are read, what each part is made of, which of the catalog's
// patterns draws it, what each writer is asked for, and where whatever nobody writes
// comes from. The code here knows none of it.
//
//   npm run probe:draw -- grammar/examples/email.md "Your one-time sign-in code"
//   npm run probe:draw -- grammar/examples/email.md "Weekly digest of the five most-read design articles" --paint
//
// Jev reads the description (one request) and mixes a design for it (one more, as the
// tool does); the tree is sent; one Gemini writer per written part fills it; then the
// chains are tried: a part that is `filled from shelf else baked else closed` is baked,
// a picture `from library by … else painted else placeholder` is looked for, and made
// only with --paint, because a made picture costs something and joins the library.
// What comes out is out/grammar/<name>.html, which stands alone, and what was sent beside it.
//
// Once a part is written, Jev is asked whatever the file says is decided then (whether a
// warning is bad news, which button is the main one), and the answers join the words.
//
// What is not here, because the file cannot say it yet: anything `computed`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Component } from "../shared/components.js";
import { IDIOMS as NAMED, idiomNamed } from "../shared/idioms.js";
import { loadDesign } from "../server/design-source.js";
import { streamGeminiJson } from "../server/models.js";
import { CUSTOM_SOURCES, customOf, sendCustom, type Filling } from "../server/mock/bake.js";
import { Graph } from "../server/mock/graph.js";
import { Pictures } from "../server/mock/pictures.js";
import { IDIOMS } from "../server/idioms.js";
import { readMade } from "../server/photos/generate.js";
import type { SubjectName } from "../server/photos/subjects.js";
import { Run } from "../server/run.js";
import { validateMessages } from "../server/validate.js";
import { fill } from "../server/grammar/fill.js";
import { idOf, type Field, type Node } from "../server/grammar/format.js";
import { loadGrammar } from "../server/grammar/load.js";
import { decide, decorate } from "../server/grammar/decide.js";
import { appliesIn, boundIn, checkBindings, contentNodes, framePatternOf, frameOf, knobsOf, partsOf, schemaOf, treeOf } from "../server/grammar/make.js";
import { JEV, givensOf, holdsIn, questionsOf, readGrammar, yieldOf } from "../server/grammar/read.js";

const args = process.argv.slice(2);
const paint = args.includes("--paint");
// Which catalog draws it: an idiom's, by name (shared/idioms.ts); the kit's unless said.
const said = args[args.indexOf("--catalog") + 1];
const [file, text] = args.filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--catalog");
if (!file || !text) throw new Error('usage: npm run probe:draw -- <graph.md> "<what to make>" [--catalog <idiom>] [--paint]');
if (args.includes("--catalog") && idiomNamed(said) !== said) throw new Error(`no idiom is called "${said}"; the idioms are ${Object.keys(NAMED).join(", ")}`);
const idiom = IDIOMS[idiomNamed(said)];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const grammar = loadGrammar(resolve(file));
const { catalog, sources } = idiom.graph;
const { patterns, catalogId } = idiom;
const key = grammar.stateKey ?? grammar.name;
const checked = checkBindings(grammar, catalog);
for (const problem of [...checked.errors, ...checked.warnings]) console.log(`lint: ${problem}`);
if (checked.errors.length) process.exit(1);

const run = new Run("mock");
const surfaceId = "main";
const started = performance.now();
const since = () => `${String(Math.round(performance.now() - started)).padStart(6)} ms`;
const [asked, { report, read: designRead }] = await Promise.all([run.askJev("Jev: read it", { [key]: text }, questionsOf(grammar)), loadDesign({ brief: text }).loaded]);
// What the design says is given to the graph, where the graph has a question for it (screen.md does; email.md does not).
const givens = givensOf(grammar);
const reading = readGrammar(grammar, asked.answers, JEV, { values: { ...givens, ...("no_photographs" in givens ? { no_photographs: !designRead.imagery, no_symbols: !designRead.icons, no_cards: !designRead.contained } : {}) } });
const parts = partsOf(grammar, reading);
console.log(`${since()}  Jev: a ${reading.kind}: ${reading.blocks.join(", ")}`);
for (const d of reading.decisions) if (d.note) console.log(`           ${d.id} → ${d.answer}: ${d.note}`);

// What was answered at the top of the file and turns no pattern's knob is for the writers to know.
const settled: string[] = [];
for (const node of grammar.nodes) {
  const value = reading.values[idOf(node)];
  if (!node.question || value === undefined || node.asking?.type === "noul" || node.children.some((child) => child.block)) continue;
  const option = node.asking?.type === "choice" ? node.asking.options.find((o) => o.name === value) : undefined;
  if (node.asking?.type === "choice" && node.asking.among) continue;
  settled.push(node.asking?.type === "score" ? `${node.target ?? node.name}: about ${Math.round(Number(yieldOf(grammar, idOf(node), value)))}` : `${node.name}: ${value}${option?.criteria ? ` (${option.criteria})` : ""}`);
}

const look = { contained: designRead.contained, icons: designRead.icons, symbol: "image" };
// The frame is the file's too: the pattern its kinds name, set by the kind's traits, filled by what is always written.
// What is always written: the node that fills the frame's title first among them, and every other one the reading opens.
const titled = framePatternOf(patterns, grammar)?.roles?.title;
const contents = contentNodes(grammar).filter((node) => appliesIn(grammar, node, reading) && schemaOf(node, reading));
const header = contents.find((node) => node.fields.some((field) => field.role === titled)) ?? contents[0];
const trees = parts.map((node) => [node.name, treeOf(patterns, grammar, node, reading, look)] as const);
const frame = frameOf(patterns, grammar, reading, look, trees.map(([name, tree]) => ({ name, root: tree[0].id })));
if (!frame) throw new Error(`${file} names no frame for its kinds: say "→ page" after the heading of the kinds`);
const components: Component[] = [...frame, ...trees.flatMap(([, tree]) => tree)];
run.send({ createSurface: { surfaceId, catalogId } });
run.send({ updateComponents: { surfaceId, components } });
console.log(`${since()}  the tree: ${components.length} components, before a word is written`);

// --- What is written ---------------------------------------------------------------

const SYSTEM = `You write the sample content for one part of a mock-up. A separate system has already decided what the mock-up is made of and how it is laid out; you supply only the words and figures, as JSON matching the schema.
Write what the real thing would say to a typical person: specific, plausible names, numbers and dates, never placeholders or lorem ipsum.
Other parts are written separately, so stay strictly within your part. Keep every string short. Do not describe the layout and do not use HTML.`;
const written: Record<string, any> = {};
const show = (node: Node) => run.send({ updateDataModel: { surfaceId, path: `/${node.name}`, value: written[node.name] } });
const write = async (node: Node, agreeWith?: unknown) => {
  const schema = schemaOf(node, reading);
  if (!schema) return;
  const prompt = [
    `What is being made, a ${grammar.name}: ${text}`,
    `It is a ${reading.kind}, with these parts: ${reading.blocks.join(", ")}.`,
    ...(settled.length ? [`Settled about the whole of it:\n${settled.map((s) => `- ${s}`).join("\n")}`] : []),
    ...(agreeWith ? [`Already written, which your figures must agree with:\n${JSON.stringify(agreeWith)}`] : []),
    `Write the "${node.name}" part.`,
  ].join("\n\n");
  const { text: raw } = await streamGeminiJson({ system: SYSTEM, prompt, schema });
  written[node.name] = JSON.parse(raw)[node.name];
  show(node);
  console.log(`${since()}  written: "${node.name}"`);
  // What is decided once the words exist, and only of what is drawn.
  // What is always written is drawn by the frame; a part, by its own pattern.
  const bound = boundIn(contents.includes(node) ? frame : treeOf(patterns, grammar, node, reading, look));
  for (const asking of decide(grammar, node, written[node.name], { description: text, reading, calibration: JEV, needed: (path) => bound.has(path) })) {
    const answers = Object.keys(asking.questions).length ? (await run.askJev(`Jev: read "${node.name}"`, asking.state, asking.questions)).answers : {};
    const { decorations, decisions } = asking.read(answers);
    written[node.name] = decorate(written[node.name], decorations);
    show(node);
    console.log(`${since()}  decided: ${decisions.map((d) => `${d.id} → ${d.answer}${Object.keys(asking.questions).length ? ` (${d.p.toFixed(2)})` : " (nothing to ask)"}`).join(", ")}`);
  }
};

// --- What is not written: the chains -------------------------------------------------

/** A part that arrives whole. The contract is what the file says to a maker: about the part, and about each answer under it (bake.ts, `customOf`). */
const fillPart = async (node: Node) => {
  const custom = customOf(new Graph(grammar, catalog), node, reading);
  // The baker is the tool's own and speaks of screens: it is handed the email as one, with the part's contract said in words.
  const brief = `${text}\n\nThis is a ${grammar.name}, not an app screen. Your component is its "${node.name}" part.`;
  const filled = await fill<Filling | "closed">(
    node.filled!,
    { shelf: async () => undefined, baked: () => CUSTOM_SOURCES.baked(run, brief, custom, { voice: "" }), closed: async () => "closed" as const },
    sources,
  );
  sendCustom(run, surfaceId, !filled || filled.value === "closed" ? undefined : filled.value, `/${node.name}`);
  console.log(`${since()}  "${node.name}" is ${filled?.from ?? "nothing"}${filled && filled.value !== "closed" ? `: "${filled.value.baked.name}", ${filled.value.baked.source.length} characters of source. ${filled.value.baked.card}` : ""}`);
};

const pictures = new Pictures(run, text, text);
const words = (value: any, fields: Field[]) => fields.filter((f) => !f.source && !f.type && !f.list).slice(0, 2).map((f) => value?.[f.name]).filter((s) => typeof s === "string" && s.trim()).join(" · ");
/** A picture that is looked for. What it is of is the words nearest it: the item it belongs to, or else the header. */
const findPicture = async (chain: NonNullable<Field["source"]>, of: string, ratio: "16:9" | "1:1", size: [number, number]): Promise<string | undefined> => {
  const by = chain.find((step) => step.by)?.by;
  const wanted = await pictures.settle({ subject: String(by ? reading.values[by] : "venue") as SubjectName, p: by ? reading.p[by] : 1, of, ratio, size });
  const filled = await fill<string | null>(chain, { library: () => pictures.library(wanted), painted: async () => (paint ? pictures.painted(wanted) : undefined), placeholder: async () => null }, sources);
  console.log(`${since()}  a picture of "${of.slice(0, 44)}" (${wanted.subject}): ${filled?.from}${filled?.from === "placeholder" && !paint ? " (none in the library would do, and nothing is painted without --paint)" : ""}`);
  const url = filled?.value ?? undefined;
  // A made picture is served by the tool; a page that stands alone has to carry it.
  const made = url?.startsWith("/api/photo/") ? readMade(url.split("/").pop()!) : undefined;
  return made ? `data:${made.mime};base64,${made.bytes.toString("base64")}` : url;
};
/** A field whose value is looked for, and that is there at all for this reading: no thumbnails, no looking. */
const looked = (field: Field) => !!field.source?.some((step) => sources.get(step.name)?.includes("set")) && (field.when ?? []).every((atom) => holdsIn(reading, atom));
const fillPictures = async (node: Node) => {
  for (const field of node.fields) {
    if (looked(field)) {
      const url = await findPicture(field.source!, words(header ? written[header.name] : undefined, header?.fields ?? []) || text, "16:9", [960, 540]);
      if (url) (written[node.name] = { ...written[node.name], [field.name]: url }), show(node);
    }
    const inside = field.fields.find(looked);
    // A part that is nothing but its list is that list; otherwise the list is one of the things in it.
    const items: any[] | undefined = Array.isArray(written[node.name]) ? written[node.name] : written[node.name]?.[field.name];
    if (!inside || !Array.isArray(items)) continue;
    await Promise.all(
      items.map(async (item) => {
        const url = await findPicture(inside.source!, words(item, field.fields) || text, "1:1", [160, 160]);
        if (url) (item[inside.name] = url), show(node);
      }),
    );
  }
};

// Writers cannot see each other, so a bill would not add up: a part with a total waits for the things it is the total of.
const items = parts.find((node) => node.target === "collection");
const sums = parts.find((node) => node.fields.some((field) => field.notes.length));
const writing = Promise.all([...contents, ...parts.filter((node) => node !== sums || !items)].map((node) => write(node))).then(() => (sums && items ? write(sums, written[items.name]) : undefined));
// Baking takes seconds and nothing waits on it: it starts with the writers, and its slot shimmers meanwhile.
const baking = Promise.all(parts.filter((node) => node.filled).map(fillPart));
await writing;
await Promise.all(parts.map(fillPictures));
await baking;

const messages = [...run.sent];
const problems = validateMessages(messages as never);
console.log(problems.length ? `INVALID:\n${problems.join("\n")}` : `valid: ${messages.length} messages, every component checked against its catalog's set`);

const bundle = await build({
  stdin: { contents: `import "./src/web/surface.ts";\ndocument.querySelector("ui-surface").sync(window.MESSAGES);`, resolveDir: root, loader: "ts" },
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "error",
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
  // Vite's way of importing a stylesheet as text, which the frame of a baked component is handed.
  plugins: [
    {
      name: "css-inline",
      setup(b) {
        b.onResolve({ filter: /\.css\?inline$/ }, (found) => ({ path: resolve(found.resolveDir, found.path.replace(/\?inline$/, "")), namespace: "css-inline" }));
        b.onLoad({ filter: /.*/, namespace: "css-inline" }, (found) => ({ contents: readFileSync(found.path, "utf8"), loader: "text" }));
      },
    },
  ],
});
const { theme } = report;
const fonts = theme.fonts.map((family) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap" />`).join("\n");
const vars = Object.entries(theme.vars).map(([k, v]) => `${k}: ${v};`).join(" ");
const html = `<!doctype html>
<meta charset="utf-8" />
<title>${grammar.name}: ${text.replace(/[<&]/g, "")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block" />
${fonts}
<style>${[resolve(root, "src/web/surface.css"), ...NAMED[idiom.id].stylesheets.map((sheet) => resolve(root, "src/web", sheet))].map((sheet) => readFileSync(sheet, "utf8")).join("\n")}
body { margin: 0; background: #d9d9de; display: grid; place-items: start center; padding: 32px; }
.mock { ${vars} color-scheme: ${theme.colorScheme}; font-family: ${theme.fontFamily}; background: var(--k-page); width: 420px; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 40px rgb(0 0 0 / 0.18); }
</style>
<div class="mock"><ui-surface></ui-surface></div>
<script>window.MESSAGES = ${JSON.stringify(messages).replace(/</g, "\\u003c")};</script>
<script type="module">
${bundle.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}
document.querySelector("ui-surface").theme = ${JSON.stringify(theme).replace(/</g, "\\u003c")};
</script>
`;
const out = resolve(root, "out/grammar");
mkdirSync(out, { recursive: true });
const name = `${grammar.name}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/-$/, "")}`;
writeFileSync(`${out}/${name}.html`, html);
writeFileSync(`${out}/${name}.json`, JSON.stringify({ reading: { kind: reading.kind, blocks: reading.blocks, values: reading.values }, written, messages }, null, 2));
console.log(`\nout/grammar/${name}.html`);
process.exit(0);
