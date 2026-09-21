// The grammar of a mock, and the questions that fill it.
//
// Jev cannot draw a tree, but it can choose, and a tree is a nest of choices:
//
//   archetype          which canonical layout this screen is; fixes which blocks
//                      are allowed and the order they come in
//     blocks           which of the allowed blocks are present
//       anatomy        each block's slots: what leads a list item, what trails
//                      it, which metadata it carries, how the list is laid out
//         instances    per row, badge and number, once the words exist: which
//                      control a setting gets, which icon, whether a status is
//                      good news (refine.ts)
//
// The first three levels depend only on the prompt, so they are asked together
// in one request and the whole tree ships before any text. Order is not asked:
// it is a property of the archetype, where the best practice lives.
//
// Design knowledge enters as the criteria of each option, which are the
// "when to use" lines of the systems the components come from (Material 3,
// Apple's HIG, Polaris, NN/g), rephrased as facts about the content, because
// Jev reads a situation far better than it judges a design.

import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import type { Decision } from "../../shared/events.js";
import { ICON_OPTIONS, readIcon } from "./icons.js";
import { SUBJECT_OPTIONS } from "./pictures.js";
import type { SubjectName } from "../photos/subjects.js";

const CONTEXT =
  "Design the destination requested in `screen`. Work out what that destination is made of. If present, `first_screen` is the original app brief and `reached_by` describes the source screen and how the person left it. Those are background context: their layouts and purposes do not define the destination being requested. A source section describes where a link was selected, not a section to recreate on the destination.";
const ask = (question: string) => ({ context: CONTEXT, question });

export const BLOCKS = ["banner", "hero", "filters", "custom", "stats", "list", "groups", "facts", "prose", "steps", "form", "actions"] as const;
export type Block = (typeof BLOCKS)[number];

interface Archetype {
  criteria: string;
  /** The blocks this kind of screen may have, in the order they appear. Anything else is not in the grammar. */
  order: Block[];
  /** What makes it this kind of screen: a feed without a list is not a feed. Present whatever Jev says. */
  requires?: Block[];
  /** Kept at even odds; the rest need Jev to be confident. */
  expects: Block[];
  /** A screen of this kind with a single block looks unfinished; the likeliest remaining blocks are added up to this many. */
  atLeast?: number;
  /** Commit-style screens keep their call to action pinned to the bottom edge (Material: bottom app bar; HIG: toolbar). */
  stickyActions?: boolean;
  dialog?: boolean;
  /** Opens with a symbol and a headline saying how it went, in place of an app bar title. */
  outcome?: boolean;
}

export const ARCHETYPES: Record<string, Archetype> = {
  feed: {
    criteria: "A collection to look through: search results, a catalogue, a feed, an inbox, a directory, a list of records.",
    order: ["filters", "banner", "hero", "custom", "list"],
    requires: ["list"],
    expects: ["list"],
  },
  dashboard: {
    atLeast: 2,
    criteria: "Numbers and status at a glance: usage, health, progress, balances, today's summary.",
    order: ["banner", "custom", "stats", "facts", "list"],
    requires: ["stats"],
    expects: ["stats"],
  },
  detail: {
    atLeast: 2,
    criteria: "One thing in depth: a product, a place, an article, a profile, an event, an order, a recipe's overview.",
    order: ["hero", "custom", "stats", "prose", "facts", "steps", "list", "actions"],
    // A page about one thing shows the thing. Jev hovers just under certainty for hikes, recipes and rooms, so the picture is expected and not an extra.
    expects: ["hero", "prose", "facts"],
    stickyActions: true,
  },
  guide: {
    atLeast: 2,
    criteria: "Instructions followed in order: a how-to, a method, troubleshooting, an onboarding checklist.",
    order: ["hero", "prose", "custom", "facts", "steps", "actions"],
    requires: ["steps"],
    expects: ["hero", "steps"],
    stickyActions: true,
  },
  settings: {
    criteria: "Preferences, account options or configuration, arranged as groups of rows.",
    order: ["banner", "groups", "actions"],
    requires: ["groups"],
    expects: ["groups"],
  },
  form: {
    criteria: "Data entry: sign-up, booking, creating or editing a record, a survey, a contact form.",
    order: ["prose", "custom", "form"],
    requires: ["form"],
    expects: ["form"],
  },
  checkout: {
    atLeast: 2,
    criteria: "Review and commit: a cart, a checkout, an order or booking summary with totals, payment.",
    order: ["banner", "custom", "list", "facts", "form", "actions"],
    expects: ["list", "facts"],
    stickyActions: true,
  },
  result: {
    criteria: "The outcome of something the person just did: a success message, a confirmation, a receipt, an error, nothing found.",
    order: ["prose", "facts", "steps", "actions"],
    expects: ["facts", "actions"],
    outcome: true,
  },
  confirm: {
    atLeast: 2,
    criteria: "One short decision about one thing, asked before it happens: confirm, delete, approve, allow, a dialog or alert.",
    order: ["prose", "facts", "actions"],
    expects: ["prose", "actions"],
    dialog: true,
  },
};
const EXPECTED_THRESHOLD = 0.4;
const EXTRA_THRESHOLD = 0.75;
/** Probed (src/probe/custom.ts): screens the kit can draw came back at 0.14 or less, the rest at 0.57 or more. */
const CUSTOM_THRESHOLD = 0.55;

const BLOCK_QUESTIONS: Record<Block, { q: string; yes: string; no: string }> = {
  banner: {
    q: "Does something on this screen need the person's attention before anything else?",
    // Polaris: banners are for important, often time-sensitive status; use sparingly.
    yes: "There is a warning, an outage, a deadline, an error, an offer about to expire, or a success to acknowledge.",
    no: "Nothing unusual is going on; the screen is business as usual.",
  },
  hero: {
    q: "Should a large picture lead this screen?",
    yes: "One visual subject leads: a place, dish, product, property, animal, trip, event, class, film, story, character or something being made. A content home or discovery feed can also lead with featured content or artwork before its supporting items.",
    no: "The subject has no look: an order, an account, a transaction, a message, a setting, a set of figures. A plain results list or directory has no featured visual subject.",
  },
  filters: {
    q: "Will the person need to search or narrow down what is shown?",
    yes: "There are many items, more than fit on a screen, in recognisable categories.",
    no: "There are only a few items, or nothing to narrow.",
  },
  custom: {
    // The one block the kit has no component for. What it is gets baked at run time (bake.ts); the grammar only knows that it is there.
    q: "Is the heart of this screen something that has to be drawn specially for it?",
    yes: "A map, a seating plan, a timer face, a dial, a game board, a floor plan, a piano keyboard, a colour wheel, a chart, a month calendar, a body diagram.",
    no: "Everything on it can be shown with lists, cards, photographs, figures, text, form fields and buttons.",
  },
  stats: {
    q: "Are there a few headline numbers the person wants at a glance?",
    yes: "Key figures such as totals, counts, rates, balances, scores, durations or usage.",
    no: "There are no headline numbers.",
  },
  list: {
    q: "Does the screen show several similar items?",
    yes: "Results, products, people, records, messages, line items, episodes, devices or any set of comparable things.",
    no: "The screen is about one thing, or only about settings or input.",
  },
  groups: {
    q: "Does the screen consist of rows of settings or options the person turns on, picks or opens?",
    yes: "Preferences, toggles, account options, menu entries.",
    no: "Nothing on the screen is a setting or a menu entry.",
  },
  facts: {
    q: "Is there a set of label-and-value details to show?",
    yes: "Specifications, order totals, dates, addresses, prices, attributes or a summary table.",
    no: "There are no discrete label-and-value details.",
  },
  prose: {
    q: "Does the screen need a paragraph or more of explanatory text?",
    yes: "A description, an article, an explanation, terms, or the consequences of a decision.",
    no: "Titles and short labels are enough.",
  },
  steps: {
    q: "Does the screen show steps to follow in order?",
    yes: "A how-to, a recipe method, a procedure, a checklist, an itinerary.",
    no: "Nothing needs to be followed in order.",
  },
  form: {
    q: "Does the person type in or pick values on this screen that are then submitted together?",
    yes: "Sign-up, booking, payment details, an address, a survey, creating or editing a record.",
    no: "The person only reads, toggles settings or presses buttons.",
  },
  actions: {
    q: "Does the screen end in one or two buttons that act on the whole screen?",
    yes: "Buy, book, confirm, cancel, start, share, save, contact.",
    no: "The screen is for reading or browsing, or its only action is submitting its form.",
  },
};

// --- Anatomy -----------------------------------------------------------------

/** Material 3 list item: the leading slot says what kind of thing each item is. */
const LEADING = {
  avatar: "Each item is a person or an account.",
  thumbnail: "Each item is something the app would have a picture of: a product, a dish, a recipe, a property, a place, a trip, an animal, a film, an album, a story, an article, an event, a class or a course.",
  icon: "Each item is a record with nothing to photograph, which a small symbol can stand for: a device, a file, a transaction, a reminder, a task, a category.",
  number: "The items are ranked or ordered and their position matters.",
  none: "Plain rows of text such as messages, notes or headlines.",
} as const;
export type Leading = keyof typeof LEADING;

/** Material 3 list item trailing slot; HIG disclosure indicators; Material selection controls. */
const TRAILING = {
  chevron: "Tapping an item opens its own page of details.",
  button: "Each item has one obvious action taken right in the list: book, add, buy, follow, play, join.",
  switch: "Each item is something the person turns on or off.",
  checkbox: "The person ticks several items, to complete them or to act on them together.",
  none: "The items are only read.",
} as const;
export type Trailing = keyof typeof TRAILING;

/** How the collection is laid out. Cards and grids are for browsing by look; rows are for scanning text (NN/g, Material). */
const LAYOUT = {
  rows: "Dense rows to scan quickly: text matters more than pictures, or there are many items.",
  cards: "Large picture cards, one per row: people choose mostly by look and compare a few rich items, such as places to stay or restaurants.",
  grid: "A grid of small picture tiles: many visual items browsed casually, such as products, photos or albums.",
  reel: "A sideways-scrolling row of picture cards: a short shelf of suggestions, such as films or featured items.",
} as const;
export type Layout = keyof typeof LAYOUT;

/** Bare questions came back near 0.5 for everything; with examples on both sides Jev commits. */
const ITEM_PARTS = {
  description: {
    q: "Does each item need a sentence of description, beyond a title and a short secondary line?",
    yes: "Articles, search results, recommendations, jobs: a title alone does not say enough.",
    no: "Names, products, messages, records: a title and one short line identify the item.",
  },
  price: {
    q: "Does each item have a price or an amount of money?",
    yes: "Things bought, booked or paid for: products, restaurants, tickets, rooms, services, transactions, line items.",
    no: "Things that cost nothing to pick: messages, people, files, tasks, devices.",
  },
  rating: {
    q: "Does each item have a rating or review score?",
    yes: "Things people review: restaurants, hotels, products, films, books, apps, service providers such as walkers or drivers.",
    no: "Things nobody reviews: messages, tasks, files, devices, transactions, the person's own records.",
  },
  status: {
    q: "Does each item have a status or state?",
    yes: "Orders, tasks, tickets, devices, deliveries, bookings, payments: active, pending, delayed, sold out, offline.",
    no: "Things that simply exist, with no state to report: products, places, articles, people.",
  },
  time: {
    q: "Does each item have a date, a time or a duration that matters?",
    yes: "Events, messages, appointments, episodes, deliveries, transactions, reservations, anything wanted for today or tonight.",
    no: "Timeless things: products, places, settings, people.",
  },
  progress: {
    q: "Does each item have progress toward completion, or a level between empty and full?",
    yes: "Downloads, courses, goals, budgets, batteries, storage, tasks part-way done.",
    no: "Nothing about the item is part-way.",
  },
} as const;
export type ItemPart = keyof typeof ITEM_PARTS;

// --- The contract of a custom component -----------------------------------------
// Jev cannot say what the thing is, and does not have to: the description already does. It settles what the
// thing is held to, so that whatever gets baked fits the screen: what the person does with it, the box it gets,
// and whether it shows the list's own items.

const CUSTOM_USE = {
  watch: "It shows something that changes on its own and the person keeps an eye on: a timer, a gauge, a tuner, a live position, a level.",
  pick: "The person picks one or more parts of it: a seat, a day, a table, a room, a place on a map.",
  adjust: "The person drags, turns or plays it directly: a dial, a colour wheel, a keyboard, a board with pieces, a drawing surface.",
  read: "It is a picture of data or of a place that the person only reads: a chart, a diagram, a route, a plan.",
} as const;
export type CustomUse = keyof typeof CUSTOM_USE;

export const CUSTOM_SIZE = {
  strip: { ratio: "3:1", criteria: "A thin band across the screen: a sparkline, a timeline, a week of days, a waveform." },
  wide: { ratio: "16:9", criteria: "A landscape panel: a chart, a small map, a route preview." },
  square: { ratio: "1:1", criteria: "A square: a ring, a dial, a clock face, a board, a wheel." },
  tall: { ratio: "3:4", criteria: "Most of the height of the screen: a map to explore, a seating plan, a floor plan, a month calendar." },
} as const;
export type CustomSize = keyof typeof CUSTOM_SIZE;

export interface CustomContract {
  use: CustomUse;
  size: CustomSize;
  /** It draws the items the screen also lists (pins for the places, bars for the categories), so both read `/list/items`. */
  linked: boolean;
}

/** Material top app bar: at most a couple of actions, the most used one first. */
export const APP_BAR_ACTIONS: Record<string, { icon: string | null; criteria: string }> = {
  none: { icon: null, criteria: "The screen needs no action in its top bar." },
  search: { icon: "search", criteria: "The person will look for something specific among the content." },
  add: { icon: "add", criteria: "The person creates new items here: a new message, task, record or entry." },
  edit: { icon: "edit", criteria: "The content belongs to the person and they may want to change it." },
  share: { icon: "share", criteria: "The content is something people send to others." },
  favorite: { icon: "favorite", criteria: "The thing shown is something people save for later or mark as a favourite." },
  notifications: { icon: "notifications", criteria: "A home or overview screen where alerts are one tap away." },
  settings: { icon: "settings", criteria: "A home, profile or overview screen from which preferences are reached." },
  more: { icon: "more_vert", criteria: "There are several minor actions, none of them the main one." },
};

export interface ListAnatomy {
  layout: Layout;
  leading: Leading;
  trailing: Trailing;
  parts: ItemPart[];
}

/** Jev's reading of what is pictured, made from the description alone. `p` says how far to trust it once there are words to read instead. */
export interface PictureSubject {
  subject: SubjectName;
  p: number;
}

export interface ScreenPlan {
  archetype: string;
  blocks: Block[];
  /** A main destination of the app (Material: navigation bar on top-level destinations only) or a page reached by drilling in. */
  topLevel: boolean;
  /** The screen is about one person: it opens with who they are (avatar, name, a line about them). */
  person: boolean;
  appBarAction: string | null;
  list: ListAnatomy;
  /** Set when the screen has a custom block. */
  custom?: CustomContract;
  search: boolean;
  statDeltas: boolean;
  factsTotal: boolean;
  /** The symbol of what the screen is about. It holds the place of every picture until the picture has loaded. */
  symbol: string;
  /** What photographs on this screen are of: which shelf of the library to look on, and how to shoot one if it has to be made. */
  pictures: { hero: PictureSubject; items: PictureSubject };
  /** Set by the design, not by the prompt. */
  imagery: boolean;
  /** The design's pictures are drawn and not photographed. */
  illustrated: boolean;
  icons: boolean;
  contained: boolean;
}

/**
 * The plan of a screen that is made again to the developer's word: what was planned afresh, for the parts that are
 * new, and what the screen had, for everything that stays. `sent` came from a browser, so only what is well-formed is taken.
 */
export function keepPlan(fresh: ScreenPlan, sent: Record<string, unknown>, blocks: Block[]): ScreenPlan {
  const was = sent as Partial<ScreenPlan>;
  const stays = (block: Block) => blocks.includes(block) && Array.isArray(was.blocks) && was.blocks.includes(block);
  const list = was.list;
  const listOk = list && list.layout in LAYOUT && list.leading in LEADING && list.trailing in TRAILING && Array.isArray(list.parts) && list.parts.every((part) => part in ITEM_PARTS);
  const subject = (s: unknown): s is PictureSubject => !!s && typeof (s as PictureSubject).subject === "string" && (s as PictureSubject).subject in SUBJECT_OPTIONS;
  return {
    ...fresh,
    blocks,
    ...(typeof was.topLevel === "boolean" ? { topLevel: was.topLevel } : {}),
    ...(typeof was.person === "boolean" ? { person: was.person } : {}),
    ...(typeof was.appBarAction === "string" || was.appBarAction === null ? { appBarAction: Object.values(APP_BAR_ACTIONS).some((a) => a.icon === was.appBarAction) ? was.appBarAction : fresh.appBarAction } : {}),
    ...(stays("list") && listOk ? { list: { layout: list.layout, leading: list.leading, trailing: list.trailing, parts: [...list.parts] } } : {}),
    ...(stays("filters") && typeof was.search === "boolean" ? { search: was.search } : {}),
    ...(stays("stats") && typeof was.statDeltas === "boolean" ? { statDeltas: was.statDeltas } : {}),
    ...(stays("facts") && typeof was.factsTotal === "boolean" ? { factsTotal: was.factsTotal } : {}),
    ...(stays("custom") && was.custom && was.custom.use in CUSTOM_USE && was.custom.size in CUSTOM_SIZE ? { custom: { use: was.custom.use, size: was.custom.size, linked: Boolean(was.custom.linked) && blocks.includes("list") } } : {}),
    ...(typeof was.symbol === "string" && /^[a-z0-9_]{1,40}$/.test(was.symbol) ? { symbol: was.symbol } : {}),
    ...(subject(was.pictures?.hero) && subject(was.pictures?.items) ? { pictures: { hero: { subject: was.pictures.hero.subject, p: 1 }, items: { subject: was.pictures.items.subject, p: 1 } } } : {}),
  };
}

export function planQuestions(): Questions {
  const q: Questions = {
    archetype: choice(ask("What kind of screen is this?"), Object.fromEntries(Object.entries(ARCHETYPES).map(([k, v]) => [k, v.criteria]))),
    person: noul(ask("Is this screen about one person or account, such as a profile?"), {
      true: "A user profile, a contact, a member page, an account overview.",
      false: "It is about things, data, tasks or settings, or about many people at once.",
    }),
    top_level: noul(ask("Is this one of the app's main screens, the kind reached from its main navigation?"), {
      true: "A home, feed, dashboard, inbox, search, library or profile screen.",
      false: "A page reached by tapping into something: details, a settings page, a checkout, a form, a dialog.",
    }),
    app_bar_action: choice(ask("Which single action belongs in the screen's top bar?"), Object.fromEntries(Object.entries(APP_BAR_ACTIONS).map(([k, v]) => [k, v.criteria]))),
    list_layout: choice(ask("If the screen shows a set of items, how should they be laid out?"), LAYOUT),
    item_leading: choice(ask("If the screen shows a set of items, what kind of thing is each item?"), LEADING),
    item_trailing: choice(ask("If the screen shows a set of items, what does the person do with one item?"), TRAILING),
    search: noul(ask("If the person narrows down what is shown, would they type a search?"), {
      true: "There are too many items to scan, or the person knows the name of what they want.",
      false: "A handful of category filters is enough.",
    }),
    stat_deltas: noul(ask("If the screen shows headline numbers, do they change over time in a way the person tracks?"), {
      true: "Usage, spending, revenue, health or performance figures compared with yesterday, last week or a target.",
      false: "Fixed figures, such as counts or specifications, with nothing to compare against.",
    }),
    hero_subject: choice(ask("If a large picture leads this screen, what is it a picture of?"), SUBJECT_OPTIONS),
    item_subject: choice(ask("If each item on this screen has its own picture, what are those pictures of?"), SUBJECT_OPTIONS),
    screen_icon: choice(ask("Which symbol best stands for what this screen is about?"), ICON_OPTIONS),
    facts_total: noul(ask("If the screen shows label-and-value details, do they add up to a total on the last line?"), {
      true: "An order summary, a bill, a receipt or a cost breakdown.",
      false: "Independent details that do not sum.",
    }),
    custom_use: choice(ask("If the screen has something drawn specially for it, what does the person do with that thing?"), CUSTOM_USE),
    custom_size: choice(ask("If the screen has something drawn specially for it, how much room does that thing need?"), Object.fromEntries(Object.entries(CUSTOM_SIZE).map(([k, v]) => [k, v.criteria]))),
    custom_linked: noul(ask("If the screen has something drawn specially for it, does that thing show the very same items that the screen also lists?"), {
      true: "Pins for the places in the list, bars for the categories in the list, dots for the events in the list.",
      false: "It shows one thing of its own, or the screen has no list of items.",
    }),
  };
  for (const block of BLOCKS) {
    const { q: question, yes, no } = BLOCK_QUESTIONS[block];
    q[`has_${block}`] = noul(ask(question), { true: yes, false: no });
  }
  for (const [part, { q: question, yes, no }] of Object.entries(ITEM_PARTS)) {
    q[`item_${part}`] = noul(ask(`If the screen shows a set of items: ${question[0].toLowerCase()}${question.slice(1)}`), { true: yes, false: no });
  }
  return q;
}

/** `known.blocks` are the parts the developer has settled by asking: they are the screen's parts, whatever the odds. */
export function readPlan(answers: Record<string, any>, known: { topLevel?: boolean; among?: string[]; blocks?: string[] } = {}): { plan: ScreenPlan; screenIcon: string | null; decisions: Decision[] } {
  const decisions: Decision[] = [];
  const pick = <T extends string>(id: string, label: string): T => {
    decisions.push({ id, question: label, answer: answers[id].choice, p: answers[id].probabilities[answers[id].choice] });
    return answers[id].choice;
  };
  const yes = (id: string, label: string, threshold = 0.5) => {
    decisions.push({ id, question: label, answer: answers[id].noul >= threshold ? "yes" : "no", p: answers[id].noul });
    return answers[id].noul >= threshold;
  };

  // Constraint-aware argmax: Jev's ranking, walked to the first kind of screen this one is allowed to be.
  const ranking = Object.entries(answers.archetype.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const [archetype, p] = ranking.find(([name]) => !known.among || known.among.includes(name))!;
  decisions.push({
    id: "archetype",
    question: "kind of screen",
    answer: archetype,
    p,
    ...(archetype !== ranking[0][0] ? { note: `Jev read "${ranking[0][0]}", but the way the person got here rules it out` } : {}),
  });
  const shape = ARCHETYPES[archetype];
  let blocks = shape.order.filter((block) => {
    const p: number = answers[`has_${block}`].noul;
    if (known.blocks) {
      const asked = known.blocks.includes(block);
      decisions.push({ id: `has_${block}`, question: `${block}?`, answer: asked ? "yes" : "no", p, note: "settled by what the developer asked for" });
      return asked;
    }
    const expected = shape.expects.includes(block);
    const required = !!shape.requires?.includes(block);
    const needs = block === "custom" ? CUSTOM_THRESHOLD : expected ? EXPECTED_THRESHOLD : EXTRA_THRESHOLD;
    const keep = required || p >= needs;
    decisions.push({
      id: `has_${block}`,
      question: `${block}?`,
      answer: keep ? "yes" : "no",
      p,
      ...(required && p < EXPECTED_THRESHOLD ? { note: `a ${archetype} screen always has one` } : {}),
      ...(!keep && p >= 0.5 ? { note: `an extra on a ${archetype} screen; needs ${needs}` } : {}),
    });
    return keep;
  });
  for (const block of BLOCKS) {
    if (!shape.order.includes(block) && answers[`has_${block}`].noul >= 0.5) {
      decisions.push({ id: `has_${block}`, question: `${block}?`, answer: "no", p: answers[`has_${block}`].noul, note: `not part of a ${archetype} screen` });
    }
  }
  // Independent answers under-include as easily as they over-include. A thin screen takes its next likeliest blocks.
  const spare = shape.order.filter((b) => !blocks.includes(b) && b !== "banner" && b !== "custom").sort((x, y) => answers[`has_${y}`].noul - answers[`has_${x}`].noul);
  while (!known.blocks && blocks.length < (shape.atLeast ?? 1) && spare.length) {
    const block = spare.shift()!;
    blocks = shape.order.filter((b) => blocks.includes(b) || b === block);
    decisions.find((d) => d.id === `has_${block}`)!.answer = "yes";
    decisions.find((d) => d.id === `has_${block}`)!.note = `added: a ${archetype} screen needs at least ${shape.atLeast} parts`;
  }
  // A form's submit button is the screen's call to action; a second set of buttons only competes with it.
  if (blocks.includes("form") && !known.blocks) blocks = blocks.filter((b) => b !== "actions");
  // A checkout is where the person commits. With no form to submit, it needs a button to do it with.
  if (archetype === "checkout" && !known.blocks && !blocks.includes("form") && !blocks.includes("actions")) {
    blocks = shape.order.filter((b) => blocks.includes(b) || b === "actions");
    Object.assign(decisions.find((d) => d.id === "has_actions")!, { answer: "yes", note: "added: a checkout with no form has no other way to commit" });
  }

  const has = (b: Block) => blocks.includes(b);
  // How the person got here settles this without asking: the navigation bar leads to main screens, everything else drills in.
  const topLevel = !shape.dialog && !shape.outcome && (known.topLevel ?? yes("top_level", "a main screen of the app?"));
  if (known.topLevel !== undefined) decisions.push({ id: "top_level", question: "a main screen of the app?", answer: topLevel ? "yes" : "no", p: 1, note: "settled by how the person got here" });
  const action = shape.dialog ? "none" : pick<string>("app_bar_action", "top bar action");
  const list: ListAnatomy = { layout: "rows", leading: "none", trailing: "none", parts: [] };
  if (has("list")) {
    list.leading = pick<Leading>("item_leading", "each item is…");
    list.layout = pick<Layout>("list_layout", "list layout");
    // Picture layouts are for things with a look; anything else is scanned as rows.
    if (list.layout !== "rows" && list.leading !== "thumbnail") {
      decisions.at(-1)!.note = `items are not pictured (${list.leading}); laid out as rows`;
      list.layout = "rows";
    }
    list.trailing = pick<Trailing>("item_trailing", "with one item, the person…");
    list.parts = (Object.keys(ITEM_PARTS) as ItemPart[]).filter((part) => yes(`item_${part}`, `items have ${part}?`));
  }
  const pictured = (id: string, label: string, shown: boolean): PictureSubject => {
    const subject = shown ? pick<SubjectName>(id, label) : (answers[id].choice as SubjectName);
    return { subject, p: answers[id].probabilities[subject] };
  };
  const pictures = { hero: pictured("hero_subject", "the lead photograph is of…", has("hero")), items: pictured("item_subject", "item photographs are of…", list.leading === "thumbnail") };
  const plan: ScreenPlan = {
    archetype,
    blocks,
    topLevel,
    person: archetype === "detail" && yes("person", "about one person?"),
    appBarAction: APP_BAR_ACTIONS[action].icon,
    list,
    ...(has("custom")
      ? { custom: { use: pick<CustomUse>("custom_use", "with the custom part, the person…"), size: pick<CustomSize>("custom_size", "room it needs"), linked: has("list") && yes("custom_linked", "draws the listed items?") } }
      : {}),
    search: has("filters") && yes("search", "search field?"),
    statDeltas: has("stats") && yes("stat_deltas", "numbers tracked over time?"),
    factsTotal: has("facts") && yes("facts_total", "details sum to a total?"),
    symbol: readIcon(answers.screen_icon) ?? "image",
    pictures,
    imagery: true,
    illustrated: false,
    icons: true,
    contained: true,
  };
  // Only a dialog shows it: Material and HIG both lead an alert with a symbol of what it is about.
  const screenIcon = shape.dialog || shape.outcome ? (readIcon(answers.screen_icon) ?? null) : null;
  if (screenIcon !== null || shape.dialog) decisions.push({ id: "screen_icon", question: "symbol", answer: screenIcon ?? "none", p: answers.screen_icon.probabilities[answers.screen_icon.choice] });
  return { plan, screenIcon, decisions };
}

/** What a design's prose rules out is taken out of the plan. Returns what changed, for the trace. */
export function applyDesign(plan: ScreenPlan, look: { imagery: boolean; icons: boolean; contained: boolean; treatment?: string }): { plan: ScreenPlan; overruled: string[] } {
  const overruled: string[] = [];
  const { imagery, icons, contained } = look;
  const next: ScreenPlan = { ...plan, list: { ...plan.list }, imagery, icons, contained, illustrated: look.treatment === "illustrated" };
  if (!look.imagery) {
    if (next.blocks.includes("hero")) overruled.push("no lead photograph");
    next.blocks = next.blocks.filter((b) => b !== "hero");
    if (next.list.leading === "thumbnail") {
      overruled.push("no pictures on items");
      next.list.leading = look.icons ? "icon" : "none";
      next.list.layout = "rows";
    }
  }
  if (!look.icons && next.list.leading === "icon") {
    overruled.push("no icons on items");
    next.list.leading = "none";
  }
  if (!look.contained && next.blocks.some((b) => ["list", "stats", "groups", "facts"].includes(b))) overruled.push("no cards");
  if (!look.contained && (next.list.layout === "cards" || next.list.layout === "reel")) next.list.layout = "rows";
  return { plan: next, overruled };
}
