# kit

What the kit can draw, for a graph to name: a part says `→ collection` after its heading, its fields say `as headline`, and a question under it says `→ layout`. Each pattern below is what it is for, the slots a graph's fields can fill, and the knobs a graph's answers can turn. Written out from src/server/grammar/patterns.ts by `npm run grammar:export`.

## banner

One thing that needs attention before anything else, set apart in a tinted band (Polaris).

- `title` required — what needs attention
- `text` — a sentence of detail
- `tone` — success, warning, danger or accent

## picture

One large picture that leads, the full width of what it is in.

- `picture` required — the address of the picture

## filters

Ways to narrow down what is shown: a row of category chips, under a search field when there is one.

- `search` — the placeholder of a search field; with none, there is no field
- `chips` required — the categories

## slot

A box of a fixed shape for something no catalog has. What fills it arrives later, the way a picture does.

- `use` required — which definition fills it
- `data` — what the definition draws
- `selection` — what the person picked in it
- `failed` — that nothing could be made to fill it
- `items` — a list from elsewhere on the screen, when it draws those

### ratio

`3:1` `16:9` `1:1` `3:4`

## stats

A few headline numbers at a glance, as tiles that reflow (the KPI card: Tremor, shadcn/ui).

- `stats` required
  - `label` required
  - `value` required — the figure, with its unit
  - `delta` — the change against last time
  - `tone` — whether that change is good news

## collection

Several similar things to look through: dense rows, large picture cards, a grid of tiles or a sideways reel (Material 3 list item; NN/g on cards and grids).

- `heading` — a title above them
- `action` — the label of the one button every item has, when trailing is button
- `items` required
  - `headline` required — the name of the thing
  - `supporting` — up to two lines; of two, the first goes above the headline
  - `meta` — the one figure people compare on; any more are set below as captions
  - `rating` — a number out of five
  - `count` — how many ratings
  - `badge` — a word or two of state
  - `progress` — a percentage
  - `tone` — what colours the badge and the progress
  - `picture` — the address of the item's picture, or portrait
  - `icon` — the name of a symbol, when leading is icon
  - `on` — whether it is switched on or ticked

### layout

`rows` `cards` `grid` `reel`

### leading

`avatar` `thumbnail` `icon` `number` `none`

### trailing

`chevron` `button` `switch` `checkbox` `none`

## groups

Rows of settings or options under quiet headings, each ending in the control it needs (iOS inset grouped lists).

- `groups` required
  - `title` — the heading of a group
  - `rows` required
    - `label` required
    - `detail` — a line of explanation
    - `value` — the setting's current value
    - `icon` — the name of a symbol
    - `control` — switch, value, nav, check or danger
    - `on` — whether it is switched on or chosen

## details

Label-and-value details in one card: specifications, a summary, a bill whose last line is its total.

- `rows` required
  - `label` required
  - `value` required
  - `strong` — that this row is the one the others add up to

## prose

A paragraph or more of running text; simple markdown is drawn.

- `body` required

## steps

Steps to follow in order, numbered.

- `steps` required
  - `title` required
  - `detail`

## form

Fields the person fills in and submits together, under a heading, ending in the one button that submits them.

- `heading` required
- `submit` required — the label of the button
- `fields` required
  - `label` required
  - `kind` — text, long, number, password, date, time, dateTime, select, chips, multi, slider or checkbox
  - `placeholder`
  - `options` — what there is to pick from
  - `min`
  - `max`

## actions

One or two buttons that act on the whole of what is shown, the main one marked.

- `actions` required
  - `label` required
  - `variant` — primary, secondary, text or danger
