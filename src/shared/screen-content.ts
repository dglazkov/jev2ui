import type { A2uiMessage } from "./events.js";

/** Replays streamed replacements, including refinements. Never treats an earlier partial as final content. */
export function screenContents(messages: readonly A2uiMessage[]) {
  const components = new Map<string, Record<string, any>>();
  let data: Record<string, any> = {};
  for (const raw of messages) {
    const message = raw as Record<string, any>;
    for (const c of message.updateComponents?.components ?? []) components.set(c.id, c);
    if (!message.updateDataModel) continue;
    const { path = "/", value } = message.updateDataModel;
    const keys = String(path).split("/").filter(Boolean);
    if (keys.some((key) => ["__proto__", "constructor", "prototype"].includes(key))) continue;
    if (!keys.length) { data = structuredClone(value ?? {}); continue; }
    let at = data;
    for (const key of keys.slice(0, -1)) at = at[key] ??= {};
    at[keys.at(-1)!] = structuredClone(value);
  }
  return { components: [...components.values()], data };
}

