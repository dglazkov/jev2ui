// Where a mock's design comes from: a DESIGN.md the developer supplied, or one
// Jev mixes from the brief. Either way the result is a parsed file, a reading
// of it, and a theme, and it is worked out once per file or brief.

import { parseDesign, readDesign, resolveDesign, structureKey, type Design, type DesignRead } from "./design-md.js";
import { mixDesign } from "./design-mix.js";
import { buildTheme } from "./theme.js";
import type { DesignReport } from "../shared/design.js";

/** A supplied DESIGN.md, or a brief for Jev to mix one from; a non-zero `seed` asks for that remix of it. */
export type DesignSource = { markdown: string } | { brief: string; seed?: number };

export interface LoadedDesign {
  design: Design;
  read: DesignRead;
  report: DesignReport;
  /** Set when the file was mixed rather than supplied. */
  mixed?: string;
}

const loaded = new Map<string, Promise<LoadedDesign>>();

async function load(source: DesignSource): Promise<LoadedDesign> {
  let design: Design;
  let read: DesignRead;
  let mixed: string | undefined;
  if ("markdown" in source) {
    design = parseDesign(source.markdown);
    read = await readDesign(design);
  } else {
    const mix = await mixDesign(source.brief, source.seed ?? 0);
    mixed = mix.markdown;
    design = parseDesign(mix.markdown);
    // The mixer wrote the prose, so nothing needs to read it back; its token names settle every role.
    const resolved = resolveDesign(design, null);
    read = { ...resolved, ...mix.known, decisions: [...mix.decisions, ...resolved.decisions], ms: mix.ms, jevInputTokens: mix.jevInputTokens };
  }
  const report: DesignReport = {
    name: design.name,
    theme: buildTheme(design, read),
    findings: design.findings,
    decisions: read.decisions,
    structure: structureKey(read),
    ms: read.ms,
    jevInputTokens: read.jevInputTokens,
  };
  return { design, read, report, ...(mixed ? { mixed } : {}) };
}

/** `fresh` is false when this design has been worked out before and costs nothing now. */
export function loadDesign(source: DesignSource): { loaded: Promise<LoadedDesign>; fresh: boolean } {
  const key = "markdown" in source ? `md:${source.markdown}` : `brief:${source.seed ?? 0}:${source.brief}`;
  let promise = loaded.get(key);
  const fresh = !promise;
  if (!promise) {
    promise = load(source);
    loaded.set(key, promise);
    promise.catch(() => loaded.delete(key));
    if (loaded.size > 50) loaded.delete(loaded.keys().next().value!);
  }
  return { loaded: promise, fresh };
}
