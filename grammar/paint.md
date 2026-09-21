# paint

> brief describes an app, or one screen of an app. A visual style is being chosen that suits the product and the people who use it. If the brief asks for a style or color outright, follow it.

The graph of a design mixed from a brief, when the developer brings no DESIGN.md. Written out from src/server/design-mix.ts by `npm run grammar:export`; docs/grammar.md says how to read it.

## hue (circular)

A rubric has two ends and hue is a circle, so hue is a choice among named hues. What an option yields is its angle in OKLCH; the answer is read as the circular mean of the winner and its neighbours.

> Which hue suits this product's accent color?

- **red** `27` — Red: urgency, appetite, passion, alerts, sales.
- **orange** `55` — Orange: energy, warmth, play, pets, construction.
- **amber** `78` — Amber and gold: honey, craft, premium warmth, beer, bakeries.
- **yellow** `100` — Yellow: sunshine, optimism, caution, taxis.
- **lime** `125` — Lime: zest, freshness, youth, sport.
- **green** `148` — Green: nature, health, money, growth, gardening.
- **teal** `185` — Teal: calm, clinical, wellness, balance.
- **cyan** `215` — Cyan: water, sky, clarity, swimming, cloud technology.
- **blue** `255` — Blue: trust, finance, productivity, corporate, communication.
- **indigo** `277` — Indigo: night, depth, focus, premium technology.
- **violet** `303` — Violet and purple: creativity, magic, music, luxury.
- **pink** `350` — Pink and magenta: fun, beauty, romance, sweets.

## dark

> Should this product's interface be dark, with light text on a dark background?

+ It is used at night or in dim rooms, it is a media, gaming, developer or monitoring tool, or the brief asks for dark.
- An everyday app used in daylight: a light background.

## type

> Which typefaces suit this product?

- **neutral** — A neutral sans-serif: utilitarian product UI that stays out of the way.
- **geometric** — A geometric grotesk: modern, technical, startup.
- **humanist** — A warm humanist sans-serif: approachable everyday consumer apps.
- **rounded** — Round, chunky letters: playful, casual, for children or treats.
- **editorial** — A high-contrast serif with a reading serif: news, literature, long-form.
- **elegant** — A fine, light display serif: luxury, fashion, hospitality, weddings.
- **mono** — Monospaced headings and labels: developer tools, terminals, instruments, data.
- **slab** — A sturdy slab serif: outdoors, tools, industry, heritage.
- **condensed** — Tall condensed capitals: sport, fitness, events, bold and loud.

## elevation

> How should this product show that a card sits above the page?

- **shadow** — Soft drop shadows under cards: friendly, tactile, consumer.
- **outline** — Flat, with thin borders and hairlines: precise, printed, technical.
- **tonal** — Flat, with layers told apart only by background color: quiet, minimal.

## photos

> Would pictures, photographed or drawn, belong anywhere in this product? A brief about its settings, login or checkout identifies an entry screen, not an app-wide ban on imagery. Respect an explicit request for no imagery.

+ The product has visual content or subjects: media artwork, places, food, products, animals, activities, events, people who are chosen or followed, stories, characters or games, even if its starting screen needs no pictures.
- The product as a whole is only figures, code, documents, system administration or infrastructure with nothing visual to show, or the brief explicitly rules out imagery throughout the app.

### photo_look

> If this product's screens show pictures, how should they look?

- **natural** — True colour: the pictures are what people choose by. Food, places to stay, products, homes, animals, anything bought by its look.
- **muted** — Softened and a little faded: a calm, minimal or premium product whose pictures should sit quietly. Wellness, journaling, interiors, reading, finance.
- **mono** — Black and white: news, literature, archives, heritage, serious editorial.
- **duotone** — Washed in the brand's colour: the pictures are atmosphere and not merchandise. Music, events, sport, nightlife, technology, communities.
- **illustrated** — Drawn and not photographed: the product is for children, or what it shows is imagined and no camera could capture it. Stories, characters, fairy tales, games, fantasy, dreams, lessons for the young.

## cards

> Should this product group content into cards?

+ Yes: separate objects, each in its own container.
- No: content flows on the page like a document, separated by whitespace and rules.

## vivid → accent chroma

> How vivid should this product's accent color be?

1. `0.04` Almost grey: dusty, muted, restrained.
2. `0.09` Soft and subdued.
3. `0.15` Clear and confident, like a typical brand color.
4. `0.21` Bright and saturated.
5. `0.3` Neon: as vivid as a screen can show.

## light

> How light or dark should this product's accent color be?

1. Very deep, like navy, oxblood or forest.
2. Deep.
3. A mid-tone.
4. Light.
5. A pale pastel.

## warmth

> Should this product's backgrounds and greys lean cold or warm?

1. Cold: blue-tinted steel greys.
2. Slightly cool.
3. Neutral: pure white and pure greys.
4. Slightly warm.
5. Warm: cream, sand and paper tones.

## round → corner radius, px

> How rounded should the corners of buttons, cards and inputs be?

1. `0` Square: sharp, engineered, printed.
2. `3` Barely softened.
3. `8` Moderately rounded.
4. `14` Very rounded and friendly.
5. `22` Pills and circles everywhere: bubbly, toy-like.

## air → spacing unit, px

> How much whitespace should this product's screens have?

1. `4` Packed: as much data per screen as possible, like a trading terminal.
2. `6` Compact.
3. `8` Regular.
4. `10` Roomy.
5. `12` Airy: one idea at a time with lots of space, like a luxury or wellness brand.
