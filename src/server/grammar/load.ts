// Where the graphs are kept, and how one is read with the sets it links to.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGrammar, type Grammar } from "./format.js";

export const GRAMMAR_DIR = fileURLToPath(new URL("../../../grammar/", import.meta.url));

/** `file` is a name in grammar/, or a path to a graph anywhere. A link in a file is read from beside that file. */
export function loadGrammar(file: string): Grammar {
  const path = resolve(GRAMMAR_DIR, file);
  return parseGrammar(readFileSync(path, "utf8"), (href) => readFileSync(resolve(dirname(path), href), "utf8"));
}
