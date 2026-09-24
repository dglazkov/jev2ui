# screen

> Design the iOS screen requested in `screen`, the way an app built to Apple's Human Interface Guidelines lays one out. Work out what that screen is made of. If present, `first_screen` is the original app brief and `reached_by` describes the source screen and how the person left it. Those are background context: their layouts and purposes do not define the screen being requested. A source section describes where a link was selected, not a section to recreate on the destination.

The graph of one screen of an iOS app, written from the Human Interface Guidelines and not from the tool's own grammar. Its kinds are the ways an iOS screen is presented: a tab's root, a screen pushed onto the one before it, a sheet, an alert, an action sheet, a full-screen cover. What it asks that the tool's own grammar does not is what iOS decides differently: whether a screen is a task the person completes and dismisses, whether a collection is edited from its bar. Drawn by ios/catalog.md; docs/grammar.md says how to read it.

## header

Written for every screen, before anything about it is known. It fills the navigation bar's title, large or inline, or who a profile is about, or how something went; and the line under it.

- `title` as title — Screen title, at most four words.
- `subtitle` as subtitle — One short supporting line.
- `imageUrl` as portrait, from library else painted else placeholder

## kind → page

The kinds are how iOS presents a screen, because that is what decides its frame: what leads its bar, whether its title is large, whether the tab bar shows, whether it rises as a sheet or sits over the screen as an alert. What a kind says after its parts sets the frame; the answers below turn what the kind leaves open.

> What kind of iOS screen is this?

- **browse** — A tab's root: what the person comes to the app for, reached from the tab bar. An inbox, a library, a store front, a feed of updates, a list of the person's own things, a home. It opens with a large title.
  `search banner? hero? custom? stats? LIST` navigation, leading none
- **detail** — One thing in depth, pushed onto the screen it was chosen from: a product, a place, an article, a contact, an event, an order, a recipe, a message.
  `hero custom? stats? text details? steps? list? buttons?` at least 2, sticky buttons, intro
- **settings** — Preferences, account options or configuration: inset grouped rows of switches, values and disclosures, pushed from the app's settings or a profile.
  `banner? GROUPS`
- **compose** — A self-contained task the person starts, completes and dismisses, risen as a sheet with Cancel and Done in its bar: composing, adding, editing, booking, signing up, filtering.
  `text? custom? FORM` presentation sheet, leading cancel, trailing done, intro
- **alert** — One short decision about one thing, asked before it happens, in a small alert centred over the screen: delete, discard, allow, sign out, confirm.
  `text BUTTONS` presentation alert
- **choices** — A choice among a few actions, raised from the bottom by a button the person just pressed: share to, sort by, what to do with this one thing.
  `text? BUTTONS` presentation actionsheet
- **welcome** — The first run, or what is new in this version: a large title, a few features each with a symbol, and one button to continue, covering the whole screen.
  `FEATURES BUTTONS` presentation fullscreen, title large, sticky buttons
- **done** — How something the person just did went, covering the whole screen: paid, sent, booked, saved, failed; with what to do next.
  `text? details? BUTTONS` presentation fullscreen, opening outcome, sticky buttons

### search → filters

HIG: a search field sits under the large title of the screen it searches, with a scope bar when results split into a few kinds.

> Will the person search the collection on this screen?

+ An inbox, a library, a directory, a catalogue, a store, a history, results of a search: more items than fit on a screen, or the person knows the name of what they want.
- A feed of updates read in order, a handful of items all in view, a summary, or nothing to search.

- `placeholder` as search — Placeholder of the search field, e.g. 'Search', 'Search Mail'.
- `scope` 2–4, as chips — Two to four scopes the results split into, the first selected: 'All' first, then the kinds, e.g. 'All', 'Unread', 'Flagged'.
  - each — One word.

### banner (never padding) → banner

HIG: use a banner for one thing that needs attention now; a screen full of them is noise.

> Does something on this screen need the person's attention before anything else?

+ There is a warning, an outage, a deadline, an error, an offer about to expire, or a success to acknowledge.
- Nothing unusual is going on; the screen is business as usual.

- `title` as title — What needs attention, in a few words.
- `text` as text — One sentence of detail.
- `tone` as tone, decided by banner_tone

#### banner_tone (once written)

> For the person looking at the screen, what kind of news is `banner`?

- **success** — Good news or a healthy state: done, available, on time, paid, active, in stock.
- **warning** — Needs attention soon: low, delayed, pending, degraded, expiring, almost full.
- **danger** — Bad news: failed, overdue, critical, cancelled, offline, out of stock.
- **accent** — A highlight and not a state: new, featured, popular, recommended.
- **neutral** `accent` — Plain information that is neither good nor bad.

### hero → picture

> Should a large picture lead this screen?

+ One visual subject leads: a place, dish, product, property, animal, trip, event, class, film, story, character or something being made. A store front or a discovery tab can lead with featured artwork before its items.
- The subject has no look: an order, an account, a transaction, a message, a setting, a set of figures. A plain list, an inbox or a directory has no featured visual subject.

- `imageUrl` as picture, from library by hero_subject else painted else placeholder

### custom (never padding) → slot

The one part no catalog has a component for. What it is gets baked at run time; the graph only knows that it is there, and what it is held to.

> Is the heart of this screen something that has to be drawn specially for it?

+ A map, a seating plan, a timer face, a dial, a game board, a floor plan, a piano keyboard, a colour wheel, a chart, a month calendar, a body diagram.
- Everything on it can be shown with lists, cards, photographs, figures, text, form fields and buttons.

filled from shelf else baked else closed

- `items` as items, from /list/items, when custom_linked is yes

#### custom_use

> If the screen has something drawn specially for it, what does the person do with that thing?

- **watch** — It shows something that changes on its own and the person keeps an eye on: a timer, a gauge, a tuner, a live position, a level.
  → It shows something that changes on its own, and the person keeps an eye on it. Make it run: it moves, counts or updates by itself once started.
- **pick** — The person picks one or more parts of it: a seat, a day, a table, a room, a place on a map.
  → The person picks one or more parts of it. Tapping a part selects it, visibly, and tapping again deselects it. Report every change with kit.select.
- **adjust** — The person drags, turns or plays it directly: a dial, a colour wheel, a keyboard, a board with pieces, a drawing surface.
  → The person works it directly by dragging, turning or playing it, and it responds at once. Report the current value with kit.select whenever it changes.
- **read** — It is a picture of data or of a place that the person only reads: a chart, a diagram, a route, a plan.
  → The person only reads it. It may reveal a detail when a part is tapped or hovered, but nothing is chosen or changed.

#### custom_size → ratio

> If the screen has something drawn specially for it, how much room does that thing need?

- **strip** `3:1` — A thin band across the screen: a sparkline, a timeline, a week of days, a waveform.
- **wide** `16:9` — A landscape panel: a chart, a small map, a route preview.
- **square** `1:1` — A square: a ring, a dial, a clock face, a board, a wheel.
- **tall** `3:4` — Most of the height of the screen: a map to explore, a seating plan, a floor plan, a month calendar.

#### custom_linked

> If the screen has something drawn specially for it, does that thing show the very same items that the screen also lists?

+ Pins for the places in the list, bars for the categories in the list, dots for the events in the list.
- It shows one thing of its own, or the screen has no list of items.

### stats → stats

> Are there a few headline numbers the person wants at a glance?

+ Key figures such as totals, counts, rates, balances, scores, durations or usage.
- There are no headline numbers.

- `stats` 2–6, as stats — Headline numbers.
  - `label` as label — Short label.
  - `value` as value — The figure with its unit, e.g. '24.2 kWh'.
  - `delta` as delta, when stat_deltas is yes — Change against the previous period, signed, e.g. '+12%' or '-0.4 kW'.
  - `tone` as tone, decided by stat_news, when stat_deltas is yes

#### stat_deltas

> If the screen shows headline numbers, do they change over time in a way the person tracks?

+ Usage, spending, revenue, health or performance figures compared with yesterday, last week or a target.
- Fixed figures, such as counts or specifications, with nothing to compare against.

#### stat_news (of each stat in stats with delta)

> For the person looking at the screen, is the change in {stat} good or bad news?

- **good** — The figure moved the way the person wants it to.
- **bad** — The figure moved the way the person does not want.
- **neutral** — Neither; it is just a change.

### list → collection

HIG lists: plain rows with separators to scan, inset grouped rows for things with a name and a state, a grid of pictures to browse by look.

> Does the screen show several similar items?

+ Results, products, people, records, messages, line items, episodes, devices or any set of comparable things.
- The screen is about one thing, or only about settings or input.

- `heading` as heading, when kind is not browse — Heading above the list.
- `actionLabel` as action, when item_trailing is button — One word for the button on every item, e.g. 'Get', 'Follow', 'Play'.
- `items` 3–8, as items — The items.
  - `title` as headline — The item's name.
  - `subtitle` as supporting — A short secondary line: category, author, place, variant.
  - `description` as supporting, when item_description is yes — One sentence.
  - `price` as meta, when item_price is yes — Price or amount with currency, e.g. '$24.00'.
  - `rating` number, as rating, when item_rating is yes — Rating out of 5, one decimal.
  - `reviews` as count, when item_rating is yes — Number of reviews, e.g. '128'.
  - `status` as badge, when item_status is yes — One or two words: the item's current state.
  - `time` as meta, when item_time is yes — Short date, time or duration, e.g. 'Today 7:15 pm', '42 min'.
  - `progress` number, as progress, when item_progress is yes — Percent from 0 to 100.
  - `on` boolean, as on, when item_trailing is switch or checkbox — Whether it is currently on or ticked.
  - `tone` as tone, decided by item_tone
  - `icon` as icon, decided by item_icon
  - `imageUrl` as picture, from library by item_subject else painted else placeholder

#### list_layout → layout

> If the screen shows a set of items, how should they be laid out?

- **rows** — Rows to scan, with a separator between each: mail, messages, contacts, files, settings-like records, anything read by its words.
- **cards** — Large picture cards, one after another: a store's featured items, places to stay, stories, anything chosen by its look and compared a few at a time.
- **grid** — A grid of square pictures: photos, albums, apps, products, anything browsed by look in quantity.
- **reel** — A row that scrolls sideways: a shelf of suggestions or recent items above the rest of the screen.

#### item_leading → leading

HIG: a list row leads with what tells the rows apart at a glance: a photo, a symbol in a tinted square, a person's picture, nothing.

> If the screen shows a set of items, what kind of thing is each item?

- **avatar** — Each item is a person or an account.
- **thumbnail** — Each item is something the app would have a picture of: a product, a dish, a recipe, a property, a place, a trip, an animal, a film, an album, a story, an article, an event, a class or a course.
- **icon** — Each item is a record with nothing to photograph, which a symbol in a tinted square can stand for: a device, a file, a transaction, a reminder, a task, a category, a setting.
- **number** — The items are ranked or ordered and their position matters.
- **none** — Plain rows of text such as messages, notes or headlines.

#### item_trailing → trailing

HIG: a disclosure indicator for a row that opens another screen; a small capsule button for one action taken in the row; a switch; a selection circle in edit mode.

> If the screen shows a set of items, what does the person do with one item?

- **chevron** — Tapping an item pushes its own screen of details.
- **button** — Each item has one obvious action taken right in the list: get, follow, play, add, book, join.
- **switch** — Each item is something the person turns on or off.
- **checkbox** — The person selects several items, to act on them together.
- **none** — The items are only read.

#### item_description

> If the screen shows a set of items: does each item need a sentence of description, beyond a title and a short secondary line?

+ Articles, search results, recommendations, jobs: a title alone does not say enough.
- Names, products, messages, records: a title and one short line identify the item.

#### item_price

> If the screen shows a set of items: does each item have a price or an amount of money?

+ Things bought, booked or paid for: products, restaurants, tickets, rooms, services, transactions, line items.
- Things that cost nothing to pick: messages, people, files, tasks, devices.

#### item_rating

> If the screen shows a set of items: does each item have a rating or review score?

+ Things people review: restaurants, hotels, products, films, books, apps, service providers such as walkers or drivers.
- Things nobody reviews: messages, tasks, files, devices, transactions, the person's own records.

#### item_status

> If the screen shows a set of items: does each item have a status or state?

+ Orders, tasks, tickets, devices, deliveries, bookings, payments: active, pending, delayed, sold out, offline.
- Things that simply exist, with no state to report: products, places, articles, people.

#### item_time

> If the screen shows a set of items: does each item have a date, a time or a duration that matters?

+ Events, messages, appointments, episodes, deliveries, transactions, reservations, anything wanted for today or tonight.
- Timeless things: products, places, settings, people.

#### item_progress

> If the screen shows a set of items: does each item have progress toward completion, or a level between empty and full?

+ Downloads, courses, goals, budgets, batteries, storage, tasks part-way done.
- Nothing about the item is part-way.

#### item_tone (of each item in items)

> For the person looking at the screen, what is the state of {item}?

- **success** — Good news or a healthy state: done, available, on time, paid, active, in stock.
- **warning** — Needs attention soon: low, delayed, pending, degraded, expiring, almost full.
- **danger** — Bad news: failed, overdue, critical, cancelled, offline, out of stock.
- **accent** — A highlight and not a state: new, featured, popular, recommended.
- **neutral** — Plain information that is neither good nor bad.

#### item_icon (of each item in items)

> Which symbol best stands for {item}?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

### groups → groups

HIG inset grouped lists: rows of settings under short uppercase headings, each row ending in the control it needs; a destructive action is a red row, not a button.

> Does the screen consist of rows of settings or options the person turns on, picks or opens?

+ Preferences, toggles, account options, menu entries.
- Nothing on the screen is a setting or a menu entry.

- `groups` 2–5, as groups — Groups of related settings. The last group holds account-level actions if there are any, sign out last.
  - `title` as title — Group heading, one or two words.
  - `rows` 1–6, as rows — Rows in this group.
    - `label` as label — The setting or option.
    - `detail` as detail, optional — ONLY if the label needs explaining: one short line.
    - `value` as value, optional — ONLY for a setting with one current value picked from several: that value, e.g. 'English', 'High quality', '15 seconds'. Never for on/off settings.
    - `icon` as icon, decided by row_icon, all or none
    - `control` as control, decided by row_control
    - `on` as on, decided by row_on, one where row_control is check

#### row_control (of each row in rows, within each group in groups)

HIG: a switch for one on/off setting that takes effect at once; a disclosure indicator for a row that pushes another screen; a value beside the label for a setting picked elsewhere; a checkmark for one of several options; red text for a destructive action.

> `{row}` is a row in the supplied screen and section. Grouped rows can represent content, navigation, settings or actions; use their actual text and context to decide.
>
> What kind of row is {row}?

- **switch** — A setting that is simply on or off and takes effect at once: notifications, dark mode, autoplay, sync.
- **value** — A setting with one current value picked from several, changed on another screen: language, quality, theme, frequency, units.
- **nav** — A row that pushes another screen: a content item, details, account, privacy, help, about, or managing something. Its text and section identify what it opens.
- **check** — One of several alternative options listed together, of which one is chosen with a checkmark: the choices of a single setting, such as '10 seconds', '30 seconds', 'High', 'Low'.
- **danger** — A final or destructive account action, in red: sign out, delete account, clear data, reset.

#### row_on (of each row in rows, within each group in groups)

> `{row}` is a row in the supplied screen and section. Grouped rows can represent content, navigation, settings or actions; use their actual text and context to decide.
>
> If {row} is an on/off setting, would a typical person have it switched on?

+ Most people leave it on: notifications for what they signed up for, sync, autoplay, sound.
- Most people leave it off: marketing, a beta, a mode that changes how things look or work.

#### row_icon (of each row in rows, within each group in groups)

> Which symbol best stands for {row}?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

### text → prose

> Does the screen need a paragraph or more of explanatory text?

+ A description, an article, an explanation, terms, or the consequences of a decision.
- Titles and short labels are enough.

- `body` as body — Body text. Simple markdown (bold, short bullet lists) is allowed.

### details → details

> Is there a set of label-and-value details to show?

+ Specifications, order totals, dates, addresses, prices, attributes or a summary.
- There are no discrete label-and-value details.

- `details` 2–8, as rows — Label-value details.
  - when details_total is yes — The last one is the total.
  - `label` as label — Short label.
  - `value` as value — Short value.
  - `strong` as strong, computed, when details_total is yes

#### details_total

> If the screen shows label-and-value details, do they add up to a total on the last line?

+ An order summary, a bill, a receipt or a cost breakdown.
- Independent details that do not sum.

### steps → steps

> Does the screen show steps to follow in order?

+ A how-to, a recipe method, a procedure, a checklist, an itinerary.
- Nothing needs to be followed in order.

- `steps` 2–8, as steps — Ordered steps.
  - `title` as title — Imperative step title.
  - `detail` as detail — One or two sentences.

### form → form

HIG: form fields sit in inset grouped rows, labels leading and values trailing; the sheet's Done submits them, so the form's own button is rare.

> Does the person type in or pick values on this screen that are then submitted together?

+ Sign-up, booking, payment details, an address, a survey, creating or editing a record.
- The person only reads, toggles settings or presses buttons.

- `heading` as heading — Heading above the fields.
- `submitLabel` as submit — Label of the submit button, e.g. 'Save', 'Book', 'Sign Up'.
- `fields` 1–8, as fields — The input fields.
  - `label` as label — Field label.
  - `placeholder` as placeholder — Example of what a person would enter, e.g. 'Jane Appleseed', 'name@example.com'.
  - `options` 2–8, as options, optional — ONLY for fields where the person picks from three or more known choices. Never for yes/no fields.
    - each — Option label.
  - `min` number, as min, optional — ONLY for bounded numeric fields.
  - `max` number, as max, optional — ONLY for bounded numeric fields.
  - `kind` as kind, decided

### features → collection with layout rows, leading icon, trailing none

HIG onboarding: a short list of what the app does, each a symbol, a bold title and a line, and nothing else.

> Does the screen introduce the app or what is new in it, as a few features?

+ A welcome, a first run, a what's-new, an introduction to a feature.
- The person is using the app, not being introduced to it.

- `items` 3–4, as items — Three or four features, most important first.
  - `title` as headline — Two to four words.
  - `description` as supporting — One sentence, what it does for the person.
  - `icon` as icon, decided by feature_icon

#### feature_icon (of each feature in items)

> Which symbol best stands for {feature}?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

### buttons → actions

HIG: one filled button for the thing the person came to do; an alert's buttons side by side when there are two, stacked when there are more; Cancel last; a destructive one in red.

> Does the screen end in buttons that act on the whole screen?

+ Buy, book, confirm, delete, continue, share, save, contact, cancel.
- The screen is for reading or browsing, or its only action is submitting its form.

- `actions` 1–5, as actions — The buttons, one or two on most screens, the main one first and Cancel last if there is one.
  - when kind is alert — Two buttons, the confirming one first and Cancel second; three only if there are three real choices.
  - when kind is choices — Two to four choices, and then always one more button labelled 'Cancel', last.
  - `label` as label — Button label, one to three words.
  - `variant` as variant, decided by main
  - `closes` as closes, decided by dismisses

#### destructive (once written)

> Does the main action of this screen delete, cancel or otherwise destroy something that cannot be recovered?

+ Delete, remove, discard, sign out, clear, reset, cancel an order.
- Save, continue, confirm, buy, send, allow: nothing is lost.

#### main (among each action in actions)

HIG: one filled button per screen; the rest are plain.

> Which button is the main thing the person came to this screen to do?

+ `primary` It is the one.
- `secondary` It is one of the others.

#### dismisses (of each action in actions)

HIG: a button with the cancel role closes the alert, action sheet or sheet it is on and does nothing else; every alert that asks for a decision has one.

> Does tapping {action} only close what it is on and go back, with nothing done?

+ Cancel, Close, Not now, No thanks, Never mind, Keep editing, Go back; an OK that only acknowledges a message.
- Delete, Save, Confirm, Allow, Restore, Sign out, Buy, Continue, Share, or one of the choices of an action sheet: it does what the screen is about.

## person → opening

> Is this screen about one person or account, such as a contact or a profile?

+ `person` A user profile, a contact card, a member page, an account overview.
- `title` It is about things, data, tasks or settings, or about many people at once.

## tab_root → navigation

HIG tab bars: two to five destinations the person moves between at the top level of the app.

> Is this one of the app's tab bar destinations, the screen a tab opens on?

+ A home, an inbox, a library, a store front, a search tab, a profile tab.
- A screen reached by tapping into something: details, a settings screen, a sheet, an alert.

### nav

Written once for an app, on its first tab root; every tab root after that shows the same one. It fills the tab bar.

- `items` 2–5, as destinations — The app's two to five tabs.
  - `label` as label — One word.
  - `icon` as icon, decided by destination_icon
- `active` integer, as active — Index of the tab this screen belongs to.

#### destination_icon (of each destination in items)

> Which symbol best stands for {destination} of the app's tab bar?

among [icons](../icons.md)

- **none** `circle` — No symbol in the set relates to it.

## sheet → presentation

HIG modality: a sheet for a self-contained task that the person completes or cancels; a push for a place in the app's hierarchy that they navigate into and back out of.

> Is this screen a self-contained task the person starts, completes and dismisses, rather than a place they navigate into and back out of?

+ `sheet` Composing, adding, editing, filtering, choosing options, a quick look at one thing from a map or a list, anything ended with Done or Cancel.
- `push` Details, a category, a settings screen, an account, anything the person reads and then goes back from.

## editable → trailing

HIG: a collection the person rearranges, selects several of or deletes from is edited from an Edit button in its bar, which becomes Done.

> Does the person rearrange, select several of or delete from the things on this screen, from an Edit button in its bar?

+ `edit` Mail, notes, reminders, favourites, downloads, the person's own lists.
- `none` A store's items, results, other people's content, settings, anything not theirs to edit in place.

## bar_action → action

HIG navigation bars: at most one or two actions at the trailing edge, as symbols; the compose action of Mail, the plus of Reminders, the share of Safari.

> Which single action belongs at the trailing edge of the screen's navigation bar?

- **none** — The screen needs no action in its bar.
- **add** — The person creates new items here: a new message, task, record, event or entry.
- **share** `ios_share` — The content is something people send to others.
- **more** `more_horiz` — There are several minor actions, none of them the main one.
- **filter** `filter_list` — There are many items, and ways to narrow them that a search does not cover.
- **info** — There is more to know about the thing shown: details, about, help.
- **bookmark** — The thing shown is something people save for later.
- **settings** — A home or profile tab from which preferences are reached.

## hero_subject

> If a large picture leads this screen, what is it a picture of?

among [subjects](../subjects.md)

## item_subject

> If each item on this screen has its own picture, what are those pictures of?

among [subjects](../subjects.md)

## screen_icon → symbol

> Which symbol best stands for what this screen is about?

among [icons](../icons.md)

## no_photographs (given)

What the DESIGN.md rules out, given by the tool and not asked: a design can say there are no pictures, no symbols or no cards, and the rules below say what that does to the screen. Given nothing, a design rules nothing out.

> Does the design say there are no photographs?

+ Its prose says there are no photographs, or that its pictures are drawn.
- It shows photographs, or says nothing about it.

## no_symbols (given)

> Does the design say there are no symbols?

+ Its prose says there are no icons.
- It uses symbols, or says nothing about it.

## no_cards (given)

> Does the design say content is not set in cards?

+ Its prose says content flows on the page without cards.
- It sets content in cards, or says nothing about it.

## Rules

- when kind is browse, tab_root is yes — a tab's root is what a tab opens on
- when kind is browse, sheet is no — a tab's root is not a task; it is where the person starts
- when kind is alert, tab_root is no — an alert is over a screen, not one of the tabs
- when kind is choices, tab_root is no — an action sheet is over a screen, not one of the tabs
- when kind is compose, tab_root is no — a sheet is not one of the tabs
- when kind is done, tab_root is no — how something went is not one of the tabs
- when kind is welcome, tab_root is no — the first run comes before the tabs
- when kind is alert, bar_action is none — an alert has no bar
- when kind is choices, bar_action is none — an action sheet has no bar
- when kind is welcome, bar_action is none — a welcome screen has nothing but its features and its button
- when kind is done, bar_action is none — an outcome has nothing to act on but its buttons
- when kind is compose, bar_action is none — a sheet's bar has Cancel and Done, and the task is the form
- when kind is alert, editable is no — an alert has no bar
- when kind is choices, editable is no — an action sheet has no bar
- when kind is compose, editable is no — a sheet's bar has Cancel and Done, and no room for Edit
- when kind is not browse, editable is no — only the person's own collection, at the top of a tab, is edited from its bar
- when kind is not detail, person is no — only a screen about one thing can be about one person
- when person is yes, no hero — a contact opens with the person, and a lead photograph would compete with them
- when no_photographs is yes, no hero — the design has no photographs, so nothing leads with one
- when no_photographs is yes and item_leading is thumbnail, item_leading is icon — the design has no photographs, so items are led by a symbol instead
- when no_symbols is yes and item_leading is icon, item_leading is none — the design has no symbols either
- when no_cards is yes and list_layout is cards or reel, list_layout is rows — the design sets nothing in cards
- when item_leading is not thumbnail, list_layout is rows — picture layouts are for things with a look; anything else is scanned as rows
- when item_leading is avatar, item_subject is portrait — people are pictured as portraits, whatever the screen is about
- when no list, custom_linked is no — with no list there are no items for it to draw
- when row_control is value and no value, row_control is nav — a row can only show a value if one was written
- when row_control is switch and value, row_control is value — a row that has a value is not a switch
- when row_control is check, row_icon is none — options to pick among are told apart by their words, and a group with any of them has no symbols
- when row_control is check, no value — which option is chosen is shown by the checkmark
- when destructive is yes and main is primary, main is danger — if it destroys something, it says so in red

## Examples

- The inbox of a mail app → kind is browse, list, search, tab_root is yes, editable is yes
- The person's library of downloaded podcast episodes → kind is browse, list, tab_root is yes
- Search results for "pasta" among the recipes → kind is browse, list, search
- A store front of featured apps and games → kind is browse, list, tab_root is yes, editable is no
- Settings for a podcast app: playback, downloads, notifications, account → kind is settings, groups, tab_root is no
- Notification settings: which alerts to get and how → kind is settings, groups
- A product page for a pair of running shoes → kind is detail, hero, buttons, sheet is no
- A contact card: name, phone, email, address → kind is detail, person is yes, no hero
- A recipe for lasagne: ingredients and method → kind is detail, steps, sheet is no
- One email, opened from the inbox → kind is detail, text, sheet is no
- New event: title, location, date and time, alerts → kind is compose, form, sheet is yes
- Edit profile: name, bio, photo → kind is compose, form
- Filter the results: price, distance, rating → kind is compose, form, sheet is yes
- Delete this note? It cannot be undone → kind is alert, buttons, text
- Sign out of your account? → kind is alert, buttons
- Allow the app to use your location while you use it? → kind is alert, buttons
- Share this photo: Messages, Mail, Copy, Save to Files → kind is choices, buttons
- Sort the list by: date, name, size → kind is choices, buttons
- Welcome to the app: what it does for you, and a button to get started → kind is welcome, features, buttons
- What's new in this version → kind is welcome, features
- Your order is confirmed → kind is done, buttons
- Payment failed: try another card → kind is done, buttons
- A quick look at one restaurant, from the map → kind is detail, sheet is yes
- Today's health summary: steps, sleep, heart rate → kind is browse, stats, tab_root is yes
