import { A2uiMessageSchema } from "@a2ui/web_core/v0_9";
import { BASIC_COMPONENTS } from "@a2ui/web_core/v0_9/basic_catalog";
import { KIT, KIT_CATALOG_ID, kitRefs } from "../shared/kit.js";
import type { A2uiMessage } from "../shared/events.js";

type Schema = { safeParse(value: unknown): { success: true } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
const BASIC = new Map<string, Schema>(BASIC_COMPONENTS.map((c) => [c.name, c.schema as Schema]));
const KIT_SCHEMAS = new Map<string, Schema>(Object.entries(KIT));

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
  // The surface says which catalog it speaks: A2UI's basic one, or the kit (the envelope is the same).
  const kit = messages.some((m) => (m as any).createSurface?.catalogId === KIT_CATALOG_ID);
  const SCHEMAS = kit ? KIT_SCHEMAS : BASIC;
  const childRefs = kit ? kitRefs : basicRefs;

  messages.forEach((message, i) => {
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

  if (defined.size > 0 && !defined.has("root")) errors.push('no component with id "root"');
  for (const [id, c] of defined) {
    for (const ref of childRefs(c)) {
      if (!defined.has(ref)) errors.push(`${id}: references undefined component "${ref}"`);
    }
  }
  return errors;
}
