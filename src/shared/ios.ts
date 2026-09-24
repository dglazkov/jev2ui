// iOS's components: the kit's (kit.ts), with a frame of iOS's own.
//
// The iOS idiom draws its parts with the kit's patterns, and so with the kit's components; what it draws its own way
// is the frame (src/server/grammar/patterns-ios.ts), and these are the two components that frame needs and the kit's
// does not: a screen that arrives in one of the ways iOS presents one, and a navigation bar whose ends can be words.
// The browser draws them with src/web/kit/ios.ts.

import { z } from "zod";
import { id, str, type ComponentSet } from "./components.js";
import { IDIOMS } from "./idioms.js";
import { KIT, kitRefs } from "./kit.js";

/** The id a surface is created with when the iOS idiom draws it. */
export const IOS_CATALOG_ID = IDIOMS.ios.catalogId;

export const IOS = {
  ...KIT,
  /** `presentation` is how the screen arrived, when it was not pushed: a sheet, an action sheet, a full-screen cover; `dialog` is the alert. */
  Screen: z.object({ appBar: id.optional(), body: id, sticky: id.optional(), navBar: id.optional(), dialog: z.boolean().optional(), presentation: z.enum(["sheet", "actionsheet", "fullscreen"]).optional() }).strict(),
  /** `trailing` is a word at the bar's trailing edge that acts (Done, Save, Edit), beside or instead of the symbols in `actions`; `cancel` leads with the word. */
  AppBar: z.object({ title: str.optional(), leading: z.enum(["none", "back", "close", "cancel"]).optional(), actions: z.array(z.string()).max(3).optional(), trailing: str.optional() }).strict(),
} as const;

export const IOS_SET: ComponentSet = { schemas: IOS, refs: kitRefs };
