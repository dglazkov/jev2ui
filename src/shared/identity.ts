import { z } from "zod";
export const DESTINATION_EVIDENCE = z.object({
  from: z.object({ title: z.string().max(200), archetype: z.string().max(80), scope: z.string().max(1000).optional() }),
  link: z.object({ kind: z.string().max(40), label: z.string().max(200), group: z.string().max(200).optional(), control: z.string().max(80).optional(), subject: z.string().max(2000).optional() }),
  intent: z.string().max(4000),
});
export const RENDERED_DESTINATION = z.object({ title: z.string().max(200), archetype: z.string().max(80), content: z.string().max(4000) });
export const KNOWN_DESTINATION = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), evidence: DESTINATION_EVIDENCE, rendered: RENDERED_DESTINATION.optional(), aliases: z.array(z.string().max(200)).max(30).optional(), status: z.enum(["planned", "generating", "made"]) });
export type DestinationEvidence = z.infer<typeof DESTINATION_EVIDENCE>;
export type KnownDestination = z.infer<typeof KNOWN_DESTINATION>;
export type IdentityResult = { kind: "existing"; destination: string } | { kind: "new" | "uncertain" };
