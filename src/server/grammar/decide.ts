// What Jev decides once the words exist (docs/grammar.md).
//
// A question under a part whose heading says what it is asked of is not asked about
// the description, it is asked about what was written: of the part's words, once; of
// each element of a list; or, with the elements themselves as its options, which of
// them is the one. A field says which question decides it (`decided by row_control`),
// and what the answer yields is written into the data beside the words it is about,
// which is how a template stays a template however much its instances differ.
//
// This is refine.ts done for any graph. One request for each part, or for each element
// of an outer list (the rows of one group), holding every such question that some
// field that is drawn needs. Then, for each element, the rules that are about them,
// in the order written, and the two things a field can say about all of its elements
// at once: `all or none`, and `one where …`.

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import type { Decision } from "../../shared/events.js";
import { laterIn, laterOf, walk, type Atom, type Field, type Grammar, type Later, type Node, type Rule } from "./format.js";
import { holdsIn, type Calibration, type Reading } from "./read.js";

/** Values to merge into a part of the data model, at a path inside that part. `undefined` takes a written value away. */
export interface Decoration {
  at: Array<string | number>;
  values: Record<string, unknown>;
}

export interface Asked {
  /** Which element of the outer list this request is about, when the part has one: the rows of one group. */
  outer?: number;
  state: Record<string, unknown>;
  /** Empty when everything could be settled without asking: the only button is the main one. */
  questions: Questions;
  read(answers: Record<string, any>): { decorations: Decoration[]; decisions: Decision[] };
}

export interface DecideOptions {
  /** What was described, which Jev reads under the graph's own name for it. */
  description: string;
  reading: Reading;
  calibration: Calibration;
  /** Whether anything that is drawn reads the field: a question nothing needs is not asked. `path` is as a pattern binds it. Without this, every field is needed. */
  needed?: (path: string) => boolean;
  /** For a field that is `one where …`: whether this element is already known to be the one, by how the person got here. */
  known?: (field: Field, element: any) => boolean;
}

interface Located {
  field: Field;
  /** From the part's content to the list; a number stands for whichever element of the outer list. */
  path: string[];
  outer?: Located;
}

const written = (fields: Field[]) => fields.filter((field) => !field.source);

/** A part that is nothing but a list is that list (make.ts says the same of where the data is). */
const isWhole = (part: Node, field: Field) => !!field.list && field.name === part.name && written(part.fields).length === 1;

function listsOf(part: Node): Located[] {
  const out: Located[] = [];
  const into = (fields: Field[], path: string[], outer?: Located) => {
    for (const field of fields) {
      if (!field.list) continue;
      const located: Located = { field, path: !outer && isWhole(part, field) ? path : [...path, field.name], ...(outer ? { outer } : {}) };
      out.push(located);
      into(field.fields, [], located);
    }
  };
  into(part.fields, []);
  return out;
}

/** An element with one thing written for it is that thing, where Jev reads it: a destination is its label. */
function simple(element: any, fields: Field[]): unknown {
  const scalars = written(fields).filter((field) => !field.list);
  return scalars.length === 1 && element && typeof element === "object" ? element[scalars[0].name] : element;
}

/** What an element is called where a person reads it: the first thing written for it, so a setting is its label and not its value. */
function wordsOf(element: any, fields: Field[]): string {
  if (!element || typeof element !== "object") return String(element);
  const first = written(fields).find((field) => !field.list && element[field.name] !== undefined && element[field.name] !== "");
  return first ? String(element[first.name]) : "";
}

const at = (content: any, path: Array<string | number>) => path.reduce((value, key) => value?.[key], content);
const said = (value: unknown) => (typeof value === "boolean" ? (value ? "yes" : "no") : String(value));

export function decide(grammar: Grammar, part: Node, content: unknown, options: DecideOptions): Asked[] {
  const laters: Array<{ node: Node; later: Later }> = [];
  walk(part.children, (node) => {
    const later = laterOf(node);
    if (later && node.question) laters.push({ node, later });
  });
  if (!laters.length || content === undefined || content === null) return [];
  const lists = listsOf(part);
  const rules = grammar.rules.filter((rule) => {
    const ids = [...rule.when, rule.then].flatMap((atom) => ("id" in atom ? [atom.id] : []));
    return laterIn(grammar, rule) && laters.some(({ node }) => ids.includes(node.name));
  });
  const stateKey = grammar.stateKey ?? grammar.name;

  // One request for the part; or, where the questions are about a list inside a list, one for each element of the outer.
  const outerName = laters.find(({ later }) => later.outer)?.later.outer;
  const outerList = outerName && lists.find((l) => l.field.name === outerName.list && !l.outer);
  const batches: Array<number | undefined> = outerList ? ((at(content, outerList.path) as unknown[]) ?? []).map((_, g) => g) : [undefined];

  return batches.flatMap((g): Asked[] => {
    const inBatch = laters.filter(({ later }) => !!later.outer === (g !== undefined));
    const listName = inBatch.find(({ later }) => later.list)?.later.list;
    const located = listName ? lists.find((l) => l.field.name === listName && !!l.outer === (g !== undefined)) : undefined;
    const base: Array<string | number> = located ? (located.outer ? [...located.outer.path, g!, ...located.path] : located.path) : [];
    const all: any[] = located ? ((at(content, base) as any[]) ?? []) : [];
    const elementName = inBatch.find(({ later }) => later.name)?.later.name ?? "element";
    const withField = inBatch.find(({ later }) => later.withField)?.later.withField;
    // Those the questions are about keep their place in the list: stat_2 is the third stat, whether or not the first two moved.
    const elements = all.map((element, i) => ({ element, i })).filter(({ element }) => !withField || element?.[withField]);
    const fields = located ? located.field.fields : part.fields;
    const decidedBy = (node: Node) => fields.filter((field) => field.source?.[0]?.name === "decided" && field.source[0].by === node.name);
    const pathOf = (field: Field) => (located ? field.name : `/${part.name}/${field.name}`);

    // A question is asked if a field that is drawn needs it, or if a rule about such a question reads it.
    const wanted = new Set(inBatch.filter(({ node }) => decidedBy(node).some((field) => options.needed?.(pathOf(field)) ?? true)).map(({ node }) => node.name));
    for (const rule of rules) if ("id" in rule.then && wanted.has(rule.then.id)) for (const atom of rule.when) if ("id" in atom && inBatch.some(({ node }) => node.name === atom.id)) wanted.add(atom.id);
    const asked = inBatch.filter(({ node }) => wanted.has(node.name));
    if (!asked.length || (located && !elements.length)) return [];

    const key = (i: number) => `${elementName}_${i}`;
    const instructions = (node: Node, i?: number) => {
      const named = (text: string) => (i === undefined ? text : text.replaceAll(`{${elementName}}`, key(i)));
      return node.context ? { context: named(node.context), question: named(node.question!) } : named(node.question!);
    };
    const build = (node: Node, i?: number) => {
      const asking = node.asking!;
      if (asking.type === "choice") return choice(instructions(node, i), Object.fromEntries(asking.options.map((o) => [o.name, o.criteria])));
      if (asking.type === "score") return score(instructions(node, i), asking.levels.map((l) => l.criteria) as unknown as [string, string, ...string[]]);
      return asking.yes === undefined && asking.no === undefined ? noul(instructions(node, i)) : noul(instructions(node, i), { ...(asking.yes !== undefined ? { true: asking.yes } : {}), ...(asking.no !== undefined ? { false: asking.no } : {}) });
    };

    const questions: Questions = {};
    for (const { node, later } of asked) {
      if (later.kind === "once") questions[node.name] = build(node);
      // With one element there is nothing to choose among: it is the one.
      if (later.kind === "among" && elements.length > 1) questions[node.name] = choice(instructions(node), Object.fromEntries(elements.map(({ element, i }) => [key(i), simple(element, fields) as string])));
    }
    for (const { i } of elements) for (const { node, later } of asked) if (later.kind === "each") questions[`${node.name}_${i}`] = build(node, i);

    const outer = located?.outer && g !== undefined ? { [outerName!.name]: simple(at(content, [...located.outer.path, g]), located.outer.field.fields) } : {};
    const state = { [stateKey]: options.description, ...outer, ...(located ? Object.fromEntries(elements.map(({ element, i }) => [key(i), simple(element, fields)])) : { [part.name]: content }) };

    const read: Asked["read"] = (answers) => {
      const decisions: Decision[] = [];
      const threshold = (node: Node) => options.calibration.questions?.[node.name] ?? options.calibration.yes;
      const answerOf = (node: Node, later: Later, i?: number): { value: unknown; p: number } => {
        if (later.kind === "among") {
          const answer = answers[node.name];
          const picked = answer ? Number(String(answer.choice).split("_").pop()) : elements[0]?.i;
          return { value: i === picked, p: answer ? answer.probabilities[answer.choice] : 1 };
        }
        const answer = answers[later.kind === "each" ? `${node.name}_${i}` : node.name];
        if (node.asking!.type === "noul") return { value: answer.noul >= threshold(node), p: answer.noul };
        if (node.asking!.type === "choice") return { value: answer.choice, p: answer.probabilities[answer.choice] };
        return { value: answer.score, p: answer.score };
      };

      // In the trace, a decision about an element is labelled by the element as Jev read it ("Auto-download: switch"); one about the part, by its question.
      const label = (node: Node, row: { element: any }) => (located ? wordsOf(row.element, fields) : (node.question ?? node.name));
      // What was answered, element by element (a question about the part as a whole has the same answer for each).
      const rows = (located ? elements : [{ element: content as any, i: 0 }]).map(({ element, i }) => ({
        element,
        i,
        values: new Map(asked.map(({ node, later }) => [node.name, answerOf(node, later, i)])),
        yields: new Map<string, unknown>(),
        gone: new Set<string>(),
      }));
      type Row = (typeof rows)[number];

      const yieldOf = (node: Node, row: Row): unknown => {
        if (row.yields.has(node.name)) return row.yields.get(node.name);
        const value = row.values.get(node.name)!.value;
        const asking = node.asking!;
        // "None of these" is not a value, unless the question says what it yields here.
        if (asking.type === "choice") return asking.options.find((o) => o.name === value)?.value ?? (value === "none" ? undefined : value);
        if (typeof value === "boolean") return (value ? asking.type === "noul" && asking.yesValue : asking.type === "noul" && asking.noValue) || value;
        return value;
      };
      const holds = (atom: Atom, row: Row): boolean => {
        if ("block" in atom) {
          const field = fields.find((f) => f.name === atom.block);
          return field ? (!!row.element?.[field.name] && !row.gone.has(field.name)) === atom.present : holdsIn(options.reading, atom);
        }
        const node = asked.find(({ node }) => node.name === atom.id)?.node;
        if (!node) return holdsIn(options.reading, atom);
        return atom.is.some((is) => is === said(row.values.get(node.name)!.value) || is === said(yieldOf(node, row))) !== atom.not;
      };

      // One where: among the elements where it holds, the likeliest is the one, unless one is already known to be.
      for (const { node } of asked) {
        for (const field of decidedBy(node).filter((f) => f.oneWhere)) {
          const among = rows.filter((row) => field.oneWhere!.every((atom) => holds(atom, row)));
          const the = among.find((row) => options.known?.(field, row.element)) ?? [...among].sort((x, y) => y.values.get(node.name)!.p - x.values.get(node.name)!.p)[0];
          for (const row of among) row.values.set(node.name, { value: row === the, p: row.values.get(node.name)!.p });
        }
      }

      const apply = (rule: Rule, row: Row) => {
        if (!rule.when.every((atom) => holds(atom, row)) || holds(rule.then, row)) return;
        const then = rule.then;
        if ("block" in then) return void (!then.present && row.gone.add(then.block));
        const node = asked.find(({ node }) => node.name === then.id)?.node;
        if (!node) return;
        const asking = node.asking!;
        const raw = asking.type === "choice" ? asking.options.some((o) => o.name === then.is[0]) : then.is[0] === "yes" || then.is[0] === "no";
        // Said in the question's own answers, it is an answer; otherwise it is what the answer is to yield.
        if (raw) (row.values.set(node.name, { value: asking.type === "choice" ? then.is[0] : then.is[0] === "yes", p: 1 }), row.yields.delete(node.name));
        else row.yields.set(node.name, then.is[0]);
        decisions.push({ id: located ? `${node.name}_${row.i}` : node.name, question: label(node, row), answer: then.is[0], p: 1, ...(rule.reason ? { note: rule.reason } : {}) });
      };
      for (const row of rows) for (const rule of rules) apply(rule, row);

      const decorations = rows.map((row) => ({ at: located ? [...base, row.i] : [], values: Object.fromEntries([...row.gone].map((name) => [name, undefined])) as Record<string, unknown> }));
      for (const { node } of asked) {
        for (const field of decidedBy(node)) {
          const yielded = rows.map((row) => yieldOf(node, row));
          const none = field.allOrNone && yielded.some((value) => value === undefined);
          rows.forEach((_, n) => void (!none && yielded[n] !== undefined && (decorations[n].values[field.name] = yielded[n])));
        }
        for (const row of rows) {
          const { value, p } = row.values.get(node.name)!;
          const id = located ? `${node.name}_${row.i}` : node.name;
          if (!decisions.some((d) => d.id === id)) decisions.push({ id, question: label(node, row), answer: said(yieldOf(node, row) ?? value), p });
        }
      }
      return { decorations: decorations.filter((d) => Object.keys(d.values).length), decisions };
    };
    return [{ ...(g !== undefined ? { outer: g } : {}), state, questions, read }];
  });
}

/** Merges what was decided into what was written. */
export function decorate<T>(content: T, decorations: Decoration[]): T {
  const copy = structuredClone(content);
  for (const { at: path, values } of decorations) {
    const target = at(copy, path);
    if (target && typeof target === "object") Object.assign(target, values);
  }
  return copy;
}
