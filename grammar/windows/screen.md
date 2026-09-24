# page

> Design the page of a Windows app requested in `page`, the way an app built to Microsoft's guidance for Windows 11 lays one out. Work out what that page is made of. If present, `first_screen` is the original app brief and `reached_by` describes the page the person came from and how they left it. Those are background context: their layouts and purposes do not define the page being requested.

The graph of one page of a Windows 11 app, written from Microsoft's own guidance for Windows apps (learn.microsoft.com/windows/apps/design) and not from the tool's other grammars. What decides the frame of a Windows app is first the app's silhouette, which Microsoft names four of and which is the same on every page, then the page: which of Microsoft's page patterns it is, whether it is one of the app's sections or reached from one, and whether it is a content dialog over the window. Its parts are WinUI's controls. Drawn by windows/catalog.md; docs/grammar.md says how to read it.

## titles

Written for every page, before anything about it is known: the app's name in its title bar, and the page's title above what is on it.

- `app` as app_title — The app's name as its title bar shows it, one or two words.
- `page` as page_title — The page's title, at most four words: what this place in the app is called, e.g. 'Inbox', 'Library', 'Orders', 'Settings'; one thing's name only when the page is about that one thing. A dialog's title is its question, e.g. 'Delete this file?'; a document's is its file name, e.g. 'Untitled.txt'.

## pane

The app's sections, in its navigation pane or across its top: settled once for the app and the same on every page, with the one this page is in selected. Settings is not one of them; a left pane keeps it at its foot.

- `items` 3–8, as menu_items, when silhouette is left or top and page_type is not dialog — The app's sections, in the order the navigation lists them.
  - `label` as content — One or two words.
  - `icon` as icon, decided by pane_symbol
- `active` integer, as selected, when silhouette is left or top and page_type is not dialog — Index of the section this page is in.

### pane_symbol (of each section in items)

> Which symbol best stands for {section}, one of the app's sections in its navigation?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

## menubar

- `menus` 3–6, as menus, when silhouette is menubar and page_type is not dialog — The menu bar's menus, in order, e.g. 'File', 'Edit', 'View', 'Help'.
  - each — One word.

## tabstrip

- `documents` 2–5, as documents, when silhouette is tabs and page_type is not dialog — What is open, one tab each, the one shown first, e.g. 'PowerShell', 'Ubuntu', 'Command Prompt'.
  - each — A name of a few words.

## silhouette (app) → silhouette

Microsoft's four app silhouettes: a navigation pane down the left (Settings), navigation across the top (Photos), a menu bar (Notepad), tabs (Terminal). It is the app's, not the page's: asked of an app's first page and given to every page after.

> How is this Windows app organised as a whole?

- **left** — Several sections of about equal weight that the person moves between, five to ten of them: a settings app, a mail client, a file manager, a store, a developer's dashboard, an admin console.
- **top** — Five or fewer sections, where what they show matters more than moving between them: a photo library, a music or video player, a news reader, a weather app.
- **menubar** — The person makes or edits one thing at a time and needs many commands for it, grouped as File, Edit and View: a text editor, a drawing program, a spreadsheet, a code editor.
- **tabs** — The person keeps several documents, sessions or pages open at once and switches between them: a terminal, a web browser, an editor of many files.

## app_search (app) → search

Microsoft's title bar: a search box in its middle, for an app whose content is found by name.

> Does the person search the whole app, from anywhere in it?

+ Mail, files, a store, a library of music or films, a settings app: more than can be scanned, found by name.
- One document at a time, a player, a game, an app of a few pages.

## section → section

> Is this page one of the app's sections, the places its navigation lists?

+ A home, an inbox, a library, a store's front, the app's settings: one of the few places the app is organised into.
- A page reached from another: one thing's details, a search's results, a folder inside another, a form to fill in, a dialog.

## page_type → window

Microsoft's page patterns (landing, collections, list/details, details, forms; Template Studio's content grid and data grid), the settings page every app has, the content dialog, and the document a menu bar or tabs are for.

> What kind of page of a Windows app is this?

- **landing** — The front of an app or of one of its sections, where the person starts: what is new, featured, recommended or recent, in named rows to look through before going deeper: a store's home, a media app's home, a learning app's home.
  `infobar? flipview? SHELF items?` at least 2
- **content_grid** — Many things of one sort that the person tells apart by how they look and browses: photos, albums, films, apps, products, wallpapers, templates.
  `infobar? commandbar? breadcrumb? selector? ITEMS`
- **data_grid** — Records the person compares by their fields, in rows and columns: files with their size and date, running processes, orders, invoices, transactions, tickets, log entries.
  `infobar? COMMANDBAR breadcrumb selector? TABLE`
- **list_details** — Items the person moves between often, reading each one in full beside the list: mail and the open message, contacts and the open card, notes, chats, tickets, episodes.
  `infobar? commandbar LISTDETAILS`
- **details** — One thing in depth, reached from a grid, a list or a front page: an app or a product in a store, a film, a person, an order, a device.
  `commandbar? breadcrumb? flipview description PROPERTIES page_actions?` at least 2
- **form** — The person fills in information and submits it: creating an account, signing in, adding a contact, booking, reporting a problem, a new event.
  `infobar? FIELDS`
- **settings** — The app's own settings, reached from Settings at the foot of its navigation: its preferences, the account, notifications, how it looks, and About the app last.
  `infobar? SETTING_SECTIONS ABOUT` at_foot
- **dialog** — A short question or message that has to be answered before anything else can happen: delete for good, discard unsaved changes, sign out, allow access, an error the person must acknowledge.
  `MESSAGE RESPONSES` modal
- **document** — The person's own document or session, open to work in: a text file, a letter, source code, a drawing, a diagram, a terminal session.
  `editor canvas?` at least 1, header no

### infobar (never padding) → infobar

Microsoft's InfoBar: for a change in the app's state that the person should know about, acknowledge or act on; not for the outcome of what they just did, and not for what is not essential.

> Is the app offline, out of date, short of storage or otherwise in a state the person should know about before anything else?

+ The device is offline, a subscription has expired, an update is waiting to be installed, syncing has failed, storage is almost full, a trial ends soon.
- Nothing unusual is going on: the app is connected, up to date and working as it should.

- `title` as title — What changed, in a few words, e.g. 'You're offline', 'Update available'.
- `message` as message — One sentence: what it means, or what to do about it.
- `action` as action, optional — The label of a button, if there is one thing to do, e.g. 'Retry', 'Install', 'Renew'.
- `severity` as severity, decided by infobar_severity

#### infobar_severity (once written)

> For the person using the app, how serious is what `infobar` says?

- **informational** — Something to know that is neither good nor bad: an update is ready, something new, a change of plan.
- **success** — Something went well: synced, backed up, connected again.
- **warning** — Something needs attention soon: storage almost full, a trial ending, a password expiring.
- **error** — Something failed or is lost: offline, sign-in failed, a payment declined, syncing failed.

### commandbar → commandbar

Microsoft's CommandBar: the page's commands in order of importance, labelled in a word where it can be; what is used now and then is behind See more.

> Does the page have commands that act on what it shows, or on the things the person picks in it?

+ New, Delete, Share, Sort, Filter, Refresh, Rename, Move, Download, Print, Reply, Forward, Edit.
- The page is only read; or its one action is a button on the page itself; or it is settings, a form or a dialog.

- `commands` 3–8, as commands — The commands, in order of importance, each a single word where it can be, e.g. 'New', 'Delete', 'Share', 'Sort'.
  - `label` as label — The command's label.
  - `icon` as icon, decided by command_symbol
  - `overflow` as overflow, decided by command_overflow

#### command_overflow (of each command in commands)

> Is {command} used only now and then, so that it belongs behind the command bar's See more rather than in the bar itself?

+ `secondary` Now and then: Print, Export, Properties, Settings, Select all, Help, Pin, Rename.
- `primary` Often, or it is what the page is for: New, Delete, Share, Reply, Upload, Sort, Filter, Edit.

#### command_symbol (of each command in commands)

> Which symbol best stands for the command {command}?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

### breadcrumb → breadcrumbbar

Microsoft's BreadcrumbBar: for a path of more than two levels, when the way to where the person is matters; the current level last.

> Is the page deep in a hierarchy, more than two levels down, where the way down to it matters?

+ A folder inside folders; a category inside categories, e.g. Documents › Projects › 2026 › Invoices.
- A section of the app, or a page one step from one; or nothing on it is nested.

- `crumbs` 3–5, as crumbs — The levels from the top down to this page, this page last, e.g. 'Documents', 'Projects', '2026'.
  - each — One to three words.

### selector → selectorbar

Microsoft's SelectorBar: a few views of the same content, one selected at a time.

> Does the page show the same things in a few views that the person switches between, one at a time?

+ Recent, Shared, Favorites; All, Unread, Flagged; Day, Week, Month; Playing, Upcoming.
- One view of it all; or the page has no set of things to view.

- `views` 2–4, as views — The views, the first selected.
  - each — One or two words.

### flipview → flipview

Microsoft's FlipView: fewer than 25 pictures, shown one at a time.

> Does the page lead with a few large pictures, shown one at a time?

+ A store's featured apps and games, a film's stills, a product's photos, the latest releases, a trip's best photos.
- Nothing on it has a look worth showing large: mail, files, records, settings, a form, a document.

- `slides` 2–5, as slides — What each picture is of.
  - `caption` as caption — A few words over the picture: a title, a tagline.
  - `imageUrl` as picture, from library by slide_subject else painted else placeholder

### shelf → scrollview

> Does the page gather things into a named row to look through, e.g. New and trending, Top free apps, Continue watching, Recently opened?

+ The front of a store, a media app or a learning app, with a row of what is new, popular or recent.
- The page is about one thing, or shows everything of one sort at once; or it is settings, a form or a document.

- `title` as header — The row's name, e.g. 'New and trending', 'Continue watching'.
- `tiles` 4–8, as tiles — The things in the row.
  - `name` as name — Its name.
  - `detail` as detail — One line: who made it, a genre, a price.
  - `imageUrl` as picture, from library by tile_subject else painted else placeholder

### items → itemsview

Microsoft's collections: a list for what is told apart by its words, a grid for what is told apart by its look, and a flow for pictures of every width.

> Does the page show several things of one sort?

+ Files, photos, albums, songs, apps, products, people, tasks, recipes, devices.
- One thing; records compared by their fields in columns; settings; a form; a dialog; a document.

- `heading` as header, when page_type is landing — A heading above them, in a few words.
- `items` 4–12, as items — The things.
  - `name` as name — Its name.
  - `detail` as detail — One line: an artist, a size, a date, a price, who it is from.
  - `meta` as meta, when items_look is stack — One short figure at the end of the row: a date, a duration, a size.
  - `imageUrl` as picture, from library by tile_subject else painted else placeholder, when items_look is grid or flow
  - `symbol` as symbol, decided by entry_symbol, all or none, when items_look is stack

#### items_look → layout

> If the page shows several things of one sort, does the person tell them apart by their words or by how they look?

- **stack** — By their words: files, messages, songs, tasks, contacts, anything read in a list.
- **grid** — By how they look, every one the same shape: apps, albums, films, products, templates, wallpapers.
- **flow** — By how they look, each in its own shape: the photos in a library, pictures of every width.

#### multi_select → selection

> If the page shows several things of one sort, does the person act on several of them at once?

+ `multiple` Delete these, move these, share these, download these, add these to an album: files, photos, mail, tasks.
- `single` One at a time: open one, play one, buy one.

#### entry_symbol (of each item in items)

> Which symbol best stands for {item}?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

### table → tableview

Microsoft has no table of its own in WinUI; this is the details view File Explorer draws.

> Does the page show records the person compares by their fields, in columns?

+ Files with their size, type and date modified; processes with their CPU and memory; orders with their status and total; invoices; transactions; tickets with their owner and due date.
- Things told apart by how they look, or read one at a time; settings; a form; a document.

- `columns` 3–6, as columns — The column headings, the record's name first, e.g. 'Name', 'Date modified', 'Type', 'Size'.
  - each — One or two words.
- `rows` 5–10, as rows — The records, one to a row.
  - `cells` 3–6, as cells — One value for each column, in the columns' order.
    - each — Short: a name, a date, a number with its unit, a word of status.

#### row_select → selection

> If the page shows records in columns, does the person act on several rows at once?

+ `multiple` Delete these files, end these tasks, export these orders, assign these tickets.
- `single` One at a time: open one record.

### listdetails → listdetails

Microsoft's list/details: for items the person switches between often, such as mail and contacts; side by side on a wide window.

> Does the page list items and show the one selected in full beside the list?

+ Mail and the open message; contacts and the open contact; notes and the open note; tickets and the open ticket; episodes and the open episode's notes.
- One thing alone; things chosen by how they look; records compared in columns; settings; a form.

- `items` 5–10, as items — The items, newest or most important first. The first is the one open beside the list.
  - `name` as name — Who or what: a sender, a contact's name, a note's title.
  - `summary` as summary — One line: a subject, a phone number, the first words.
  - `time` as meta — A time or a date, e.g. '10:42', 'Yesterday', 'Mon'.
- `heading` as heading — The open item's title or subject.
- `byline` as byline — Who and when, in a line, e.g. 'Sarah Chen · Today at 10:42'.
- `body` as body — The open item in full: two or three short paragraphs.

### description → richtext

> Does the page describe what it is about in a paragraph or two?

+ What an app does, a film's plot, a product's description, a person's biography, what an order contains.
- Everything on it is a list, a table, facts, settings or fields.

- `text` as text — One or two short paragraphs.

### properties → propertygrid

> Does the page state facts about one thing as names and values?

+ Size, dimensions, version, release date, publisher, price, rating, status, phone number, address.
- It lists many things; or it is a form, settings or a dialog.

- `heading` as header — A heading above them, e.g. 'Details', 'Additional information', 'Specifications'.
- `properties` 3–8, as properties — The facts.
  - `name` as name — What it is, e.g. 'Size', 'Released', 'Publisher'.
  - `value` as value — Its value, short.

### page_actions → pagebuttons

Microsoft's commanding: a command the person needs to complete what the page is for goes on the page itself; a single button on a page is left-aligned.

> Is there one thing the person does with this page, from a button on the page itself: get, install, buy, play, book, connect?

+ An app's Install, a film's Play, a product's Add to cart, a trip's Book, a device's Connect.
- The page is only read; or its actions are commands in a bar; or it is a form or settings.

- `primary` as accent — The main button's label, a verb, e.g. 'Install', 'Play', 'Book'.
- `secondary` as standard, optional — A second button's label, if there is one, e.g. 'Add to wishlist', 'Watch trailer'.

### fields → formfields

Microsoft's forms: one column, each control's header above it, required fields marked, and a button that submits.

> Does the page ask the person to fill in information and submit it?

+ Signing up, signing in, adding a contact, booking, reporting a problem, a new event, paying.
- The page is read or browsed, or its settings apply at once.

- `fields` 2–7, as fields — The fields in order, each with a header above its control.
  - `header` as header — The field's header, e.g. 'First name', 'Email', 'Start date'.
  - `placeholder` as placeholder, optional — An example of what goes in it.
  - `required` boolean, as required — Whether it has to be filled in.
  - `options` 2–6, as options, optional — What can be chosen, when the field is a choice.
    - each — One to three words.
  - `control` as control, decided by field_control
- `submit` as submit — The submitting button's label, a verb, e.g. 'Create account', 'Sign in', 'Book', 'Send'.

#### field_control (of each field in fields)

> Which control does the form field {field} take?

- **textbox** — A short answer the person types: a name, an email address, a title, a phone number.
- **multiline** — Several lines the person types: a message, a description, notes, an address.
- **password** — A password or a code, kept hidden.
- **number** — A quantity or an amount: guests, a price, an age.
- **date** — A day: a birthday, a start date, a due date.
- **time** — A time of day.
- **combobox** — One of a long list the person opens: a country, a time zone, a category.
- **radio** — One of up to five, all shown: a plan, a size, a delivery speed.
- **checkbox** — A yes or no the person ticks: agreeing to terms, subscribing to news.
- **toggle** — Something turned on or off that takes effect at once.

### setting_sections → settingscards

Windows 11's settings: each setting a card with its control at the right, under short headings, taking effect at once with nothing to confirm.

> Does the page gather the app's preferences under short headings?

+ How the app looks, notifications, the account, privacy, storage, playback, sync, language: how the app behaves.
- It is not the app's settings.

- `sections` 2–4, as sections — The groups, each under a short heading.
  - `heading` as header — The group's heading, e.g. 'Appearance', 'Notifications', 'Account'.
  - `settings` 2–5, as cards — The settings in it.
    - `name` as header — The setting's name, e.g. 'App theme', 'Start with Windows'.
    - `description` as description — What it does, in a line.
    - `value` as value, optional — Its current value, if it has one, e.g. 'Dark', 'English (United States)'; or a button's label, e.g. 'Sign out', 'Clear'.
    - `on` boolean, as on — Whether it is on, if it is turned on or off.
    - `control` as control, decided by setting_control
    - `symbol` as icon, decided by setting_symbol, all or none

#### setting_control (of each setting in settings, within each section in sections)

> What does the setting {setting} take at its right?

- **toggle** — Something simply on or off that takes effect at once: notifications, starting with Windows, sounds, sync.
- **combobox** — One value picked from several: the app's theme (Light, Dark, Use system setting), a language, a quality, a download folder.
- **link** — A page of its own, which the card opens: the account, privacy, notifications in detail, connected devices.
- **button** — Something done once rather than set: sign out, clear the cache, reset, check for updates, export.

#### setting_symbol (of each setting in settings, within each section in sections)

> Which symbol best stands for the setting {setting}?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

### about → aboutexpander

Microsoft's app settings: About last, as an expander with the app's name, icon and version, and its links and legal text inside.

> Does the page end with what the app is: its name, its version, how to send feedback?

+ The app's own settings, which end with About.
- Anything that is not the app's settings.

- `name` as name — The app's name.
- `version` as version — Its version, e.g. 'Version 2.4.1'.
- `links` 2–3, as links — What is inside, e.g. 'Send feedback', 'Privacy statement', 'Terms of use'.
  - each — A few words.

### message → richtext

> Does the page say, in a sentence or two, what the person is deciding or being told?

+ What will be lost, what the choice means, what went wrong and what can be done.
- The page shows things rather than asking or telling.

- `text` as text — One or two sentences: what happens, what is lost, or what it means.

### responses → dialogcommands

Microsoft's ContentDialog: a primary response that does it, a secondary one used sparingly, and a close response, required and safe; each a specific verb, not Yes or No.

> Does the dialog end in the responses the person answers it with?

+ Delete or Cancel; Save, Don't save or Cancel; Allow or Block; Sign out or Cancel; OK.
- The page is not a dialog.

- `primary` as primary, optional — The response that does it, a specific verb, e.g. 'Delete', 'Allow', 'Save', 'Sign out'. Left out if the dialog only tells something.
- `secondary` as secondary, when second_response is yes — The other thing it can do, e.g. "Don't save".
- `close` as close — The response that changes nothing, e.g. 'Cancel', 'Not now'; 'OK' or 'Close' if the dialog only tells something.
- `default` as default, decided by default_response

#### second_response

> If the page is a dialog, is there a second thing it can do besides doing it and cancelling?

+ Save, Don't save or Cancel; Replace, Keep both or Cancel.
- One thing to do or not: Delete or Cancel; Allow or Block; Sign out or Cancel; an error's OK.

#### default_response (once written)

My reading, not Microsoft's words: the default response is the one Enter takes, so it is the one that is safe to take by habit.

> Is the primary response of `responses` safe to take by pressing Enter, without reading?

+ `primary` Save, Allow, OK, Continue, Install, Retry: nothing is lost if it is taken by habit.
- `none` Delete, Erase, Sign out, Discard, Reset, Remove: something is lost if it is taken without reading.

### editor → richeditbox

> Is the document text the person types: a note, a letter, source code, a terminal session, a list?

+ Plain text, a letter, source code, a configuration file, a terminal's prompts and output, a log.
- Something drawn or laid out on a surface: a drawing, a diagram, a map, a board.

- `lines` 10–24, as lines — The document's text, one line each, an empty string for a blank line.
  - each — One line.

#### fixed_width → font

> If the document is text, is it code, data, a log or a terminal session, set in a face of fixed width?

+ `mono` Source code, a terminal, a log, a configuration file, data in columns.
- `proportional` Prose: a note, a letter, a list, a story.

### canvas (never padding) → canvas with ratio 16:9

The one part no catalog has a component for. What it is gets baked at run time; the graph only knows that it is there, and what it is held to.

> Is the document something drawn or laid out on a surface rather than typed: a drawing, a diagram, a whiteboard, a map, a board game, a timeline?

+ A sketch, a floor plan, a flowchart, a mind map, a whiteboard, a chess board, a route on a map.
- Text the person types: a note, a letter, source code, a terminal session.

→ It fills the window below the menus, as the canvas of a drawing program does: the thing being made, part way through.

filled from shelf else baked else closed

#### canvas_use

The words are the ones the baker is held to (docs/grammar.md, item 56).

> If the document is drawn, what does the person do with it?

- **adjust** — They draw, drag, place or arrange on it directly: a drawing, a diagram, a whiteboard, a board game.
  → The person works it directly by drawing, dragging or placing, and it responds at once. Report the current value with kit.select whenever it changes.
- **pick** — They pick parts of it: cells, seats, days, places.
  → The person picks one or more parts of it. Clicking a part selects it, visibly, and clicking again deselects it. Report every change with kit.select.
- **read** — They read it: a chart, a map, a plan.
  → The person only reads it. It may reveal a detail when a part is hovered or clicked, but nothing is chosen or changed.
- **watch** — It changes on its own: a live map, a monitor, a clock.
  → It shows something that changes on its own. Make it run: it moves, counts or updates by itself once started.

## slide_subject

> If large pictures lead this page, what are they pictures of?

among [subjects](../subjects.md)

## tile_subject

> If the things on this page have pictures, what are those pictures of?

among [subjects](../subjects.md)

## Rules

- when page_type is dialog, section is no — a content dialog is over a page, not one of the app's sections
- when page_type is details, section is no — one thing in depth is reached from where it is listed
- when breadcrumb, section is no — a page deep in a hierarchy is reached from above it, not listed in the navigation
- when page_type is landing, section is yes — a front page is where a section starts
- when page_type is settings, section is yes — the app's settings are at the foot of its navigation
- when silhouette is menubar or tabs, app_search is no — a document is searched from its own Edit menu, not the title bar
- when multi_select is multiple, commandbar — what is picked is acted on from the command bar
- when field_control is combobox or radio and no options, field_control is textbox — a choice needs its options written
- when setting_control is combobox and no value, setting_control is link — a card shows a value only if one was written
- when setting_control is button and no value, setting_control is link — a button needs its label written
- when canvas, no editor — a drawn document is not typed text

## Examples

- The inbox of a mail app, with the selected message open beside the list → page_type is list_details, listdetails, commandbar, silhouette is left, section is yes
- Contacts, with one contact's details open → page_type is list_details, listdetails
- A notes app: the notes in a notebook, one of them open → page_type is list_details
- A photo library: every photo, newest first → page_type is content_grid, items, items_look is flow, silhouette is top, no breadcrumb
- A music app's albums → page_type is content_grid, items, items_look is grid
- A video app's library of films → page_type is content_grid, items_look is grid
- The files in Documents › Projects › 2026 in a file manager → page_type is data_grid, table, breadcrumb, section is no
- The processes running on the computer, with their CPU, memory and disk use → page_type is data_grid, table, no breadcrumb
- A shop's orders: order number, customer, status, total, date → page_type is data_grid, table, commandbar, no breadcrumb
- The home of an app store: featured apps and the top free apps → page_type is landing, shelf, flipview, section is yes
- A news reader's home while the device is offline → infobar
- One app's page in a store: screenshots, rating, what it does, Install → page_type is details, flipview, page_actions, section is no
- A plain text editor with a document open → page_type is document, editor, silhouette is menubar, no canvas, fixed_width is no
- A terminal with three sessions open in tabs → page_type is document, editor, silhouette is tabs, fixed_width is yes
- A drawing program with a sketch open → page_type is document, canvas, silhouette is menubar
- Delete "Budget.xlsx" permanently? You can't undo this → page_type is dialog, responses, section is no, second_response is no
- Save your changes to Untitled before closing? → page_type is dialog, second_response is yes
- The file couldn't be saved because the disk is full → page_type is dialog, second_response is no
- Add a contact: name, email, phone, birthday → page_type is form, fields, section is no
- Sign in to your account: email and password → page_type is form, fields
- Settings for a podcast app: playback, downloads, notifications, about → page_type is settings, setting_sections, about, section is yes
- A developer's dashboard of builds, deployments and logs, with settings → silhouette is left
- A weather app's forecast for the week
