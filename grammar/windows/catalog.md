# windows

What the tool can draw the way a Windows 11 app lays a page out, for a graph to name. The patterns are Windows's own and share nothing with the kit's: the frame is the window of one of Microsoft's app silhouettes, or a content dialog; the parts are WinUI's controls. Drawn with Windows's own components (src/shared/windows.ts). Written out from src/server/grammar/patterns-windows.ts by `npm run grammar:export`.

## window

A page of a Windows 11 app in its window: a title bar with the app's name, a back button and the caption buttons; the app's sections in a navigation pane down the left with Settings at its foot, or across the top, or a menu bar, or the open documents as tabs in the title bar; the page's title; what is on it. Or a content dialog over the window (Microsoft's app silhouettes, NavigationView, TitleBar, ContentDialog).

- `app_title` — the app's name, in the title bar
- `page_title` required — the page's title, above what is on it; a dialog's title; a document's name
- `menu_items` — the app's sections, in the navigation pane
  - `content` required — what the section is called
  - `icon` — the name of a symbol
- `selected` — which of the sections this page is
- `menus` — the menus of a menu bar
- `documents` — what is open, one tab each, the first in front

### silhouette

how the window is laid out as a whole: a navigation pane down the left, navigation across the top, a menu bar, or tabs in the title bar

`left` `top` `menubar` `tabs`

### section

whether the page is one of the app's sections, selected in the navigation; if not, it was reached from one, and the title bar's back button takes the person back

`yes` `no`

### search

a search box in the middle of the title bar, for searching the whole app

`yes` `no`

### header

the page's title above what is on it, in Title type. A document names itself in the title bar instead

`yes` `no`

### modal

a content dialog over the window, which has to be answered before anything else

`yes` `no`

### at_foot

whether the page is the one kept at the foot of a left pane, Settings, rather than one of the sections

`yes` `no`

## infobar

A change in the app's state the person should know about or act on, set inline above the page's content and pushing it down: offline, a subscription expired, an update ready (InfoBar).

- `title` required — what changed, in a few words
- `message` required — what it means, or what to do
- `severity` — informational, success, warning or error
- `action` — the label of the one button, if there is one thing to do

## commandbar

The page's commands in a bar above its content, in order of importance, each a symbol and a one-word label; the ones used now and then behind See more (CommandBar).

- `commands` required
  - `label` required — one word where it can be
  - `icon` — the name of a symbol
  - `overflow` — secondary if it belongs behind See more, primary if in the bar

## breadcrumbbar

The way down to a page deep in a hierarchy, from the top, the page itself last and not a link (BreadcrumbBar).

- `crumbs` required — the levels, from the top down to this page

## selectorbar

A few views of the same content, one at a time, the first selected (SelectorBar).

- `views` required — the views' names

## flipview

Large pictures shown one at a time, with arrows and dots to move between them (FlipView).

- `slides` required
  - `picture` — the address of the picture
  - `caption` — a few words over it

## scrollview

A named row of tiles that scrolls sideways: New and trending, Continue watching, Recently opened.

- `header` — the row's name
- `tiles` required
  - `name` required
  - `detail` — one line under it
  - `picture` — the address of its picture

## itemsview

Things of one sort: a list told apart by words, a grid of tiles told apart by their look, or pictures laid out in their own shapes (ItemsView with a stack, a uniform grid or a lined flow; ListView and GridView).

- `header` — a heading above them
- `items` required
  - `name` required
  - `detail` — one line: an artist, a size, a date
  - `meta` — one short figure at the end of a row
  - `picture` — the address of its picture, in a grid or a flow
  - `symbol` — the name of a symbol, in a list

### layout

a list, a uniform grid of tiles, or pictures in rows of their own widths

`stack` `grid` `flow`

### selection

one at a time, opened by a click; or several, each with a check box, to act on together

`single` `multiple`

## tableview

Records in rows and columns, the column headings above, compared by their fields (TableView; File Explorer's details view).

- `columns` required — the headings
- `rows` required
  - `cells` required — one value per column, in the columns' order

### selection

one row at a time, or several, each with a check box

`single` `multiple`

## listdetails

A list, and the item selected in it shown in full beside it: mail and the open message, contacts and the open card (list/details, side by side on a wide window).

- `items` required
  - `name` required — who or what
  - `summary` — one line: a subject, the first words
  - `meta` — a time or a date
- `heading` required — the selected item's title
- `byline` — who and when, in a line
- `body` required — the selected item, in full

## propertygrid

Facts about one thing as names and values, one to a line, like a file's properties.

- `header` — a heading above them
- `properties` required
  - `name` required
  - `value` required

## richtext

A few paragraphs of text (RichTextBlock).

- `text` required — the paragraphs

## pagebuttons

The one thing to do with the page, as an accent button on the page itself, with at most one standard button beside it, left-aligned (Microsoft's buttons guidance).

- `accent` required — the main button's label
- `standard` — a second button's label

## formfields

A form: each control with its header above it, in one column, required ones marked, and a button that submits it at the end (Microsoft's forms guidance).

- `fields` required
  - `header` required — the control's header
  - `placeholder` — an example of what goes in it
  - `required` — whether it has to be filled in
  - `options` — what can be chosen, for a choice
  - `control` — textbox, multiline, password, number, date, time, combobox, radio, checkbox or toggle
- `submit` required — the submitting button's label

## settingscards

Settings as cards under short headings: each a name, a line on what it does, a symbol, and its control at the right; a card that opens a page of its own ends in a chevron (Windows 11 settings; SettingsCard).

- `sections` required
  - `header` required — the group's heading
  - `cards` required
    - `header` required — the setting's name
    - `description` — what it does, in a line
    - `icon` — the name of a symbol
    - `control` — toggle, combobox, link or button
    - `value` — its current value, or a button's label
    - `on` — whether a toggle is on

## aboutexpander

About the app, last on its settings page, folded: its name and version on the expander, its links inside (SettingsExpander).

- `name` required — the app's name
- `version` — its version
- `links` — Send feedback, Privacy statement, Terms of use

## dialogcommands

A content dialog's responses, in their fixed order: the primary one that does it, a secondary one if there is a second thing to do, and the close one, required and safe, last; the default one is the accent (ContentDialog).

- `primary` — what does it
- `secondary` — the other thing it can do
- `close` required — what changes nothing
- `default` — primary if the primary response is the one Enter takes, or none

## richeditbox

The document itself, to type in: lines of text, in the window's text face or a fixed-width one for code and terminals.

- `lines` required — the document's lines

### font

the window's text face, or a fixed-width one

`proportional` `mono`

## canvas

A box of a fixed shape for what no catalog has: a drawing, a chart, a map, a board. What fills it arrives later, baked.

- `items` — a list from elsewhere, when what fills it draws those

### ratio

the shape of the box

`16:9` `4:3` `1:1`

## Sources

Where a value can come from when it is not simply written. A graph chains them with `else`, on a field or, with `filled`, on a whole part, and they are tried in that order. A `set` can come up empty and a `maker` can fail, so a chain has to end in a `terminal`, or in something that is simply there.

### written (maker, fast)

The small model writes it along with the rest of its part, to the schema the part's fields make. It is what a field is when it says nothing else.

### decided (asks)

Jev decides it once the words it is about exist: whether a status is bad news, which button is the main one, what control a setting gets.

### computed (code)

Code works it out from what was written: the last row of a bill is the one the others add up to.

### shelf (set, asks)

What this app has had baked before. Jev is offered their cards and 'none of these'. One that is reused has only its data written, by the small model, so the app's map is the same map on every screen.

### baked (maker, strong, slow, 2 tries, joins shelf)

A stronger model writes the component, to a contract: what the graph decided under the part, in the words its options say to a maker. Checked before it is sent: it parses, it paints with the design's variables only, it reaches for no network; on a second try it is told why the first was refused.

### closed (terminal)

The slot closes up and the rest of what was made stands.

### library (set, asks)

The photo library, on the shelf that `by` names. Jev is offered five photographs by what they show, and 'none of these', because a wrong picture is worse than none.

### painted (maker, image, slow, joins library)

The image model makes the picture, shot the way its subject says to a maker. The library has it next time.

### placeholder (terminal)

The painted frame and its symbol stay where the picture would have been.
