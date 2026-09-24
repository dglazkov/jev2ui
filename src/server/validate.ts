import { A2uiMessageSchema } from "@a2ui/web_core/v0_9";
import { BASIC_COMPONENTS } from "@a2ui/web_core/v0_9/basic_catalog";
import { DEFINE_COMPONENT, type ComponentSet } from "../shared/components.js";
import { setOf } from "../shared/sets.js";
import type { A2uiMessage } from "../shared/events.js";

type Schema = ComponentSet["schemas"][string];
const BASIC = new Map<string, Schema>(BASIC_COMPONENTS.map((c) => [c.name, c.schema as Schema]));

/** Keys that hold references to other components, per component type. */
function basicRefs(c: Record<string, any>): string[] {
  const refs: string[] = [];
  if (typeof c.child === "string") refs.push(c.child);
  if (Array.isArray(c.children)) refs.push(...c.children);
  else if (c.children?.componentId) refs.push(c.children.componentId);
  if (typeof c.trigger === "string") refs.push(c.trigger);
  if (typeof c.content === "string") refs.push(c.content);
  if (Array.isArray(c.tabs)) refs.push(...c.tabs.map((t: any) => t?.child));
  return refs.filter((r) => typeof r === "string");
}

/**
 * Validates a full message sequence the way a strict client would: envelope
 * schema, per-component catalog schema, and referential integrity of the
 * final component graph.
 */
export function validateMessages(messages: A2uiMessage[]): string[] {
  const errors: string[] = [];
  const defined = new Map<string, Record<string, any>>();
  // The surface says which catalog it speaks: an idiom's, whose set of components is its own (sets.ts), or A2UI's basic one. The envelope is the same.
  const set = messages.map((m) => setOf((m as any).createSurface?.catalogId)).find(Boolean);
  const SCHEMAS: ReadonlyMap<string, Schema> = set ? new Map(Object.entries(set.schemas)) : BASIC;
  const childRefs = set ? set.refs : basicRefs;

  // Baked components: every slot that names a definition must get one before the run ends. What a slot names is the data at its `use`.
  const definitions = new Set<string>();
  const named = new Map<string, string>();

  messages.forEach((message, i) => {
    // Our one addition to the envelope, in every set.
    if (set && "defineComponent" in message) {
      const parsed = DEFINE_COMPONENT.safeParse(message.defineComponent);
      if (parsed.success) definitions.add(parsed.data.id);
      else for (const issue of parsed.error.issues.slice(0, 3)) errors.push(`message[${i}] defineComponent.${issue.path.join(".")}: ${issue.message}`);
      return;
    }
    const data = (message as any).updateDataModel;
    if (set && typeof data?.value?.use === "string") named.set(`${data.path ?? ""}/use`, data.value.use);
    const envelope = A2uiMessageSchema.safeParse(message);
    if (!envelope.success) {
      for (const issue of envelope.error.issues.slice(0, 3)) {
        errors.push(`message[${i}] ${issue.path.join(".")}: ${issue.message}`);
      }
      return;
    }
    const components = (message as any).updateComponents?.components;
    if (!Array.isArray(components)) return;
    for (const c of components) {
      const { id, component, ...props } = c;
      if (typeof id !== "string") {
        errors.push(`message[${i}] component without id (${component})`);
        continue;
      }
      defined.set(id, c);
      const schema = SCHEMAS.get(component);
      if (!schema) {
        errors.push(`${id}: unknown component "${component}"`);
        continue;
      }
      const parsed = schema.safeParse(props);
      if (!parsed.success) {
        for (const issue of parsed.error.issues.slice(0, 3)) {
          errors.push(`${id} (${component}) ${issue.path.join(".")}: ${issue.message}`);
        }
      }
    }
  });

  for (const c of defined.values()) {
    const use = typeof c.use?.path === "string" ? named.get(c.use.path) : undefined;
    if (use && !definitions.has(use)) errors.push(`${c.use.path.replace(/\/use$/, "")}: uses undefined custom component "${use}"`);
  }
  if (defined.size > 0 && !defined.has("root")) errors.push('no component with id "root"');
  for (const [id, c] of defined) {
    for (const ref of childRefs(c)) {
      if (!defined.has(ref)) errors.push(`${id}: references undefined component "${ref}"`);
    }
  }
  return errors;
}
