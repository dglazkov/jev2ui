# screen

> Design the destination requested in `screen`. Work out what that destination is made of. If present, `first_screen` is the original app brief and `reached_by` describes the source screen and how the person left it. Those are background context: their layouts and purposes do not define the destination being requested. A source section describes where a link was selected, not a section to recreate on the destination.

The graph of one screen of an apparition: what kind of screen it is, which parts it has, and what each part is made of. Written out from src/server/mock/plan.ts by `npm run grammar:export`; docs/grammar.md says how to read it.

## archetype

The order of the parts is not asked. It belongs to the kind of screen, where the best practice lives.

> What kind of screen is this?

- **feed** — A collection to look through: search results, a catalogue, a feed, an inbox, a directory, a list of records.
  `filters? banner? hero? custom? LIST`
- **dashboard** — Numbers and status at a glance: usage, health, progress, balances, today's summary.
  `banner? custom? STATS facts? list?` at least 2
- **detail** — One thing in depth: a product, a place, an article, a profile, an event, an order, a recipe's overview.
  `hero custom? stats? prose facts steps? list? actions?` at least 2, sticky actions
- **guide** — Instructions followed in order: a how-to, a method, troubleshooting, an onboarding checklist.
  `hero prose? custom? facts? STEPS actions?` at least 2, sticky actions
- **settings** — Preferences, account options or configuration, arranged as groups of rows.
  `banner? GROUPS actions?`
- **form** — Data entry: sign-up, booking, creating or editing a record, a survey, a contact form.
  `prose? custom? FORM`
- **checkout** — Review and commit: a cart, a checkout, an order or booking summary with totals, payment.
  `banner? custom? list facts form? actions?` at least 2, sticky actions
- **result** — The outcome of something the person just did: a success message, a confirmation, a receipt, an error, nothing found.
  `prose? facts steps? actions` outcome
- **confirm** — One short decision about one thing, asked before it happens: confirm, delete, approve, allow, a dialog or alert.
  `prose facts? actions` at least 2, dialog

### banner (never padding)

Polaris: banners are for important, often time-sensitive status; use sparingly.

> Does something on this screen need the person's attention before anything else?

+ There is a warning, an outage, a deadline, an error, an offer about to expire, or a success to acknowledge.
- Nothing unusual is going on; the screen is business as usual.

### hero

> Should a large picture lead this screen?

+ One visual subject leads: a place, dish, product, property, animal, trip, event, class, film, story, character or something being made. A content home or discovery feed can also lead with featured content or artwork before its supporting items.
- The subject has no look: an order, an account, a transaction, a message, a setting, a set of figures. A plain results list or directory has no featured visual subject.

### filters

> Will the person need to search or narrow down what is shown?

+ There are many items, more than fit on a screen, in recognisable categories.
- There are only a few items, or nothing to narrow.

#### search

> If the person narrows down what is shown, would they type a search?

+ There are too many items to scan, or the person knows the name of what they want.
- A handful of category filters is enough.

### custom (never padding)

The one part the kit has no component for. What it is gets baked at run time; the graph only knows that it is there, and what it is held to.

> Is the heart of this screen something that has to be drawn specially for it?

+ A map, a seating plan, a timer face, a dial, a game board, a floor plan, a piano keyboard, a colour wheel, a chart, a month calendar, a body diagram.
- Everything on it can be shown with lists, cards, photographs, figures, text, form fields and buttons.

#### custom_use

> If the screen has something drawn specially for it, what does the person do with that thing?

- **watch** — It shows something that changes on its own and the person keeps an eye on: a timer, a gauge, a tuner, a live position, a level.
- **pick** — The person picks one or more parts of it: a seat, a day, a table, a room, a place on a map.
- **adjust** — The person drags, turns or plays it directly: a dial, a colour wheel, a keyboard, a board with pieces, a drawing surface.
- **read** — It is a picture of data or of a place that the person only reads: a chart, a diagram, a route, a plan.

#### custom_size

> If the screen has something drawn specially for it, how much room does that thing need?

- **strip** `3:1` — A thin band across the screen: a sparkline, a timeline, a week of days, a waveform.
- **wide** `16:9` — A landscape panel: a chart, a small map, a route preview.
- **square** `1:1` — A square: a ring, a dial, a clock face, a board, a wheel.
- **tall** `3:4` — Most of the height of the screen: a map to explore, a seating plan, a floor plan, a month calendar.

#### custom_linked

> If the screen has something drawn specially for it, does that thing show the very same items that the screen also lists?

+ Pins for the places in the list, bars for the categories in the list, dots for the events in the list.
- It shows one thing of its own, or the screen has no list of items.

### stats

> Are there a few headline numbers the person wants at a glance?

+ Key figures such as totals, counts, rates, balances, scores, durations or usage.
- There are no headline numbers.

#### stat_deltas

> If the screen shows headline numbers, do they change over time in a way the person tracks?

+ Usage, spending, revenue, health or performance figures compared with yesterday, last week or a target.
- Fixed figures, such as counts or specifications, with nothing to compare against.

### list

> Does the screen show several similar items?

+ Results, products, people, records, messages, line items, episodes, devices or any set of comparable things.
- The screen is about one thing, or only about settings or input.

#### list_layout

Cards and grids are for browsing by look; rows are for scanning text (NN/g, Material).

> If the screen shows a set of items, how should they be laid out?

- **rows** — Dense rows to scan quickly: text matters more than pictures, or there are many items.
- **cards** — Large picture cards, one per row: people choose mostly by look and compare a few rich items, such as places to stay or restaurants.
- **grid** — A grid of small picture tiles: many visual items browsed casually, such as products, photos or albums.
- **reel** — A sideways-scrolling row of picture cards: a short shelf of suggestions, such as films or featured items.

#### item_leading

Material 3 list item: the leading slot says what kind of thing each item is.

> If the screen shows a set of items, what kind of thing is each item?

- **avatar** — Each item is a person or an account.
- **thumbnail** — Each item is something the app would have a picture of: a product, a dish, a recipe, a property, a place, a trip, an animal, a film, an album, a story, an article, an event, a class or a course.
- **icon** — Each item is a record with nothing to photograph, which a small symbol can stand for: a device, a file, a transaction, a reminder, a task, a category.
- **number** — The items are ranked or ordered and their position matters.
- **none** — Plain rows of text such as messages, notes or headlines.

#### item_trailing

Material 3 list item trailing slot; HIG disclosure indicators; Material selection controls.

> If the screen shows a set of items, what does the person do with one item?

- **chevron** — Tapping an item opens its own page of details.
- **button** — Each item has one obvious action taken right in the list: book, add, buy, follow, play, join.
- **switch** — Each item is something the person turns on or off.
- **checkbox** — The person ticks several items, to complete them or to act on them together.
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

### groups

> Does the screen consist of rows of settings or options the person turns on, picks or opens?

+ Preferences, toggles, account options, menu entries.
- Nothing on the screen is a setting or a menu entry.

### facts

> Is there a set of label-and-value details to show?

+ Specifications, order totals, dates, addresses, prices, attributes or a summary table.
- There are no discrete label-and-value details.

#### facts_total

> If the screen shows label-and-value details, do they add up to a total on the last line?

+ An order summary, a bill, a receipt or a cost breakdown.
- Independent details that do not sum.

### prose

> Does the screen need a paragraph or more of explanatory text?

+ A description, an article, an explanation, terms, or the consequences of a decision.
- Titles and short labels are enough.

### steps

> Does the screen show steps to follow in order?

+ A how-to, a recipe method, a procedure, a checklist, an itinerary.
- Nothing needs to be followed in order.

### form

> Does the person type in or pick values on this screen that are then submitted together?

+ Sign-up, booking, payment details, an address, a survey, creating or editing a record.
- The person only reads, toggles settings or presses buttons.

### actions

> Does the screen end in one or two buttons that act on the whole screen?

+ Buy, book, confirm, cancel, start, share, save, contact.
- The screen is for reading or browsing, or its only action is submitting its form.

## person

> Is this screen about one person or account, such as a profile?

+ A user profile, a contact, a member page, an account overview.
- It is about things, data, tasks or settings, or about many people at once.

## top_level

> Is this one of the app's main screens, the kind reached from its main navigation?

+ A home, feed, dashboard, inbox, search, library or profile screen.
- A page reached by tapping into something: details, a settings page, a checkout, a form, a dialog.

## app_bar_action

Material top app bar: at most a couple of actions, the most used one first. What an option yields is the name of its symbol.

> Which single action belongs in the screen's top bar?

- **none** — The screen needs no action in its top bar.
- **search** — The person will look for something specific among the content.
- **add** — The person creates new items here: a new message, task, record or entry.
- **edit** — The content belongs to the person and they may want to change it.
- **share** — The content is something people send to others.
- **favorite** — The thing shown is something people save for later or mark as a favourite.
- **notifications** — A home or overview screen where alerts are one tap away.
- **settings** — A home, profile or overview screen from which preferences are reached.
- **more** `more_vert` — There are several minor actions, none of them the main one.

## hero_subject

> If a large picture leads this screen, what is it a picture of?

among [subjects](subjects.md)

## item_subject

> If each item on this screen has its own picture, what are those pictures of?

among [subjects](subjects.md)

## screen_icon

> Which symbol best stands for what this screen is about?

among [icons](icons.md)

## Rules

- when form, no actions — a form's submit button is the screen's call to action; a second set of buttons only competes with it
- when archetype is checkout and no form, actions — a checkout is where the person commits; with no form to submit, it needs a button to do it with
- when archetype is confirm, top_level is no — a dialog is not a main screen
- when archetype is result, top_level is no — how something went is not a main screen
- when archetype is confirm, app_bar_action is none — a dialog has no top bar
- when archetype is not detail, person is no — only a page about one thing can be about one person
- when item_leading is not thumbnail, list_layout is rows — picture layouts are for things with a look; anything else is scanned as rows
- when no list, custom_linked is no — with no list there are no items for it to draw

## Examples

- Pomodoro timer → custom, custom_use is watch
- Pick your seats for a concert at the Royal Albert Hall → custom, custom_use is pick
- Find coffee shops near me on a map → custom, custom_use is pick
- Piano practice app: play notes on a keyboard → custom, custom_use is adjust
- Chess puzzle of the day → custom, custom_use is adjust
- Floor plan of my apartment showing which smart lights are on → custom, custom_use is pick
- Guitar tuner → custom, custom_use is watch
- Live delivery tracking: where is my courier right now → custom, custom_use is watch
- Colour picker for a paint app → custom, custom_use is adjust
- Stock price chart for AAPL over the last year → custom, custom_use is read
- Sleep stages from last night → custom, custom_use is read
- Thermostat control for the living room → custom, custom_use is adjust
- Choose a table at the restaurant → custom, custom_use is pick
- Month calendar of my cycle for a period tracker → custom, custom_use is pick
- Compass → custom, custom_use is watch
- Find a dog walker: nearby walkers with ratings
- Home energy dashboard showing today's usage
- Settings screen for a podcast app → no custom
- Checkout for a sneaker store, with order summary → no custom
- Sign-up form for a weekend pottery workshop → no custom
- Recipe page for sourdough bread → no custom
- Confirm deleting my account → no custom
- Kubernetes cluster health for on-call engineers → no custom
- Bedtime story picker for a kids' reading app → no custom
- Send $50 to Alex → no custom
- Inbox for a team chat app → no custom
- Tell me about the Golden Gate Bridge → no custom
- Pick a movie for family night → no custom
- Order history for a grocery delivery app → no custom
- Profile page for a freelance illustrator → no custom
