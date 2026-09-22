// The innermost level of the tree: decisions about one row, one badge, one
// number, made once its words exist. They are the kind of question Jev is best
// at, because they are about the content and not about design: is "Degraded" bad
// news? Is "Auto-download" something you switch on, or a page you open?
//
// Each answer is written into the data model next to the words it is about
// (`/groups/1/rows/2/control`), and the tree binds to it. So a template stays a
// template, however much its instances differ.

import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import { ranked } from "../models.js";
import { iconQuestion, readIcon } from "./icons.js";
import { fieldQuestions, readField } from "../design.js";
import type { FieldContent, Widget } from "../emit.js";
import type { Run } from "../run.js";
import type { Decision } from "../../shared/events.js";

/** Values to merge into a part of the data model, at a path inside that part. */
export interface Decoration {
  at: Array<string | number>;
  values: Record<string, unknown>;
}

/** Material: a switch for one on/off setting that takes effect at once. HIG: a disclosure indicator for a row that opens another page. */
export const CONTROLS = {
  switch: "A setting that is simply on or off and takes effect at once: notifications, dark mode, autoplay, sync.",
  value: "A setting with one current value picked from several, changed on another page: language, quality, theme, frequency, units.",
  nav: "A link to another page: a content item, details, account, privacy, help, about, or managing something. Its text and section identify what it opens.",
  check: "One of several alternative options listed together, of which one is chosen: the choices of a single setting, such as '10 seconds', '30 seconds', 'High', 'Low'.",
  danger: "A final or destructive account action: sign out, delete account, clear data, reset.",
};

export const TONES = {
  success: "Good news or a healthy state: done, available, on time, paid, active, in stock.",
  warning: "Needs attention soon: low, delayed, pending, degraded, expiring, almost full.",
  danger: "Bad news: failed, overdue, critical, cancelled, offline, out of stock.",
  accent: "A highlight and not a state: new, featured, popular, recommended.",
  neutral: "Plain information that is neither good nor bad.",
};

async function ask(run: Run, stage: string, state: unknown, questions: Questions, read: (answers: Record<string, any>) => Decision[]) {
  const asked = await run.askJev(stage, state, questions);
  run.trace({ stage: asked.stage, ms: asked.ms, decisions: read(asked.answers), tokens: { input: asked.inputTokens, output: 0 } });
}

/** One request per group: for every row, its control, its symbol, and whether it starts switched on. */
export async function refineGroup(run: Run, screen: string, g: number, group: any, icons: boolean, chosen?: string): Promise<Decoration[]> {
  const rows: any[] = Array.isArray(group?.rows) ? group.rows : [];
  if (!rows.length) return [];
  const questions: Questions = {};
  rows.forEach((row, r) => {
    const context = `\`row_${r}\` is a row in the supplied screen and section. Grouped rows can represent content, navigation, settings or actions; use their actual text and context to decide.`;
    questions[`control_${r}`] = choice({ context, question: `What kind of row is row_${r}?` }, CONTROLS);
    questions[`on_${r}`] = noul({ context, question: `If row_${r} is an on/off setting, would a typical person have it switched on?` });
    if (icons) questions[`icon_${r}`] = iconQuestion(`row_${r}`);
  });
  const out: Decoration[] = [];
  // Rows in one group either all lead with a symbol or none do; a ragged left edge reads as a mistake.
  let symbols = icons;
  const state = { screen, group: group.title, ...Object.fromEntries(rows.map((row, r) => [`row_${r}`, row])) };
  await ask(run, `Jev: rows of "${group.title}"`, state, questions, (a) => {
    // Options to pick among are told apart by their words, and a group with any of them has no symbols: decided before
    // any row is read, so that it does not depend on which row the option is.
    symbols &&= rows.every((_, r) => readIcon(a[`icon_${r}`])) && !rows.some((_, r) => a[`control_${r}`].choice === "check");
    // Exactly one option of a picker is chosen: the value the person saw on the row they tapped, else the likeliest.
    const options = rows.map((_, r) => r).filter((r) => a[`control_${r}`].choice === "check");
    const same = (x: unknown, y: unknown) => String(x).trim().toLowerCase() === String(y).trim().toLowerCase();
    const picked = options.find((r) => chosen && same(rows[r].label, chosen)) ?? options.sort((x, y) => a[`on_${y}`].noul - a[`on_${x}`].noul)[0];
    return rows.map((row, r) => {
      let control = a[`control_${r}`].choice as string;
      let note: string | undefined;
      // A row can only show a value if one was written, and one that has a value is not a switch.
      if (control === "value" && !row.value) [control, note] = ["nav", "read as a value, but none was written"];
      if (control === "switch" && row.value) [control, note] = ["value", `read as a switch, but it has the value "${row.value}"`];
      const icon = symbols ? readIcon(a[`icon_${r}`]) : undefined;
      out.push({ at: [g, "rows", r], values: { control, on: control === "check" ? r === picked : a[`on_${r}`].noul >= 0.5, ...(icon ? { icon } : {}), ...(control === "check" ? { value: undefined } : {}) } });
      return { id: `control_${r}`, question: row.label, answer: `${control}${icon ? ` · ${icon}` : ""}`, p: a[`control_${r}`].probabilities[a[`control_${r}`].choice], ...(note ? { note } : {}) };
    });
  });
  return out;
}

/** One request for a finished list: the tone of every status, and a symbol for every item that is led by one. */
export async function refineItems(run: Run, screen: string, items: any[], want: { tones: boolean; icons: boolean }): Promise<Decoration[]> {
  if (!items.length || (!want.tones && !want.icons)) return [];
  const questions: Questions = {};
  items.forEach((item, i) => {
    if (want.tones) questions[`tone_${i}`] = choice(`For the person looking at the screen, what is the state of item_${i}?`, TONES);
    if (want.icons) questions[`icon_${i}`] = iconQuestion(`item_${i}`);
  });
  const out: Decoration[] = [];
  await ask(run, "Jev: read the items", { screen, ...Object.fromEntries(items.map((item, i) => [`item_${i}`, item])) }, questions, (a) =>
    items.map((item, i) => {
      const tone = want.tones ? (a[`tone_${i}`].choice as string) : undefined;
      const icon = want.icons ? (readIcon(a[`icon_${i}`]) ?? "circle") : undefined;
      out.push({ at: ["items", i], values: { ...(tone ? { tone } : {}), ...(icon ? { icon } : {}) } });
      const p = want.tones ? a[`tone_${i}`].probabilities[tone!] : ranked(a[`icon_${i}`])[0][1];
      return { id: `item_${i}`, question: item.title, answer: [tone, icon].filter(Boolean).join(" · "), p };
    }),
  );
  return out;
}

/** "+12%" is good news for revenue and bad news for an electricity bill. */
export async function refineStats(run: Run, screen: string, stats: any[]): Promise<Decoration[]> {
  const moving = stats.map((stat, i) => ({ stat, i })).filter(({ stat }) => stat?.delta);
  if (!moving.length) return [];
  const questions: Questions = {};
  for (const { i } of moving) {
    questions[`news_${i}`] = choice(`For the person looking at the screen, is the change in stat_${i} good or bad news?`, {
      good: "The figure moved the way the person wants it to.",
      bad: "The figure moved the way the person does not want.",
      neutral: "Neither; it is just a change.",
    });
  }
  const out: Decoration[] = [];
  await ask(run, "Jev: read the numbers", { screen, ...Object.fromEntries(moving.map(({ stat, i }) => [`stat_${i}`, stat])) }, questions, (a) =>
    moving.map(({ stat, i }) => {
      const news = a[`news_${i}`].choice as string;
      out.push({ at: [i], values: { tone: news } });
      return { id: `news_${i}`, question: `${stat.label} ${stat.delta}`, answer: news, p: a[`news_${i}`].probabilities[news] };
    }),
  );
  return out;
}

export async function refineBanner(run: Run, screen: string, banner: any): Promise<Decoration[]> {
  const out: Decoration[] = [];
  await ask(run, "Jev: read the banner", { screen, banner }, { tone: choice("For the person looking at the screen, what kind of news is `banner`?", TONES) }, (a) => {
    out.push({ at: [], values: { tone: a.tone.choice === "neutral" ? "accent" : a.tone.choice } });
    return [{ id: "tone", question: banner.title, answer: a.tone.choice, p: a.tone.probabilities[a.tone.choice] }];
  });
  return out;
}

export async function refineNav(run: Run, screen: string, items: any[]): Promise<Decoration[]> {
  const questions: Questions = Object.fromEntries(items.map((_, i) => [`icon_${i}`, iconQuestion(`destination_${i} of the app's main navigation`)]));
  const out: Decoration[] = [];
  await ask(run, "Jev: symbols for the navigation", { screen, ...Object.fromEntries(items.map((item, i) => [`destination_${i}`, item.label])) }, questions, (a) =>
    items.map((item, i) => {
      const icon = readIcon(a[`icon_${i}`]) ?? "circle";
      out.push({ at: ["items", i], values: { icon } });
      return { id: `icon_${i}`, question: item.label, answer: icon, p: ranked(a[`icon_${i}`])[0][1] };
    }),
  );
  return out;
}

/** One primary action per screen (Material, HIG, Polaris all agree); and if it destroys something, it says so in red. */
export async function refineActions(run: Run, screen: string, actions: Array<{ label: string }>): Promise<Decoration[]> {
  const questions: Questions = {
    destructive: noul("Does the main action of this screen delete, cancel or otherwise destroy something that cannot be recovered?"),
  };
  if (actions.length > 1) questions.primary = choice("Which button is the main thing the person came to this screen to do?", Object.fromEntries(actions.map((a, i) => [`action_${i}`, a.label])));
  const out: Decoration[] = [];
  await ask(run, "Jev: pick the primary action", { screen, ...Object.fromEntries(actions.map((a, i) => [`action_${i}`, a.label])) }, questions, (a) => {
    const primary = actions.length > 1 ? Number((a.primary.choice as string).split("_")[1]) : 0;
    const destructive = a.destructive.noul >= 0.6;
    actions.forEach((_, i) => out.push({ at: [i], values: { variant: i === primary ? (destructive ? "danger" : "primary") : "secondary" } }));
    return [
      { id: "primary", question: "primary button", answer: actions[primary].label, p: actions.length > 1 ? a.primary.probabilities[a.primary.choice] : 1 },
      { id: "destructive", question: "destructive?", answer: destructive ? "yes" : "no", p: a.destructive.noul },
    ];
  });
  return out;
}

const KINDS: Record<Widget, string> = {
  shortText: "text",
  longText: "long",
  number: "number",
  obscured: "password",
  date: "date",
  time: "time",
  dateTime: "dateTime",
  checkbox: "checkbox",
  singleChoice: "select",
  multiChoice: "multi",
  slider: "slider",
};

/** The same field questions as the A2UI pipelines, mapped onto the kit's field kinds. */
export async function refineField(run: Run, screen: string, i: number, field: FieldContent): Promise<Decoration[]> {
  const out: Decoration[] = [];
  await ask(run, `Jev: design field "${field.label}"`, { user_request: screen, form_field: field }, fieldQuestions(), (a) => {
    const read = readField(a, field);
    // Material: chips or radio buttons while every option fits in view; a menu beyond that.
    const kind = read.design.widget === "singleChoice" && (field.options?.length ?? 0) <= 4 ? "chips" : KINDS[read.design.widget];
    out.push({ at: ["fields", i], values: { kind } });
    return read.decisions.filter((d) => d.id === "widget" || d.id === "control");
  });
  return out;
}
