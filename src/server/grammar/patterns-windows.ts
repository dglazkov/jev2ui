// Windows 11, as a catalog a graph can name: patterns of its own, drawn with Windows's own components
// (shared/windows.ts), the way Microsoft's guidance for Windows apps lays a page out (docs/grammar.md, step 10).
//
// Nothing here is the kit's. The frame is the window of one of Microsoft's four app silhouettes: a navigation pane
// down the left, navigation across the top, a menu bar, or tabs in the title bar; or a content dialog over the
// window. The parts are WinUI's controls: an InfoBar, a CommandBar with commands in the bar and behind "See more",
// a BreadcrumbBar, a SelectorBar, a FlipView, an ItemsView as a list, a grid or pictures in their own shapes, a
// TableView, a list with the selected item's details beside it, settings as cards, About as an expander, a form with
// its headers above the controls, a content dialog's responses in their fixed order, a document to type in, and a
// canvas for what has to be baked. grammar/windows/screen.md is written to them.
//
// grammar/windows/catalog.md is written out from this by `npm run grammar:export`.

import type { WindowsComponent } from "../../shared/windows.js";
import { SILHOUETTES } from "../../shared/windows.js";
import type { Grammar } from "./format.js";
import type { Bound, Catalog, Pattern } from "./make.js";
import { YES_NO, at, bind, catalogOf, made, slots } from "./patterns.js";

type C = WindowsComponent;
const need = (found: ReturnType<Bound["each"]>, pattern: string, slot: string) => {
  if (!found) throw new Error(`"${pattern}" cannot be drawn without "${slot}"`);
  return found;
};
const yes = (value: unknown) => value === "yes" || value === true;
const LAYOUTS = ["stack", "grid", "flow"] as const;
const SELECTIONS = ["single", "multiple"] as const;
const RATIOS = ["16:9", "4:3", "1:1"] as const;

const PATTERNS: Pattern[] = [
  {
    name: "window",
    card: "A page of a Windows 11 app in its window: a title bar with the app's name, a back button and the caption buttons; the app's sections in a navigation pane down the left with Settings at its foot, or across the top, or a menu bar, or the open documents as tabs in the title bar; the page's title; what is on it. Or a content dialog over the window (Microsoft's app silhouettes, NavigationView, TitleBar, ContentDialog).",
    slots: slots(
      [
        "- `app_title` — the app's name, in the title bar",
        "- `page_title` required — the page's title, above what is on it; a dialog's title; a document's name",
        "- `menu_items` — the app's sections, in the navigation pane",
        "  - `content` required — what the section is called",
        "  - `icon` — the name of a symbol",
        "- `selected` — which of the sections this page is",
        "- `menus` — the menus of a menu bar",
        "- `documents` — what is open, one tab each, the first in front",
      ].join("\n"),
    ),
    knobs: {
      silhouette: { takes: SILHOUETTES, is: "how the window is laid out as a whole: a navigation pane down the left, navigation across the top, a menu bar, or tabs in the title bar" },
      section: { takes: YES_NO, is: "whether the page is one of the app's sections, selected in the navigation; if not, it was reached from one, and the title bar's back button takes the person back" },
      search: { takes: YES_NO, is: "a search box in the middle of the title bar, for searching the whole app" },
      header: { takes: YES_NO, is: "the page's title above what is on it, in Title type. A document names itself in the title bar instead" },
      modal: { takes: YES_NO, is: "a content dialog over the window, which has to be answered before anything else" },
      at_foot: { takes: YES_NO, is: "whether the page is the one kept at the foot of a left pane, Settings, rather than one of the sections" },
    },
    roles: { title: "page_title", destinations: "menu_items", main: "section" },
    over: (knobs) => yes(knobs.modal),
    draw: (id, b, knobs, look, parts = []) => {
      const silhouette = String(knobs.silhouette ?? "left") as (typeof SILHOUETTES)[number];
      const title = bind(b.one("page_title"));
      const inBody = parts.map((part) => part.root);
      if (yes(knobs.modal)) return [made({ id, component: "ContentDialog", title, children: inBody })];

      const panes = silhouette === "left" || silhouette === "top";
      const sections = panes ? b.each("menu_items") : undefined;
      const menus = silhouette === "menubar" ? b.one("menus") : undefined;
      const documents = silhouette === "tabs" ? b.one("documents") : undefined;
      const header = knobs.header === undefined || yes(knobs.header);
      return [
        made({ id, component: "Window", mode: silhouette, titleBar: `${id}_titlebar`, navigation: sections ? `${id}_navigation` : undefined, menuBar: menus ? `${id}_menubar` : undefined, body: `${id}_page` }),
        made({
          id: `${id}_titlebar`,
          component: "TitleBar",
          title: bind(b.one("app_title")),
          // A document names itself where the app's name is, as "Untitled - Notepad" does.
          document: silhouette === "menubar" ? title : undefined,
          // Microsoft: shown and disabled where there is nowhere to go back to; not shown where there never will be.
          back: panes ? (yes(knobs.section) ? "off" : "on") : "none",
          search: yes(knobs.search) || undefined,
          tabs: documents ? at(documents) : undefined,
        }),
        ...(sections
          ? [made({ id: `${id}_navigation`, component: "NavigationView", mode: silhouette as "left" | "top", items: at(sections.path), label: bind(sections.bound.one("content")), icon: look.icons ? bind(sections.bound.one("icon")) : undefined, selected: yes(knobs.at_foot) ? undefined : bind(b.one("selected")), settings: silhouette === "left", footer: yes(knobs.at_foot) || undefined })]
          : []),
        ...(menus ? [made({ id: `${id}_menubar`, component: "MenuBar", items: at(menus) })] : []),
        { id: `${id}_page`, component: "StackPanel", spacing: 24, children: [...(header ? [`${id}_header`] : []), ...inBody] },
        ...(header ? [made({ id: `${id}_header`, component: "TextBlock", style: "title", text: title })] : []),
      ] as C[];
    },
  },
  {
    name: "infobar",
    card: "A change in the app's state the person should know about or act on, set inline above the page's content and pushing it down: offline, a subscription expired, an update ready (InfoBar).",
    slots: slots("- `title` required — what changed, in a few words\n- `message` required — what it means, or what to do\n- `severity` — informational, success, warning or error\n- `action` — the label of the one button, if there is one thing to do"),
    knobs: {},
    draw: (id, b) => [made({ id, component: "InfoBar", title: bind(b.one("title")), message: bind(b.one("message")), severity: bind(b.one("severity")), action: bind(b.one("action")) })] as C[],
  },
  {
    name: "commandbar",
    card: "The page's commands in a bar above its content, in order of importance, each a symbol and a one-word label; the ones used now and then behind See more (CommandBar).",
    slots: slots("- `commands` required\n  - `label` required — one word where it can be\n  - `icon` — the name of a symbol\n  - `overflow` — secondary if it belongs behind See more, primary if in the bar"),
    knobs: {},
    draw: (id, b, _knobs, look) => {
      const commands = need(b.each("commands"), "commandbar", "commands");
      const c = commands.bound;
      return [made({ id, component: "CommandBar", commands: at(commands.path), label: at(c.one("label")!), icon: look.icons ? bind(c.one("icon")) : undefined, overflow: bind(c.one("overflow")) })] as C[];
    },
  },
  {
    name: "breadcrumbbar",
    card: "The way down to a page deep in a hierarchy, from the top, the page itself last and not a link (BreadcrumbBar).",
    slots: slots("- `crumbs` required — the levels, from the top down to this page"),
    knobs: {},
    draw: (id, b) => [{ id, component: "BreadcrumbBar", items: at(b.one("crumbs")!) }] as C[],
  },
  {
    name: "selectorbar",
    card: "A few views of the same content, one at a time, the first selected (SelectorBar).",
    slots: slots("- `views` required — the views' names"),
    knobs: {},
    draw: (id, b) => [{ id, component: "SelectorBar", items: at(b.one("views")!) }] as C[],
  },
  {
    name: "flipview",
    card: "Large pictures shown one at a time, with arrows and dots to move between them (FlipView).",
    slots: slots("- `slides` required\n  - `picture` — the address of the picture\n  - `caption` — a few words over it"),
    knobs: {},
    draw: (id, b, _knobs, look) => {
      const slides = need(b.each("slides"), "flipview", "slides");
      return [made({ id, component: "FlipView", items: at(slides.path), picture: bind(slides.bound.one("picture")), caption: bind(slides.bound.one("caption")), placeholder: look.symbol })] as C[];
    },
  },
  {
    name: "scrollview",
    card: "A named row of tiles that scrolls sideways: New and trending, Continue watching, Recently opened.",
    slots: slots("- `header` — the row's name\n- `tiles` required\n  - `name` required\n  - `detail` — one line under it\n  - `picture` — the address of its picture"),
    knobs: {},
    draw: (id, b, _knobs, look) => {
      const tiles = need(b.each("tiles"), "scrollview", "tiles");
      const t = tiles.bound;
      return [
        made({ id, component: "ScrollView", header: bind(b.one("header")), children: { path: tiles.path, componentId: `${id}_tile` } }),
        made({ id: `${id}_tile`, component: "ItemContainer", name: bind(t.one("name")), detail: bind(t.one("detail")), picture: bind(t.one("picture")), placeholder: look.symbol }),
      ] as C[];
    },
  },
  {
    name: "itemsview",
    card: "Things of one sort: a list told apart by words, a grid of tiles told apart by their look, or pictures laid out in their own shapes (ItemsView with a stack, a uniform grid or a lined flow; ListView and GridView).",
    slots: slots("- `header` — a heading above them\n- `items` required\n  - `name` required\n  - `detail` — one line: an artist, a size, a date\n  - `meta` — one short figure at the end of a row\n  - `picture` — the address of its picture, in a grid or a flow\n  - `symbol` — the name of a symbol, in a list"),
    knobs: {
      layout: { takes: LAYOUTS, is: "a list, a uniform grid of tiles, or pictures in rows of their own widths" },
      selection: { takes: SELECTIONS, is: "one at a time, opened by a click; or several, each with a check box, to act on together" },
    },
    draw: (id, b, knobs, look) => {
      const layout = String(knobs.layout ?? "stack") as (typeof LAYOUTS)[number];
      const items = need(b.each("items"), "itemsview", "items");
      const i = items.bound;
      return [
        made({ id, component: "ItemsView", header: bind(b.one("header")), layout, selection: knobs.selection === "multiple" ? "multiple" : undefined, children: { path: items.path, componentId: `${id}_item` } }),
        made({
          id: `${id}_item`,
          component: "ItemContainer",
          name: bind(i.one("name")),
          detail: bind(i.one("detail")),
          meta: bind(i.one("meta")),
          picture: layout === "stack" ? undefined : bind(i.one("picture")),
          symbol: layout === "stack" && look.icons ? bind(i.one("symbol")) : undefined,
          placeholder: look.symbol,
        }),
      ] as C[];
    },
  },
  {
    name: "tableview",
    card: "Records in rows and columns, the column headings above, compared by their fields (TableView; File Explorer's details view).",
    slots: slots("- `columns` required — the headings\n- `rows` required\n  - `cells` required — one value per column, in the columns' order"),
    knobs: { selection: { takes: SELECTIONS, is: "one row at a time, or several, each with a check box" } },
    draw: (id, b, knobs) => {
      const rows = need(b.each("rows"), "tableview", "rows");
      return [made({ id, component: "TableView", columns: at(b.one("columns")!), rows: at(rows.path), cells: at(rows.bound.one("cells")!), selection: knobs.selection === "multiple" ? "multiple" : undefined })] as C[];
    },
  },
  {
    name: "listdetails",
    card: "A list, and the item selected in it shown in full beside it: mail and the open message, contacts and the open card (list/details, side by side on a wide window).",
    slots: slots(
      [
        "- `items` required",
        "  - `name` required — who or what",
        "  - `summary` — one line: a subject, the first words",
        "  - `meta` — a time or a date",
        "- `heading` required — the selected item's title",
        "- `byline` — who and when, in a line",
        "- `body` required — the selected item, in full",
      ].join("\n"),
    ),
    knobs: {},
    draw: (id, b) => {
      const items = need(b.each("items"), "listdetails", "items");
      const i = items.bound;
      return [made({ id, component: "ListDetailsView", items: at(items.path), name: at(i.one("name")!), summary: bind(i.one("summary")), meta: bind(i.one("meta")), heading: bind(b.one("heading")), byline: bind(b.one("byline")), body: bind(b.one("body")) })] as C[];
    },
  },
  {
    name: "propertygrid",
    card: "Facts about one thing as names and values, one to a line, like a file's properties.",
    slots: slots("- `header` — a heading above them\n- `properties` required\n  - `name` required\n  - `value` required"),
    knobs: {},
    draw: (id, b) => {
      const properties = need(b.each("properties"), "propertygrid", "properties");
      return [made({ id, component: "PropertyGrid", header: bind(b.one("header")), items: at(properties.path), name: at(properties.bound.one("name")!), value: at(properties.bound.one("value")!) })] as C[];
    },
  },
  {
    name: "richtext",
    card: "A few paragraphs of text (RichTextBlock).",
    slots: slots("- `text` required — the paragraphs"),
    knobs: {},
    draw: (id, b) => [made({ id, component: "RichTextBlock", text: bind(b.one("text")) })] as C[],
  },
  {
    name: "pagebuttons",
    card: "The one thing to do with the page, as an accent button on the page itself, with at most one standard button beside it, left-aligned (Microsoft's buttons guidance).",
    slots: slots("- `accent` required — the main button's label\n- `standard` — a second button's label"),
    knobs: {},
    draw: (id, b) => {
      const second = b.one("standard");
      return [
        { id, component: "StackPanel", orientation: "horizontal", spacing: 8, children: [`${id}_accent`, ...(second ? [`${id}_standard`] : [])] },
        made({ id: `${id}_accent`, component: "Button", label: bind(b.one("accent")), style: "accent", event: "action" }),
        ...(second ? [made({ id: `${id}_standard`, component: "Button", label: at(second), style: "standard", event: "action" })] : []),
      ] as C[];
    },
  },
  {
    name: "formfields",
    card: "A form: each control with its header above it, in one column, required ones marked, and a button that submits it at the end (Microsoft's forms guidance).",
    slots: slots("- `fields` required\n  - `header` required — the control's header\n  - `placeholder` — an example of what goes in it\n  - `required` — whether it has to be filled in\n  - `options` — what can be chosen, for a choice\n  - `control` — textbox, multiline, password, number, date, time, combobox, radio, checkbox or toggle\n- `submit` required — the submitting button's label"),
    knobs: {},
    draw: (id, b) => {
      const fields = need(b.each("fields"), "formfields", "fields");
      const f = fields.bound;
      return [
        { id, component: "StackPanel", spacing: 24, children: [`${id}_fields`, `${id}_submit`] },
        { id: `${id}_fields`, component: "StackPanel", spacing: 16, children: { path: fields.path, componentId: `${id}_field` } },
        made({ id: `${id}_field`, component: "InputControl", header: bind(f.one("header")), control: bind(f.one("control")) ?? "textbox", placeholder: bind(f.one("placeholder")), required: bind(f.one("required")), options: bind(f.one("options")) }),
        made({ id: `${id}_submit`, component: "Button", label: bind(b.one("submit")), style: "accent", event: "submit" }),
      ] as C[];
    },
  },
  {
    name: "settingscards",
    card: "Settings as cards under short headings: each a name, a line on what it does, a symbol, and its control at the right; a card that opens a page of its own ends in a chevron (Windows 11 settings; SettingsCard).",
    slots: slots(
      [
        "- `sections` required",
        "  - `header` required — the group's heading",
        "  - `cards` required",
        "    - `header` required — the setting's name",
        "    - `description` — what it does, in a line",
        "    - `icon` — the name of a symbol",
        "    - `control` — toggle, combobox, link or button",
        "    - `value` — its current value, or a button's label",
        "    - `on` — whether a toggle is on",
      ].join("\n"),
    ),
    knobs: {},
    draw: (id, b, _knobs, look) => {
      const sections = need(b.each("sections"), "settingscards", "sections");
      const cards = need(sections.bound.each("cards"), "settingscards", "cards");
      const c = cards.bound;
      return [
        { id, component: "StackPanel", spacing: 28, children: { path: sections.path, componentId: `${id}_section` } },
        made({ id: `${id}_section`, component: "SettingsSection", header: bind(sections.bound.one("header")), children: { path: cards.path, componentId: `${id}_card` } }),
        made({ id: `${id}_card`, component: "SettingsCard", header: bind(c.one("header")), description: bind(c.one("description")), icon: look.icons ? bind(c.one("icon")) : undefined, control: bind(c.one("control")) ?? "link", value: bind(c.one("value")), on: bind(c.one("on")) }),
      ] as C[];
    },
  },
  {
    name: "aboutexpander",
    card: "About the app, last on its settings page, folded: its name and version on the expander, its links inside (SettingsExpander).",
    slots: slots("- `name` required — the app's name\n- `version` — its version\n- `links` — Send feedback, Privacy statement, Terms of use"),
    knobs: {},
    draw: (id, b) => [made({ id, component: "SettingsExpander", header: bind(b.one("name")), description: bind(b.one("version")), icon: "info", links: bind(b.one("links")) })] as C[],
  },
  {
    name: "dialogcommands",
    card: "A content dialog's responses, in their fixed order: the primary one that does it, a secondary one if there is a second thing to do, and the close one, required and safe, last; the default one is the accent (ContentDialog).",
    slots: slots("- `primary` — what does it\n- `secondary` — the other thing it can do\n- `close` required — what changes nothing\n- `default` — primary if the primary response is the one Enter takes, or none"),
    knobs: {},
    draw: (id, b) => [made({ id, component: "DialogCommands", primary: bind(b.one("primary")), secondary: bind(b.one("secondary")), close: bind(b.one("close")), default: bind(b.one("default")) })] as C[],
  },
  {
    name: "richeditbox",
    card: "The document itself, to type in: lines of text, in the window's text face or a fixed-width one for code and terminals.",
    slots: slots("- `lines` required — the document's lines"),
    knobs: { font: { takes: ["proportional", "mono"], is: "the window's text face, or a fixed-width one" } },
    draw: (id, b, knobs) => [made({ id, component: "RichEditBox", lines: at(b.one("lines")!), mono: knobs.font === "mono" || undefined })] as C[],
  },
  {
    name: "canvas",
    card: "A box of a fixed shape for what no catalog has: a drawing, a chart, a map, a board. What fills it arrives later, baked.",
    slots: slots("- `items` — a list from elsewhere, when what fills it draws those"),
    knobs: { ratio: { takes: RATIOS, is: "the shape of the box" } },
    // What fills it, the data it draws, what the person picked in it and whether it had to close are the slot's own plumbing, under the part's name.
    draw: (id, b, knobs) => [made({ id, component: "CanvasSlot", use: at(`/${id}/use`), ratio: String(knobs.ratio ?? "16:9"), data: at(`/${id}/data`), selection: at(`/${id}/selection`), failed: at(`/${id}/failed`), items: bind(b.one("items")) })] as C[],
  },
];

export const WINDOWS_PATTERNS: Catalog = Object.fromEntries(PATTERNS.map((pattern) => [pattern.name, pattern]));

/** The Windows catalog as a file. */
export function windowsCatalog(): Grammar {
  return catalogOf(
    "windows",
    "What the tool can draw the way a Windows 11 app lays a page out, for a graph to name. The patterns are Windows's own and share nothing with the kit's: the frame is the window of one of Microsoft's app silhouettes, or a content dialog; the parts are WinUI's controls. Drawn with Windows's own components (src/shared/windows.ts). Written out from src/server/grammar/patterns-windows.ts by `npm run grammar:export`.",
    WINDOWS_PATTERNS,
  );
}
