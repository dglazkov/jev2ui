// Windows's components (docs/grammar.md, step 10): the set the Windows idiom draws with, named after the WinUI controls
// they stand for. Nothing here is the kit's; where a name is the same (`Button`), it is because both systems call the
// thing so. The server checks what the Windows catalog sends against these (sets.ts); the browser draws them with
// src/web/windows/components.ts, painted by windows.css.

import { z } from "zod";
import { bool, bound, childRefs, children, id, num, str, type ComponentSet } from "./components.js";
import { IDIOMS } from "./idioms.js";

/** The id a surface is created with when the Windows idiom draws it. */
export const WINDOWS_CATALOG_ID = IDIOMS.windows.catalogId;

/** Microsoft's four app silhouettes: a navigation pane down the left, navigation across the top, a menu bar, tabs. */
export const SILHOUETTES = ["left", "top", "menubar", "tabs"] as const;
/** The type ramp of Windows 11, by Microsoft's names. */
export const TYPE_RAMP = ["caption", "body", "bodyStrong", "bodyLarge", "subtitle", "title", "titleLarge", "display"] as const;
export const SEVERITIES = ["informational", "success", "warning", "error"] as const;

const texts = z.array(id);

export const WINDOWS = {
  // --- The window ------------------------------------------------------------
  /** The app's window: its title bar, what it navigates with, and the page. */
  Window: z.object({ mode: z.enum(SILHOUETTES), titleBar: id, navigation: id.optional(), menuBar: id.optional(), body: id }),
  /** `back` is on for a page reached from another, off (shown, disabled) on a section, none where nothing goes back. `tabs` are the documents open in a tabbed app. */
  TitleBar: z.object({ title: str.optional(), document: str.optional(), back: z.enum(["on", "off", "none"]), search: z.boolean().optional(), tabs: bound.optional() }),
  /** The app's sections, down the left or across the top, with Settings at the foot of a left pane; `footer` when the page is Settings, and none of the sections is selected. */
  NavigationView: z.object({ mode: z.enum(["left", "top"]), items: bound, label: bound.optional(), icon: bound.optional(), selected: num.optional(), settings: z.boolean().optional(), footer: z.boolean().optional() }),
  MenuBar: z.object({ items: bound }),
  /** A dialog over the window: its title, what it says, and its responses. */
  ContentDialog: z.object({ title: str, children: texts }),

  // --- Layout and text --------------------------------------------------------
  StackPanel: z.object({ children, orientation: z.enum(["vertical", "horizontal"]).optional(), spacing: z.number().optional() }),
  TextBlock: z.object({ text: str, style: z.enum(TYPE_RAMP).optional() }),
  RichTextBlock: z.object({ text: str }),

  // --- Commands and status ----------------------------------------------------
  /** Primary commands in the bar, secondary ones behind its "See more". */
  CommandBar: z.object({ commands: bound, label: bound, icon: bound.optional(), overflow: bound.optional() }),
  InfoBar: z.object({ title: str, message: str, severity: str.optional(), action: str.optional() }),
  BreadcrumbBar: z.object({ items: bound }),
  SelectorBar: z.object({ items: bound }),
  Button: z.object({ label: str, style: z.enum(["accent", "standard"]).optional(), event: z.enum(["action", "submit"]).optional() }),

  // --- Collections --------------------------------------------------------------
  FlipView: z.object({ items: bound, picture: bound.optional(), caption: bound.optional(), placeholder: z.string().optional() }),
  /** A row of things to scroll sideways, under a heading. */
  ScrollView: z.object({ header: str.optional(), children }),
  /** Things of one sort: a list, a grid of tiles, or pictures in their own shapes. */
  ItemsView: z.object({ header: str.optional(), layout: z.enum(["stack", "grid", "flow"]), selection: z.enum(["single", "multiple"]).optional(), children }),
  ItemContainer: z.object({ name: str, detail: str.optional(), meta: str.optional(), picture: str.optional(), symbol: str.optional(), placeholder: z.string().optional() }),
  /** Records in rows and columns. `cells` is where each row's values are, relative to the row. */
  TableView: z.object({ columns: bound, rows: bound, cells: bound, selection: z.enum(["single", "multiple"]).optional() }),
  /** A list and the one selected, in full beside it. */
  ListDetailsView: z.object({ items: bound, name: bound, summary: bound.optional(), meta: bound.optional(), heading: str, byline: str.optional(), body: str }),
  PropertyGrid: z.object({ header: str.optional(), items: bound, name: bound, value: bound }),

  // --- Settings -----------------------------------------------------------------
  SettingsSection: z.object({ header: str, children }),
  /** A setting: its name, a line on what it does, and the control at its right. */
  SettingsCard: z.object({ header: str, description: str.optional(), icon: str.optional(), control: str, value: str.optional(), on: bool.optional(), options: bound.optional() }),
  /** About the app, folded: its name and version, and its links inside. */
  SettingsExpander: z.object({ header: str, description: str.optional(), icon: z.string().optional(), links: bound.optional() }),

  // --- Entering things ----------------------------------------------------------
  /** A control with its header above it, as a form lays one out; which control is decided once the words exist. */
  InputControl: z.object({ header: str, control: str, placeholder: str.optional(), required: bool.optional(), options: bound.optional() }),
  /** A content dialog's responses, in Microsoft's fixed order: primary, secondary, close. */
  DialogCommands: z.object({ primary: str.optional(), secondary: str.optional(), close: str, default: str.optional() }),

  // --- Documents ----------------------------------------------------------------
  RichEditBox: z.object({ lines: bound, mono: z.boolean().optional() }),
  /** Where a baked component runs: a drawing, a chart, a map (components.ts). */
  CanvasSlot: z.object({ use: str, ratio: z.string(), data: bound.optional(), items: bound.optional(), selection: bound.optional(), failed: bool.optional() }),
} as const;

for (const [name, schema] of Object.entries(WINDOWS)) (WINDOWS as any)[name] = schema.strict();

export type WindowsName = keyof typeof WINDOWS;
export type WindowsComponent = { id: string; component: WindowsName } & Record<string, unknown>;

/** Props that name other components. */
export function windowsRefs(c: Record<string, any>): string[] {
  return [...childRefs(c), c.titleBar, c.navigation, c.menuBar, c.body].filter((r): r is string => typeof r === "string");
}

export const WINDOWS_SET: ComponentSet = { schemas: WINDOWS, refs: windowsRefs };
