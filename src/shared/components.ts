// What every set of components shares, whichever catalog it belongs to (docs/grammar.md, step 9).
//
// A catalog brings its own components: the kit's (kit.ts), iOS's (ios.ts), and any idiom's to come. What they have in
// common is not a component but the envelope they arrive in, a fork of A2UI's: a surface is a flat list of components
// addressed by id, created with the id of the catalog that draws it; structure (updateComponents) is separate from
// content (updateDataModel); any value can be bound to a data path; a container can stamp a template once per element
// of an array. That split is what lets structure ship before a word has been written.
//
// And one thing more that is not any catalog's: a component baked at run time, for something no catalog has (a map, a
// timer face). It arrives in a `defineComponent` message and runs in a sandbox, whatever set the slot it fills is in.
//
// The server checks what it sends against the set the surface names (server/validate.ts); the browser draws with the
// same set's drawing (web/sets.ts). Which set that is, is sets.ts's to say.

import { z } from "zod";

export const bound = z.object({ path: z.string() }).strict();
export const str = z.union([z.string(), bound]);
export const num = z.union([z.number(), bound]);
export const bool = z.union([z.boolean(), bound]);
export const id = z.string();
/** Explicit children, or one template stamped per element of the array at `path`. */
export const children = z.union([z.array(id), z.object({ path: z.string(), componentId: id }).strict()]);

/** One component, as it travels: its id, the name of what it is in its set, and its props. */
export type Component = { id: string; component: string } & Record<string, unknown>;

type Schema = { safeParse(value: unknown): { success: true } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } };

/** A catalog's components, as the server checks them: what each takes, and which of its props name other components. */
export interface ComponentSet {
  schemas: Readonly<Record<string, Schema>>;
  refs(component: Record<string, any>): string[];
}

/** The props that name other components in most sets: one `child`, or `children` (listed, or a template). */
export function childRefs(c: Record<string, any>): unknown[] {
  const refs: unknown[] = [c.child];
  if (Array.isArray(c.children)) refs.push(...c.children);
  else if (c.children?.componentId) refs.push(c.children.componentId);
  return refs;
}

/**
 * A baked component, whole: its source to run in a sandbox (src/web/kit/sandbox.ts), and what it takes to use it
 * again on another screen (src/server/mock/bake.ts). `card` says when, in the words a Choice would offer Jev;
 * `dataSchema` is what a writer fills; `contract` is what Jev asked for when it was baked.
 *
 * Its `id` is a hash of what it is (the source and the schema), so it means the same component wherever it turns
 * up: on another screen, in another session, in a saved app that somebody else opens. Nothing hands ids out.
 */
export const BAKED = z
  .object({
    id: z.string().regex(/^[a-f0-9]{16}$/),
    name: z.string().max(80),
    card: z.string().max(400),
    source: z.string().max(60_000),
    dataSchema: z.record(z.unknown()),
    contract: z.object({ use: z.enum(["watch", "pick", "adjust", "read"]), size: z.enum(["strip", "wide", "square", "tall"]), linked: z.boolean() }).strict(),
  })
  .strict();
export type Baked = z.infer<typeof BAKED>;

/**
 * The message that extends the catalog. It carries the whole component and not only what the renderer runs, so the
 * messages of a screen are everything there is to know about it: the app's shelf is the components its screens define.
 */
export const DEFINE_COMPONENT = BAKED.extend({ surfaceId: z.string() }).strict();
