// Where the graphs are kept, and how one is read with the sets it links to.
//
// In the source tree they are in grammar/ at the root. The deployed server is one
// file (dist-server/main.js), and `build:server` copies them to sit beside it, so
// they are looked for there first.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGrammar, type Grammar } from "./format.js";

const CANDIDATES = [new URL("./grammar/", import.meta.url), new URL("../../../grammar/", import.meta.url)].map((url) => fileURLToPath(url));
export const GRAMMAR_DIR = CANDIDATES.find((dir) => existsSync(dir)) ?? CANDIDATES.at(-1)!;

/** `file` is a name in grammar/, or a path to a graph anywhere. A link in a file is read from beside that file. */
export function loadGrammar(file: string): Grammar {
  const path = resolve(GRAMMAR_DIR, file);
  return parseGrammar(readFileSync(path, "utf8"), (href) => readFileSync(resolve(dirname(path), href), "utf8"));
}
loadGrammar.dir = GRAMMAR_DIR;
