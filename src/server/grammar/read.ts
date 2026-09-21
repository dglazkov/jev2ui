// A graph, asked and read (docs/grammar.md).
//
// `questionsOf` is everything the file asks, as one request. `readGrammar` is what
// readPlan does by hand, done for any graph: the kind of thing, walked down Jev's
// ranking to the first one allowed; its parts by tier; a thin thing padded with
// its likeliest remaining parts; every other answer, read only where it applies;
// then the rules, in the order written.
//
// What "confident" means is not in the file. It is a fact about whoever answers.

import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import type { Decision } from "../../shared/events.js";
import { idOf, walk, type Atom, type Grammar, type Node } from "./format.js";

export function questionsOf(grammar: Grammar): Questions {
  const out: Questions = {};
  walk(grammar.nodes, (node) => {
    if (!node.question || !node.asking) return;
    const instructions = grammar.context ? { context: grammar.context, question: node.question } : node.question;
    const asking = node.asking;
    if (asking.type === "noul") out[idOf(node)] = asking.yes === undefined && asking.no === undefined ? noul(instructions) : noul(instructions, { ...(asking.yes !== undefined ? { true: asking.yes } : {}), ...(asking.no !== undefined ? { false: asking.no } : {}) });
    if (asking.type === "choice") out[idOf(node)] = choice(instructions, Object.fromEntries(asking.options.map((o) => [o.name, o.criteria])));
    if (asking.type === "score") out[idOf(node)] = score(instructions, asking.levels.map((l) => l.criteria) as unknown as [string, string, ...string[]]);
  });
  return out;
}

/** How sure an answer has to be, for one answerer. Probed, not reasoned: see src/probe/custom.ts for where 0.55 came from. */
export interface Calibration {
  /** A part the kind of thing usually has is kept at about even odds. */
  expected: number;
  /** A part it does not usually have needs a confident yes. */
  extra: number;
  /** Any other yes-or-no answer. */
  yes: number;
  /** Questions that were probed on their own. */
  questions?: Record<string, number>;
}

export const JEV: Calibration = { expected: 0.4, extra: 0.75, yes: 0.5, questions: { has_custom: 0.55 } };

/** What is settled before Jev is asked: by how the person got here, or by what the developer said. */
export interface Known {
  /** The kinds this may be. */
  among?: string[];
  /** The parts it has, whatever the odds. Rules do not overrule them. */
  blocks?: string[];
  values?: Record<string, boolean | string>;
}

export type Value = boolean | string | number;

export interface Reading {
  kind: string;
  blocks: string[];
  /** Every answer as the graph reads it: a part is there or not, a question out of scope has its default, a rule has had its say. */
  values: Record<string, Value>;
  /** How sure the answerer was of what it said, before anything overruled it. */
  p: Record<string, number>;
  decisions: Decision[];
}

const NEVER_PADDING = "never padding";

/** An answer that does not apply still has to be something: no, or "none", or else the first option. */
function defaultOf(node: Node): Value | undefined {
  const asking = node.asking;
  if (asking?.type === "noul") return false;
  if (asking?.type === "choice") return (asking.options.find((o) => o.name === "none") ?? asking.options[0])?.name;
  return undefined;
}

export function readGrammar(grammar: Grammar, answers: Record<string, any>, calibration: Calibration, known: Known = {}): Reading {
  const decisions = new Map<string, Decision>();
  const p: Record<string, number> = {};
  const parentOf = new Map<Node, Node | undefined>();
  const byId = new Map<string, Node>();
  walk(grammar.nodes, (node, parent) => (parentOf.set(node, parent), byId.set(idOf(node), node)));
  const kinds = [...byId.values()].find((node) => node.asking?.type === "choice" && node.asking.options.some((o) => o.shape));

  // --- The kind, and its parts ---------------------------------------------------
  let kind = "";
  let blocks: string[] = [];
  let order: string[] = [];
  if (kinds?.asking?.type === "choice") {
    const id = idOf(kinds);
    const ranking = Object.entries(answers[id].probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]);
    const [name, sure] = ranking.find(([option]) => !known.among || known.among.includes(option)) ?? ranking[0];
    kind = name;
    p[id] = sure;
    decisions.set(id, { id, question: kinds.name, answer: kind, p: sure, ...(kind !== ranking[0][0] ? { note: `read as "${ranking[0][0]}", which is ruled out here` } : {}) });
    const shape = kinds.asking.options.find((o) => o.name === kind)?.shape;
    order = shape?.parts.map((part) => part.block) ?? [];
    const odds = (block: string): number => answers[`has_${block}`].noul;
    for (const { block, tier } of shape?.parts ?? []) {
      const gate = `has_${block}`;
      p[gate] = odds(block);
      const needs = calibration.questions?.[gate] ?? (tier === "extra" ? calibration.extra : calibration.expected);
      const keep = known.blocks ? known.blocks.includes(block) : tier === "always" || odds(block) >= needs;
      if (keep) blocks.push(block);
      const note = known.blocks ? "settled beforehand" : tier === "always" && odds(block) < calibration.expected ? `a ${kind} always has one` : !keep && odds(block) >= calibration.yes ? `an extra on a ${kind}; needs ${needs}` : undefined;
      decisions.set(gate, { id: gate, question: `${block}?`, answer: keep ? "yes" : "no", p: odds(block), ...(note ? { note } : {}) });
    }
    // Independent answers under-include as easily as they over-include.
    const spare = order.filter((block) => !blocks.includes(block) && !byId.get(`has_${block}`)?.traits.includes(NEVER_PADDING)).sort((x, y) => odds(y) - odds(x));
    while (!known.blocks && blocks.length < (shape?.atLeast ?? 1) && spare.length) {
      const block = spare.shift()!;
      blocks = order.filter((b) => blocks.includes(b) || b === block);
      Object.assign(decisions.get(`has_${block}`)!, { answer: "yes", note: `added: a ${kind} needs at least ${shape!.atLeast} parts` });
    }
  }

  // --- Everything else, where it applies -----------------------------------------
  const overruled = new Map<string, Value>();
  const said = (node: Node): Value | undefined => {
    const id = idOf(node);
    if (known.values && id in known.values) return known.values[id];
    const answer = answers[id];
    if (!answer) return defaultOf(node);
    if (node.asking?.type === "noul") return answer.noul >= (calibration.questions?.[id] ?? calibration.yes);
    if (node.asking?.type === "choice") return answer.choice;
    return answer.score;
  };
  const applies = (node: Node): boolean => {
    const parent = parentOf.get(node);
    if (!parent || parent === kinds) return true;
    const open = parent.block ? blocks.includes(parent.name) : parent.asking?.type === "noul" ? valueOf(parent) === true : true;
    return open && applies(parent);
  };
  const valueOf = (node: Node): Value | undefined => {
    if (node === kinds) return kind;
    if (node.block) return blocks.includes(node.name);
    const id = idOf(node);
    if (overruled.has(id)) return overruled.get(id);
    return applies(node) ? said(node) : defaultOf(node);
  };

  // --- Rules ---------------------------------------------------------------------
  const holds = (atom: Atom): boolean => {
    if ("block" in atom) return blocks.includes(atom.block) === atom.present;
    const node = byId.get(atom.id);
    const value = node && valueOf(node);
    const is = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
    return (is === atom.is) !== atom.not;
  };
  for (const rule of grammar.rules) {
    if (!rule.when.every(holds) || holds(rule.then)) continue;
    const then = rule.then;
    if ("block" in then) {
      // What was settled beforehand is what the thing has; a rule is only how to read the odds.
      if (known.blocks || !order.includes(then.block)) continue;
      blocks = then.present ? order.filter((b) => blocks.includes(b) || b === then.block) : blocks.filter((b) => b !== then.block);
      Object.assign(decisions.get(`has_${then.block}`) ?? {}, { answer: then.present ? "yes" : "no", note: `${then.present ? "added" : "dropped"}${rule.reason ? `: ${rule.reason}` : ""}` });
    } else {
      const node = byId.get(then.id);
      if (!node || then.not) continue;
      overruled.set(then.id, node.asking?.type === "noul" ? then.is === "yes" : then.is);
      decisions.set(then.id, { id: then.id, question: node.name, answer: then.is, p: 1, ...(rule.reason ? { note: rule.reason } : {}) });
    }
  }

  const values: Record<string, Value> = {};
  walk(grammar.nodes, (node) => {
    const id = idOf(node);
    const value = valueOf(node);
    if (value !== undefined) values[id] = value;
    const answer = answers[id];
    if (answer && !(id in p)) p[id] = node.asking?.type === "noul" ? answer.noul : node.asking?.type === "choice" ? answer.probabilities[answer.choice] : answer.score;
    if (!decisions.has(id) && node !== kinds && !node.block && applies(node) && value !== undefined) decisions.set(id, { id, question: node.name, answer: typeof value === "boolean" ? (value ? "yes" : "no") : String(value), p: p[id] ?? 1 });
  });
  return { kind, blocks, values, p, decisions: [...decisions.values()] };
}

/** Whether a reading came out the way an example, or anyone else, says it should. */
export function holdsIn(reading: Reading, atom: Atom): boolean {
  if ("block" in atom) return reading.blocks.includes(atom.block) === atom.present;
  const value = reading.values[atom.id];
  return ((typeof value === "boolean" ? (value ? "yes" : "no") : String(value)) === atom.is) !== atom.not;
}

/** What an answer yields: an option's value when it has one, and for a dial, the value between the two levels the score fell between. */
export function yieldOf(grammar: Grammar, id: string, value: Value): string | number | boolean {
  let found: Node | undefined;
  walk(grammar.nodes, (node) => void (idOf(node) === id && (found = node)));
  const asking = found?.asking;
  if (asking?.type === "choice" && typeof value === "string") return asking.options.find((o) => o.name === value)?.value ?? value;
  if (asking?.type === "score" && typeof value === "number" && asking.levels.every((l) => l.value !== undefined)) {
    const stops = asking.levels.map((l) => Number(l.value));
    const i = Math.min(stops.length - 2, Math.max(0, Math.floor(value)));
    return stops[i] + (stops[i + 1] - stops[i]) * Math.min(1, Math.max(0, value - i));
  }
  return value;
}
