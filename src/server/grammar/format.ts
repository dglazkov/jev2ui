// A decision graph, written down (docs/grammar.md).
//
// The questions Jev is asked, how they nest, and what code does with the answers
// are tables and rules in plan.ts. This is the same thing as a markdown file, so
// that a graph can be read, reviewed and brought along like a DESIGN.md. Each of
// Jev's three primitives is a kind of markdown list:
//
//   > Does the screen show several similar items?       the question
//   + Results, products, people, records.                Noul: a `+` line and a `-` line
//   - The screen is about one thing.
//
//   - **rows** — Dense rows to scan quickly.             Choice: bullets that open with a bold name
//   - **strip** `3:1` — A thin band across the screen.   ...and what the option yields, when not its name
//
//   1. `0.04` Almost grey: dusty, muted, restrained.     Score: a numbered rubric; values make it a dial
//
// Headings nest the way the decisions do: a question under a heading is only
// read when the heading's answer is yes. A Choice whose options carry a shape
//
//   - **feed** — A collection to look through.
//     `filters? banner? hero? custom? LIST`
//
// is the kind of thing being made: the parts it may have, in the order they come;
// CAPITALS are always there, a bare name is expected (kept at even odds), and a
// `?` is an extra (kept only when the answer is confident). The headings under it
// are those parts, and each part's own question is answered under `has_<part>`.
//
// There are no numbers for "confident" in the file. They belong to whoever
// answers (read.ts): gev says 0.00 where Jev says 0.82.
//
// What cannot be said with nesting and tiers is a rule, one flat form, applied in
// the order written:   - when form, no actions — a form's submit button is the call to action

export interface Shape {
  /** The parts a thing of this kind may have, in the order they come. */
  parts: Array<{ block: string; tier: "always" | "expected" | "extra" }>;
  /** A thing of this kind with fewer parts looks unfinished; the likeliest remaining parts are added up to this many. */
  atLeast?: number;
  /** What the host is told about this kind, and the graph does not read: `dialog`, `sticky actions`. */
  traits: string[];
}

export interface Option {
  name: string;
  /** What choosing it yields, when that is not its name: a ratio, an angle, the name of a symbol. */
  value?: string;
  criteria: string | null;
  shape?: Shape;
}

export interface Level {
  /** The value at this level of the rubric. An answer between two levels yields a value between theirs. */
  value?: string;
  criteria: string;
}

export type Asking =
  | { type: "noul"; yes?: string; no?: string }
  /** `among` names a set kept in another file; `options` are that file's. */
  | { type: "choice"; options: Option[]; among?: { name: string; href: string } }
  | { type: "score"; levels: Level[] };

export interface Node {
  /** The heading: the id the answer comes back under, or the name of a part. */
  name: string;
  /** A part of the kind of thing being made. Its question is answered under `has_<name>`. */
  block: boolean;
  traits: string[];
  /** Where the answer goes, when it is a value in some other document: a token of a DESIGN.md. */
  target?: string;
  /** Anything said under the heading that is not asked of Jev: where the knowledge came from. */
  prose: string[];
  question?: string;
  asking?: Asking;
  children: Node[];
}

export type Atom = { block: string; present: boolean } | { id: string; is: string; not: boolean };
export interface Rule {
  when: Atom[];
  then: Atom;
  reason?: string;
}

/** Something the graph was written to read, and how it should come out, where anyone has said. The file's own probe (src/probe/grammar.ts). */
export interface Example {
  text: string;
  expect: Atom[];
}

export interface Grammar {
  name: string;
  /** Read by Jev before every question of the file. */
  context?: string;
  prose: string[];
  /** A file that is only a set of options, for the questions of other files to choose among. */
  options: Option[];
  nodes: Node[];
  rules: Rule[];
  examples: Example[];
  /** The name an example goes under in what Jev reads: `## Examples (screen)`. Without one, the name of the file's graph. */
  stateKey?: string;
}

/** The id an answer comes back under. */
export const idOf = (node: Node) => (node.block ? `has_${node.name}` : node.name);

export function walk(nodes: Node[], each: (node: Node, parent?: Node) => void, parent?: Node) {
  for (const node of nodes) {
    each(node, parent);
    walk(node.children, each, node);
  }
}

// --- Reading -------------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const TITLE = /^([A-Za-z_]\w*)(?:\s+\(([^)]*)\))?(?:\s+→\s+(.+))?$/;
const OPTION = /^- \*\*([^*]+)\*\*(?:\s+`([^`]*)`)?(?:\s+—\s+(.*))?$/;
const LEVEL = /^\d+\.\s+(?:`([^`]*)`\s+)?(.+)$/;
const BARE = /^(?:`[^`]+`\s*)+$/;
const AMONG = /^among \[([^\]]+)\]\(([^)]+)\)$/;
const SHAPE = /^\s+`([^`]*)`\s*(.*)$/;
const RULE = /^- when (.+?), (.+?)(?:\s+—\s+(.*))?$/;
const EXAMPLES = /^Examples(?:\s+\((\w+)\))?$/;
const EXAMPLE = /^- (.+?)(?: → (.+))?$/;

function parseAtom(text: string, line: number): Atom {
  const is = /^(\w+) is (not )?(\S+)$/.exec(text);
  if (is) return { id: is[1], is: is[3], not: !!is[2] };
  const block = /^(no )?(\w+)$/.exec(text);
  if (block) return { block: block[2], present: !block[1] };
  throw new Error(`line ${line}: "${text}" is not a condition: write a part ("list", "no list") or an answer ("list_layout is rows")`);
}

function parseShape(tokens: string, rest: string): Shape {
  const parts = tokens.split(/\s+/).filter(Boolean).map((token): Shape["parts"][number] => {
    if (token.endsWith("?")) return { block: token.slice(0, -1), tier: "extra" };
    if (token === token.toUpperCase() && token !== token.toLowerCase()) return { block: token.toLowerCase(), tier: "always" };
    return { block: token, tier: "expected" };
  });
  const shape: Shape = { parts, traits: [] };
  for (const word of rest.split(",").map((w) => w.trim()).filter(Boolean)) {
    const atLeast = /^at least (\d+)$/.exec(word);
    if (atLeast) shape.atLeast = Number(atLeast[1]);
    else shape.traits.push(word);
  }
  return shape;
}

/** `load` fetches the text of a file a question links to; without it, a question that chooses `among` a set has no options. */
export function parseGrammar(markdown: string, load?: (href: string) => string): Grammar {
  const grammar: Grammar = { name: "", prose: [], options: [], nodes: [], rules: [], examples: [] };
  const open: Array<{ depth: number; node: Node }> = [];
  let inRules = false;
  let inExamples = false;
  let paragraph: string[] = [];
  let quote: string[] = [];
  let lastOption: Option | undefined;

  const here = () => open.at(-1)?.node;
  const asking = <T extends Asking["type"]>(type: T, line: number): Extract<Asking, { type: T }> => {
    const node = here();
    if (!node) throw new Error(`line ${line}: options need a heading to belong to`);
    node.asking ??= (type === "noul" ? { type } : type === "choice" ? { type, options: [] } : { type, levels: [] }) as Asking;
    if (node.asking.type !== type) throw new Error(`line ${line}: "${node.name}" is a ${node.asking.type} and cannot also be a ${type}`);
    return node.asking as Extract<Asking, { type: T }>;
  };
  const flush = () => {
    if (quote.length) {
      const text = quote.join(" ");
      const node = here();
      if (node) node.question = text;
      else grammar.context = text;
      quote = [];
    }
    if (paragraph.length) {
      (here()?.prose ?? grammar.prose).push(paragraph.join(" "));
      paragraph = [];
    }
  };

  markdown.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trimEnd();
    if (text.startsWith("> ")) {
      if (paragraph.length) flush();
      quote.push(text.slice(2).trim());
      return;
    }
    if (quote.length) flush();
    if (!text.trim()) return flush();

    const heading = HEADING.exec(text);
    if (heading) {
      flush();
      lastOption = undefined;
      const depth = heading[1].length;
      if (depth === 1) return void (grammar.name = heading[2]);
      const examples = EXAMPLES.exec(heading[2]);
      if (heading[2] === "Rules" || examples) {
        inRules = !examples;
        inExamples = !!examples;
        if (examples?.[1]) grammar.stateKey = examples[1];
        open.length = 0;
        return;
      }
      const title = TITLE.exec(heading[2]);
      if (!title) throw new Error(`line ${line}: a heading is a name, then (traits), then → a target: "${heading[2]}"`);
      inRules = inExamples = false;
      while (open.length && open.at(-1)!.depth >= depth) open.pop();
      const parent = here();
      const node: Node = {
        name: title[1],
        block: !!(parent?.asking?.type === "choice" && parent.asking.options.some((o) => o.shape)),
        traits: title[2] ? title[2].split(",").map((t) => t.trim()).filter(Boolean) : [],
        ...(title[3] ? { target: title[3].trim() } : {}),
        prose: [],
        children: [],
      };
      (parent?.children ?? grammar.nodes).push(node);
      open.push({ depth, node });
      return;
    }

    if (inRules) {
      const rule = RULE.exec(text);
      if (!rule) return void paragraph.push(text.trim());
      flush();
      grammar.rules.push({ when: rule[1].split(" and ").map((atom) => parseAtom(atom.trim(), line)), then: parseAtom(rule[2].trim(), line), ...(rule[3] ? { reason: rule[3] } : {}) });
      return;
    }

    if (inExamples) {
      const example = EXAMPLE.exec(text);
      if (!example) return void paragraph.push(text.trim());
      flush();
      grammar.examples.push({ text: example[1].trim(), expect: (example[2] ?? "").split(",").map((atom) => atom.trim()).filter(Boolean).map((atom) => parseAtom(atom, line)) });
      return;
    }

    const shape = SHAPE.exec(raw);
    if (shape && lastOption) return void (lastOption.shape = parseShape(shape[1], shape[2]));
    const option = OPTION.exec(text);
    if (option) {
      flush();
      lastOption = { name: option[1], ...(option[2] !== undefined ? { value: option[2] } : {}), criteria: option[3] ?? null };
      (here() ? asking("choice", line).options : grammar.options).push(lastOption);
      return;
    }
    if (BARE.test(text)) {
      flush();
      const names = [...text.matchAll(/`([^`]+)`/g)].map((m): Option => ({ name: m[1], criteria: null }));
      (here() ? asking("choice", line).options : grammar.options).push(...names);
      return;
    }
    const among = AMONG.exec(text);
    if (among) {
      flush();
      const choice = asking("choice", line);
      choice.among = { name: among[1], href: among[2] };
      if (load) choice.options.push(...parseGrammar(load(among[2])).options);
      return;
    }
    const level = LEVEL.exec(text);
    if (level) {
      flush();
      asking("score", line).levels.push({ ...(level[1] !== undefined ? { value: level[1] } : {}), criteria: level[2] });
    } else if (text.startsWith("+ ")) {
      flush();
      asking("noul", line).yes = text.slice(2).trim();
    } else if (text.startsWith("- ")) {
      flush();
      asking("noul", line).no = text.slice(2).trim();
    } else paragraph.push(text.trim());
  });
  flush();
  // A question with nothing listed under it is a bare yes or no.
  walk(grammar.nodes, (node) => void (node.question && (node.asking ??= { type: "noul" })));
  return grammar;
}

// --- Writing -------------------------------------------------------------------

const oneLine = (text: string, what: string) => {
  if (/\n/.test(text)) throw new Error(`${what} has to fit on one line: ${JSON.stringify(text)}`);
  return text;
};

function printAtom(atom: Atom): string {
  return "block" in atom ? `${atom.present ? "" : "no "}${atom.block}` : `${atom.id} is ${atom.not ? "not " : ""}${atom.is}`;
}

export const printRule = (rule: Rule) => `when ${rule.when.map(printAtom).join(" and ")}, ${printAtom(rule.then)}`;

function printShape(shape: Shape): string {
  const tokens = shape.parts.map(({ block, tier }) => {
    if (block !== block.toLowerCase()) throw new Error(`the name of a part is written small, so that CAPITALS can say it is always there: "${block}"`);
    return tier === "always" ? block.toUpperCase() : tier === "extra" ? `${block}?` : block;
  });
  const rest = [...(shape.atLeast ? [`at least ${shape.atLeast}`] : []), ...shape.traits];
  return `  \`${tokens.join(" ")}\`${rest.length ? ` ${rest.join(", ")}` : ""}`;
}

function printOptions(options: Option[]): string[] {
  const out: string[] = [];
  let bare: string[] = [];
  const flushBare = () => {
    let row = "";
    for (const name of bare) {
      if (row && row.length + name.length + 3 > 100) (out.push(row), (row = ""));
      row += `${row ? " " : ""}\`${name}\``;
    }
    if (row) out.push(row, "");
    bare = [];
  };
  for (const option of options) {
    if (option.criteria === null && option.value === undefined && !option.shape) {
      bare.push(option.name);
      continue;
    }
    flushBare();
    out.push(`- **${option.name}**${option.value !== undefined ? ` \`${option.value}\`` : ""}${option.criteria !== null ? ` — ${oneLine(option.criteria, option.name)}` : ""}`);
    if (option.shape) out.push(printShape(option.shape));
  }
  flushBare();
  while (out.at(-1) === "") out.pop();
  return out;
}

function printNode(node: Node, depth: number): string[] {
  const out = [`${"#".repeat(depth)} ${node.name}${node.traits.length ? ` (${node.traits.join(", ")})` : ""}${node.target ? ` → ${node.target}` : ""}`, ""];
  for (const paragraph of node.prose) out.push(oneLine(paragraph, node.name), "");
  if (node.question) out.push(`> ${oneLine(node.question, node.name)}`, "");
  const asking = node.asking;
  if (asking?.type === "noul" && (asking.yes !== undefined || asking.no !== undefined)) {
    if (asking.no?.startsWith("**")) throw new Error(`"${node.name}": a line that opens with a bold name is an option`);
    if (asking.yes !== undefined) out.push(`+ ${oneLine(asking.yes, node.name)}`);
    if (asking.no !== undefined) out.push(`- ${oneLine(asking.no, node.name)}`);
    out.push("");
  }
  if (asking?.type === "choice") {
    if (asking.among) out.push(`among [${asking.among.name}](${asking.among.href})`, "");
    else out.push(...printOptions(asking.options), "");
  }
  if (asking?.type === "score") {
    asking.levels.forEach((level, i) => {
      if (level.value === undefined && level.criteria.startsWith("`")) throw new Error(`"${node.name}": a level that opens with code reads as its value`);
      out.push(`${i + 1}. ${level.value !== undefined ? `\`${level.value}\` ` : ""}${oneLine(level.criteria, node.name)}`);
    });
    out.push("");
  }
  for (const child of node.children) out.push(...printNode(child, depth + 1));
  return out;
}

export function printGrammar(grammar: Grammar): string {
  const out = [`# ${grammar.name}`, ""];
  if (grammar.context) out.push(`> ${oneLine(grammar.context, "the context")}`, "");
  for (const paragraph of grammar.prose) out.push(oneLine(paragraph, grammar.name), "");
  if (grammar.options.length) out.push(...printOptions(grammar.options), "");
  for (const node of grammar.nodes) out.push(...printNode(node, 2));
  if (grammar.rules.length) {
    out.push("## Rules", "");
    for (const rule of grammar.rules) out.push(`- ${printRule(rule)}${rule.reason ? ` — ${oneLine(rule.reason, "a rule")}` : ""}`);
    out.push("");
  }
  if (grammar.examples.length) {
    out.push(`## Examples${grammar.stateKey ? ` (${grammar.stateKey})` : ""}`, "");
    for (const example of grammar.examples) {
      if (example.text.includes(" → ")) throw new Error(`an example cannot have an arrow in it: "${example.text}"`);
      out.push(`- ${oneLine(example.text, "an example")}${example.expect.length ? ` → ${example.expect.map(printAtom).join(", ")}` : ""}`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

// --- Checking ------------------------------------------------------------------

/**
 * What is wrong with a graph, and what is likely to go wrong when Jev reads it. The warnings are this project's own
 * scars: a bare question comes back near even odds, and a question under a part is asked before anyone knows whether
 * the part is there, so it has to say "if".
 */
export function checkGrammar(grammar: Grammar): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, Node>();
  const blocks = new Set<string>();
  walk(grammar.nodes, (node, parent) => {
    const id = idOf(node);
    if (byId.has(id)) errors.push(`"${id}" is asked twice`);
    byId.set(id, node);
    if (node.block) blocks.add(node.name);
    if (!node.question) errors.push(`"${node.name}" has no question`);
    const asking = node.asking;
    if (asking?.type === "choice" && asking.options.length < 2) errors.push(`"${node.name}" needs at least two options${asking.among ? `: "${asking.among.href}" was not read` : ""}`);
    if (asking?.type === "score" && asking.levels.length < 2) errors.push(`"${node.name}" needs at least two levels`);
    if (asking?.type === "score" && asking.levels.some((l) => l.value !== undefined) && asking.levels.some((l) => l.value === undefined || Number.isNaN(Number(l.value)))) errors.push(`"${node.name}" is a dial only if every level has a number`);
    if (asking?.type === "noul" && (asking.yes === undefined || asking.no === undefined)) warnings.push(`"${id}" does not say what yes and no look like; bare questions come back near even odds`);
    // A part is not under its kind the way a question is under a part: whether there is a list is asked of every screen.
    if (parent && !node.block && node.question && !/^if\b/i.test(node.question)) warnings.push(`"${id}" is asked before "${idOf(parent)}" is known, so it should open with "If…"`);
  });
  walk(grammar.nodes, (node) => {
    if (node.asking?.type !== "choice") return;
    for (const option of node.asking.options) for (const part of option.shape?.parts ?? []) if (!blocks.has(part.block)) errors.push(`"${option.name}" has a part "${part.block}" that nothing describes`);
  });
  const checkAtom = (atom: Atom) => {
    if ("block" in atom) return void (blocks.has(atom.block) || errors.push(`a rule or an example names a part "${atom.block}" that nothing describes`));
    const asking = byId.get(atom.id)?.asking;
    if (!asking) return void errors.push(`a rule or an example names "${atom.id}", which is not asked`);
    if (asking.type === "choice" && !asking.options.some((o) => o.name === atom.is)) errors.push(`a rule says "${atom.id} is ${atom.is}", which is not one of its options`);
    if (asking.type === "noul" && atom.is !== "yes" && atom.is !== "no") errors.push(`a rule says "${atom.id} is ${atom.is}", and it can only be yes or no`);
    if (asking.type === "score") errors.push(`a rule names "${atom.id}", which is a score; rules read parts, choices and yes-or-no answers`);
  };
  for (const rule of grammar.rules) [...rule.when, rule.then].forEach(checkAtom);
  for (const example of grammar.examples) example.expect.forEach(checkAtom);
  if (grammar.nodes.length && !grammar.examples.length) warnings.push("the file has no examples, so nothing says its questions are read as they were meant");
  return { errors, warnings };
}
