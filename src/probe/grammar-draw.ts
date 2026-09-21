// Probe: a graph kept in a file, drawn (docs/grammar.md).
//
// Everything that is specific to what is being made comes from the file: what Jev is
// asked, how the answers are read, what each part is made of, which of the catalog's
// patterns draws it and what each writer is asked for. The code here knows none of it.
//
//   npm run probe:draw -- grammar/examples/email.md "Order confirmation for two pairs of sneakers, with the totals"
//
// Jev reads the description (one request) and mixes a design for it (one more, as the
// tool does); the tree is sent; one Gemini writer per written part fills it. What comes
// out is out/grammar/<name>.html, which stands alone, and the messages beside it.
//
// What is not here, because the file cannot say it yet: what Jev decides once the words
// exist (tones, which button is the main one), pictures, and anything `computed`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { KIT_CATALOG_ID, type KitComponent } from "../shared/kit.js";
import { loadDesign } from "../server/design-source.js";
import { askJev, streamGeminiJson } from "../server/models.js";
import { validateMessages } from "../server/validate.js";
import { idOf, type Node } from "../server/grammar/format.js";
import { loadGrammar } from "../server/grammar/load.js";
import { checkBindings, partsOf, schemaOf, treeOf } from "../server/grammar/make.js";
import { KIT_PATTERNS } from "../server/grammar/patterns.js";
import { JEV, questionsOf, readGrammar, yieldOf } from "../server/grammar/read.js";

const [file, text] = process.argv.slice(2);
if (!file || !text) throw new Error('usage: npm run probe:draw -- <graph.md> "<what to make>"');
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const grammar = loadGrammar(resolve(file));
const key = grammar.stateKey ?? grammar.name;
for (const problem of checkBindings(grammar, loadGrammar("kit.md")).warnings) console.log(`warning: ${problem}`);

const started = performance.now();
const designing = loadDesign({ brief: text }).loaded;
const asked = await askJev({ [key]: text }, questionsOf(grammar));
const reading = readGrammar(grammar, asked.answers, JEV);
const parts = partsOf(grammar, reading);
console.log(`${Math.round(asked.ms)} ms  Jev: a ${reading.kind}: ${reading.blocks.join(", ")}`);
for (const d of reading.decisions) if (d.note) console.log(`         ${d.id} → ${d.answer}: ${d.note}`);

// What was answered at the top of the file and turns no pattern's knob is for the writers to know.
const settled: string[] = [];
for (const node of grammar.nodes) {
  const value = reading.values[idOf(node)];
  if (!node.question || value === undefined || node.asking?.type === "noul" || node.children.some((child) => child.block)) continue;
  const option = node.asking?.type === "choice" ? node.asking.options.find((o) => o.name === value) : undefined;
  settled.push(node.asking?.type === "score" ? `${node.target ?? node.name}: about ${Math.round(Number(yieldOf(grammar, idOf(node), value)))}` : `${node.name}: ${value}${option?.criteria ? ` (${option.criteria})` : ""}`);
}

const { report } = await designing;
const look = { contained: true, icons: true, symbol: "image" };
// The frame is the one thing here that is not the file's: a page, with the header at the top of it if the graph writes one.
const header = grammar.nodes.find((node) => node.name === "header" && !node.question);
const components: KitComponent[] = [
  { id: "root", component: "Screen", body: "body" },
  { id: "body", component: "Stack", gap: "lg", pad: "md", children: [...(header ? ["page_header"] : []), ...parts.map((node) => node.name)] },
  ...(header
    ? ([
        { id: "page_header", component: "Stack", gap: "xs", children: ["page_title", "page_line"] },
        { id: "page_title", component: "Text", role: "headline", text: { path: "/header/title" } },
        { id: "page_line", component: "Text", tone: "muted", text: { path: "/header/subtitle" } },
      ] as KitComponent[])
    : []),
  ...parts.flatMap((node) => treeOf(KIT_PATTERNS, grammar, node, reading, look)),
];
const send = (body: Record<string, unknown>) => ({ version: "v0.9", ...body });
const messages: Array<Record<string, unknown>> = [send({ createSurface: { surfaceId: "main", catalogId: KIT_CATALOG_ID } }), send({ updateComponents: { surfaceId: "main", components } })];
console.log(`${Math.round(performance.now() - started)} ms  the tree: ${components.length} components, before a word is written`);

const SYSTEM = `You write the sample content for one part of a mock-up. A separate system has already decided what the mock-up is made of and how it is laid out; you supply only the words and figures, as JSON matching the schema.
Write what the real thing would say to a typical person: specific, plausible names, numbers and dates, never placeholders or lorem ipsum.
Other parts are written separately, so stay strictly within your part. Keep every string short. Do not describe the layout and do not use HTML.`;
const written: Record<string, unknown> = {};
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
  const began = performance.now();
  const { text: raw } = await streamGeminiJson({ system: SYSTEM, prompt, schema });
  written[node.name] = JSON.parse(raw)[node.name];
  messages.push(send({ updateDataModel: { surfaceId: "main", path: `/${node.name}`, value: written[node.name] } }));
  console.log(`${String(Math.round(performance.now() - began)).padStart(5)} ms  Gemini wrote "${node.name}"${node.target ? "" : " (nothing draws it)"}`);
};
// Writers cannot see each other, so a bill would not add up: a part with a total waits for the things it is the total of.
const items = parts.find((node) => node.target === "collection");
const sums = parts.find((node) => node.fields.some((field) => field.notes.length));
await Promise.all([...(header ? [header] : []), ...parts.filter((node) => node !== sums || !items)].map((node) => write(node)));
if (sums && items) await write(sums, written[items.name]);

const problems = validateMessages(messages as never);
console.log(problems.length ? `INVALID:\n${problems.join("\n")}` : `valid: ${messages.length} messages, every component checked against the kit's schemas`);

const bundle = await build({
  stdin: { contents: `import "./src/web/kit/surface.ts";\ndocument.querySelector("kit-surface").sync(window.MESSAGES);`, resolveDir: root, loader: "ts" },
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
        b.onResolve({ filter: /\.css\?inline$/ }, (args) => ({ path: resolve(args.resolveDir, args.path.replace(/\?inline$/, "")), namespace: "css-inline" }));
        b.onLoad({ filter: /.*/, namespace: "css-inline" }, (args) => ({ contents: readFileSync(args.path, "utf8"), loader: "text" }));
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
<style>${readFileSync(resolve(root, "src/web/kit/kit.css"), "utf8")}
body { margin: 0; background: #d9d9de; display: grid; place-items: start center; padding: 32px; }
.mock { ${vars} color-scheme: ${theme.colorScheme}; font-family: ${theme.fontFamily}; background: var(--k-page); width: 420px; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 40px rgb(0 0 0 / 0.18); }
</style>
<div class="mock"><kit-surface></kit-surface></div>
<script>window.MESSAGES = ${JSON.stringify(messages).replace(/</g, "\\u003c")};</script>
<script type="module">${bundle.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}</script>
`;
const out = resolve(root, "out/grammar");
mkdirSync(out, { recursive: true });
const name = `${grammar.name}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/-$/, "")}`;
writeFileSync(`${out}/${name}.html`, html);
writeFileSync(`${out}/${name}.json`, JSON.stringify({ reading: { kind: reading.kind, blocks: reading.blocks, values: reading.values }, written, messages }, null, 2));
console.log(`\nout/grammar/${name}.html`);
