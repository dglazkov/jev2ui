# ios

What the tool can draw the way iOS lays a screen out, for a graph to name. The patterns are the kit's (kit.md), drawn with the same components and painted by the idiom's stylesheet; the frame is the Human Interface Guidelines': a navigation bar, a large title on a main screen, a tab bar, an alert. Written out from src/server/grammar/patterns-ios.ts by `npm run grammar:export`.

## page

A screen of an iOS app: a navigation bar with what leads and the one action, a large title on a main screen or the title in the bar on a pushed one, the parts below, a tab bar of the app's main destinations on a main screen, a call to action pinned to the bottom edge, or an alert over it all (HIG navigation bar, tab bar, alert).

- `title` required — what the screen is called; on a profile, who it is about
- `subtitle` — one line under it: a person's line, how it went, an introduction
- `portrait` — the address of the person's picture, on a profile
- `destinations` — the app's main destinations, for the tab bar
  - `label` required
  - `icon` — the name of a symbol
- `active` — which of the destinations this screen is

### opening

how the screen opens: with its title, large on a main screen and in the bar on a pushed one; with the person it is about; or with how something went, a symbol and a headline in place of a title

`title` `person` `outcome`

### leading

what leads the bar on a screen that is not a main one: a back chevron, or a close button, or nothing. A main screen is a tab's root and its bar leads with nothing whatever is set; unset, the rest lead with a back chevron

`back` `close` `none`

### action

the symbol of the one action at the trailing edge of the bar, or none. It takes any name.

### navigation

whether the tab bar of the app's main destinations is shown: on a main screen

`yes` `no`

### sticky

the name of the part pinned to the bottom edge, so that a call to action is always in reach, or none. It takes any name.

### dialog

an alert over the screen: the title and the parts centred in a small card, the buttons stacked under a hairline, and no bar

`yes` `no`

### intro

a line of introduction under the title, from the subtitle: for a kind of screen its title does not explain

`yes` `no`

### symbol

the symbol of what the screen is about, shown by an outcome, or none. An alert shows none. It takes any name.

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

- `items` — a list from elsewhere, when what fills the slot draws those

### ratio

the shape of the box

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

how the things are laid out: dense rows, large picture cards, a grid of tiles, a sideways reel

`rows` `cards` `grid` `reel`

### leading

what leads each row: a portrait, a thumbnail, a symbol, its number, or nothing

`avatar` `thumbnail` `icon` `number` `none`

### trailing

what ends each row: a chevron into its page, a button, a switch, a checkbox, or nothing

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
