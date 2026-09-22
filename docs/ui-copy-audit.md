# User-facing copy audit — Google developer documentation style guide

Every string the Web UI shows, with a proposed replacement. Indexed so a change can be asked for by number.
Sections: A bar · B account menu · C chat · D visitor · E design · F library · G preview · H rail ·
I–L settings · M sign-in gate · N server messages · O trace labels · P other pages.

## Rules applied

- R1. Second person, present tense, active voice. Name the actor: you, Apparite, Jev, gev, Gemini.
- R2. Sentence case for headings, labels and buttons. Role and device names are capitalized where shown.
- R3. One verb per concept: generate / regenerate, save, share, delete, sign in. Not: make, made again, bake, forget, keep.
- R4. An error says what happened and what to do about it, as a complete sentence.
- R5. No indirect or literary phrasing ("takes a name", "afresh", "the list", "mix", "spends the models' time").
- R6. Avoid "will"; present tense. No "we". Numerals for numbers.
- R7. Ellipsis only for in-progress states.
- R8. Tooltip and aria-label match, or extend, the visible label; never expose internal keys.

## A. Top bar — src/web/app.ts:1129

| # | Now | Proposed |
|---|---|---|
| A1 | `A new app` (an apparition with no title yet) | `Untitled apparition` |
| A2 | `Anyone with the link can open it. Make it yours alone again.` | `Anyone with the link can open this apparition. Select to make it private.` |
| A3 | `Only you can open it. Let anyone with the link.` | `Only you can open this apparition. Select to share it with a link.` |
| A4 | `Anyone with the link can open it` (snackbar) | `Anyone with the link can now open this apparition.` |
| A5 | `Only you can open it now` (snackbar) | `Only you can open this apparition now.` |
| A6 | `by {owner}` / fallback `someone` | `Shared by {owner}` / `Shared by another user` |
| A7 | `Keep this app, every screen and turn of it, to open again` (Save tooltip) | `Save this apparition, with every screen and message, so that you can open it later.` |
| A8 | `Save it, and let anyone with the link open it: they need not sign in` (Share tooltip) | `Save this apparition and create a link. Anyone with the link can open it without signing in.` |
| A9 | `{left} of {daily} runs left today. A screen made is one run.` | `You have {left} of {daily} runs left today. Generating one screen uses one run.` |
| A10 | `{left} left` (meter) | `{left} runs left` |
| A11 | `Shared` / `Private` / `Not saved` / `Save` / `Saved` / `Copy link` / `Share` / `Sign in` | Unchanged. |

## B. Account menu — src/web/app.ts:1173

| # | Now | Proposed |
|---|---|---|
| B1 | `**{left} of {daily}** runs left today` | `You have **{left} of {daily}** runs left today.` |
| B2 | `A screen made is one run. Turns over at midnight UTC.` | `Generating one screen uses one run. Your runs reset at midnight UTC.` |
| B3 | `No daily limit` | `No daily run limit` |
| B4 | role chip renders raw value: `maker`, `admin` | `Maker`, `Admin` (R2) |
| B5 | `Settings` / `Library` / `Access list` / `Sign out` | Unchanged. |

## C. Chat — src/web/app.ts:898 and 1061

| # | Now | Proposed |
|---|---|---|
| C1 | `What shall we make?` | `What do you want to make?` (R6: no "we") |
| C2 | `Say what you want to see: an app, or one screen of one. It appears beside this. Then say what to change, or tap anything in it.` | `Describe an app, or a single screen. Apparite generates an apparition beside this conversation: a mock that looks like an app, so that you can explore the idea before you build it. To change the apparition, describe the change or tap an element in it.` |
| C3 | aria-label `Say what to change` / `Describe an app or a screen` | `Describe a change` / `Describe an app or a screen` |
| C4 | placeholder `Say what to change, or describe another app…` / `Describe an app, or a screen of one…` | `Describe a change, or describe another app` / `Describe an app, or one screen of an app` |
| C5 | `What you say is about the screen that is showing, unless you name another.` | `Your message applies to the screen that's showing, unless you name a different one.` |
| C6 | `about **{title}**` | `Editing **{title}**` |
| C7 | tooltip `Stop, and take it back` / aria-label `Stop` | `Stop and undo this turn` for both |
| C8 | `A screen` (card, screen with no title) | `Untitled screen` |
| C9 | `making…` / `made in 3.2 s` / `made again in 3.2 s` | `generating…` / `generated in 3.2 s` / `regenerated in 3.2 s` |
| C10 | `1 problem` / `3 problems` | `1 error` / `3 errors` |
| C11 | `The screen this made has since been made again.` | `The screen from this turn was replaced when it was regenerated.` |
| C12 | `Nothing looks different for it.` | `No visible changes.` |
| C13 | `Reading what you meant…` | `Interpreting your message…` |
| C14 | `{n} decisions · read by {endpoint} in {ms} ms` | `{n} decisions · {endpoint} responded in {ms} ms` |
| C15 | `on {title}` | `On {title}` |
| C16 | `Started afresh` (snackbar) | `Started a new apparition` |
| C17 | `Switched to Jev's mix` / `Switched to my DESIGN.md` | `Switched to the Jev design` / `Switched to your DESIGN.md` |
| C18 | `Edited the DESIGN.md` | `Edited your DESIGN.md` |
| C19 | `Made this screen again` (turn label) | `Regenerated this screen` |
| C20 | `Went back from “{title}”` / `Tapped “{label}”` | Unchanged (R3 keeps tap; see decision D2). |
| C21 | `"{name}" failed in the browser: {message}. Make the screen again to bake it again.` | `The custom component “{name}” failed in the browser: {message}. To generate the component again, regenerate the screen.` |
| C22 | `Planning the screen…` / `Remixed the design` / `Undo` / `Send` / `Show this screen` / `Undo this turn` | Unchanged. |
| C23 | suggestion chip `More playful` | `Make it more playful` (parallel with the other four chips) |
| C24 | the seven example prompts (`Settings screen for a podcast app`, …) | Unchanged: these are the user's words, not the product's. |

## D. Visitor panel — src/web/app.ts:1046

| # | Now | Proposed |
|---|---|---|
| D1 | `{n} screens, made by {owner}. Tap through it: every screen that was made is here, and above is how it was made.` | `This apparition has {n} screens, created by {owner}. Tap through the preview: every screen that was generated is included. To see how a screen was generated, select the info icon.` |
| D2 | `Making and changing things takes a name, and a place on the list.` | `To create or change apparitions, sign in with an account that's on the access list.` |
| D3 | `You are signed in as {email}, which is not on the list of people who can make things here.` | `You're signed in as {email}, which isn't on the access list. To create or change apparitions, ask an admin to add your address.` |
| D4 | `Sign in with Google` | Unchanged. |

## E. Design pane — src/web/app.ts:942

| # | Now | Proposed |
|---|---|---|
| E1 | `Mixing…` | `Generating design…` |
| E2 | `Jev's mix` / `My DESIGN.md` (the two options) | `Jev design` / `Your DESIGN.md` |
| E3 | `Draw another design from the same ratings; what you have asked for stays` | `Generate a different design from the same ratings. The changes that you asked for are kept.` |
| E4 | `Jev rates the brief on hue, vividness, warmth, roundness and whitespace, and the ratings become a DESIGN.md. Say in the chat what you would change, or remix it.` | `Jev rates your description for hue, vividness, warmth, roundness, and whitespace, and then turns the ratings into a DESIGN.md file. To change the design, describe the change in the chat, or select Remix.` |
| E5 | `Paste your project's DESIGN.md below: tokens paint the mock, and Jev reads the prose for what tokens cannot say.` | `Paste your project's DESIGN.md. Apparite applies the tokens to the preview, and Jev reads the prose for anything the tokens don't specify.` |
| E6 | `yours, and kept by a remix` | `Your changes. Remixing keeps them.` |
| E7 | placeholder `Paste your project's DESIGN.md here.` | `Paste your project's DESIGN.md` (no terminal period in a placeholder) |
| E8 | `Remix` / `Design` / aria-label `Design system` / aria-label `DESIGN.md` | Unchanged. |
| E9 | (new, 2026-09-22) the idiom control: aria-label `Idiom`; options `Kit`, `iOS`, `Email` (the last a grammar with no screens, there to prove any grammar runs); hint `Screens use the tool's own components, laid out and painted by the design.` / `Screens are laid out and painted the way iOS does it, in the design's palette.`; the message in the conversation `Switched to the iOS idiom`; the snackbar `Screens generated before this keep their layout until you regenerate them.` | Written to the guide from the start: one verb (generate/regenerate), present tense, "the tool" for the kit's idiom, no internal names (`kit` is the id; `Kit` is what it is called, as `Auto` is). |

## F. Library — src/web/app.ts:990

| # | Now | Proposed |
|---|---|---|
| F1 | `{n} apps · every screen and turn of each` | `{n} apparitions, with every screen and message` |
| F2 | `New app` / `describe it, or start from an example` (the tile) | `New apparition` / `Describe an app, or start from an example.` (you still describe an app; what you get is an apparition) |
| F3 | aria-label `More` | `More options for {name}` |
| F4 | `Delete “{name}”? Its link will stop working.` | `Delete “{name}”? Anyone who has its link can no longer open it.` (R6: no "will") |
| F5 | `Keep` / `Delete` (confirm) | `Cancel` / `Delete` |
| F6 | `Only you can open it now` (snackbar) | `Only you can open this apparition now.` |
| F7 | `Anyone with the link can open it. Link copied` | `Link copied. Anyone with the link can open this apparition.` |
| F8 | `Deleted “the app”` (fallback when untitled) | `Deleted “Untitled apparition”` |
| F9 | `Nothing saved yet. Save keeps an app, every screen and turn of it; Share also lets anyone with the link open it.` | `You haven't saved any apparitions yet. Save keeps an apparition with all of its screens and messages. Share also creates a link that anyone can open.` |
| F10 | `Library` / `Open` / `Copy link` / `Make private` / `Share by link` / `Delete` / `Link copied` / `Saved “{name}”` / `Shared · 3 screens · today` | Unchanged. |

## G. Preview (stage) — src/web/app.ts:1197

| # | Now | Proposed |
|---|---|---|
| G1 | device buttons: aria-label and tooltip are the raw ids `phone`, `tablet`, `desktop` | `Phone`, `Tablet`, `Desktop` |
| G2 | aria-label `Screens made so far` | `Screens` |
| G3 | screen-flow button tooltip is the internal key, e.g. `3:item:Il Corvo Pasta` | the screen title (R8) |
| G4 | `Make this screen again` (tooltip and aria-label) | `Regenerate this screen` |
| G5 | `How this screen was made` (tooltip, aria-label, popover heading) | `How this screen was generated` |
| G6 | stats: `First UI` / `Done` / `Gemini tokens` / `Tree` / `making…` / `valid` / `invalid` | `First component` / `Total time` / `Gemini output tokens` / `A2UI tree` / `generating…` / `Valid` / `Invalid` |
| G7 | `Nobody has made the screen that “{label}” leads to, and making one takes a name.` | `No one has generated the screen that “{label}” leads to. To generate it, sign in.` |
| G8 | `This design lays the screen out differently.` + `Make it again` | `The current design uses a different layout for this screen.` + `Regenerate` |
| G9 | `What you ask for appears here. Then tap anything.` | `Your preview appears here. Tap any element to explore it.` |
| G10 | `Planning the screen…` / `Export` / `Copy A2UI messages` / `Copy theme CSS` / `Copy DESIGN.md` / the three "… copied" snackbars / `Dismiss` | Unchanged. |

## H. Rail — src/web/app.ts:1117

| # | Now | Proposed |
|---|---|---|
| H1 | aria-label `The tool` | `Main navigation` |
| H2 | `New app` (the **+** button) | `New apparition` |
| H3 | `Chat` / `Preview` / `Design` / `Library` / `Settings` | Unchanged. |

## I. Settings → Account — src/web/settings.ts:120

| # | Now | Proposed |
|---|---|---|
| I1 | `You are signed in with Google. The tool keeps your name beside what you save, and counts the screens you have made today.` | `You're signed in with Google. Apparite stores your name with the apparitions that you save, and counts the screens that you generate each day.` |
| I2 | `**{left} of {daily}** runs left today` | `You have **{left} of {daily}** runs left today.` |
| I3 | `A screen made is one run; changing how an app looks costs none. The day turns over at midnight UTC.` | `Generating one screen uses one run. Changing an apparition's design uses no runs. Your runs reset at midnight UTC.` |
| I4 | role chip renders raw value | `Maker` / `Admin` / `None` |
| I5 | `Account` / `No daily limit` / `Sign out` | `No daily limit` → `No daily run limit`; rest unchanged. |

## J. Settings → Appearance — src/web/settings.ts:144

| # | Now | Proposed |
|---|---|---|
| J1 | `How the tool itself looks. What you make is painted by its own DESIGN.md, whatever you choose here.` | `How Apparite looks. This setting doesn't affect the apparitions that you make, which use their own DESIGN.md.` |
| J2 | `System follows your computer.` | `System uses your computer's setting.` |
| J3 | `First device` / `What a new session shows its mocks on.` | `Default device` / `The device that new previews are shown on.` |
| J4 | `Appearance` / `Theme` / `System` / `Light` / `Dark` / `Phone` / `Tablet` / `Desktop` | Unchanged. |

## K. Settings → Models — src/web/settings.ts:195 (rewritten already; near-conformant)

| # | Now | Proposed |
|---|---|---|
| K1 | heading `Models`, but the setting selects a service | `Model service` |
| K2 | `Its yes-or-no answers are more confident than jev's.` | `Its yes-or-no answers are more confident than the answers from jev.` (avoid the possessive on a service name) |
| K3 | `screens that you've already made` | `screens that you've already generated` (R3) |
| K4 | the rest of the pane | Unchanged. |

## L. Settings → Access — src/web/settings.ts:216, 36

| # | Now | Proposed |
|---|---|---|
| L1 | `Who may make things here, and how many screens a day. A pattern is an address, with * for anything. Of the lines an address fits, the one that says the most wins: a person's own line over their company's.` | `Control who can create apparitions, and how many screens they can generate each day. A pattern is an email address, where * matches any text. If an address matches more than one pattern, the most specific pattern applies: a personal address takes precedence over a domain.` |
| L2 | `The list` / `an edit is noticed within a minute` | `Access list` / `Changes take effect within a minute.` |
| L3 | table headers `Who` / `Runs a day` | `Email pattern` / `Runs per day` |
| L4 | role tooltip `makes things, so many a day` | `Can create apparitions, up to a daily run limit.` |
| L5 | role tooltip `makes things, and edits this list` | `Can create apparitions and edit the access list.` |
| L6 | role tooltip `is kept out, whatever a wider line says` | `Can't create apparitions, even if a broader pattern allows it.` |
| L7 | `Keep` / `Remove` (confirm) | `Cancel` / `Remove` |
| L8 | placeholder `runs (25)` | `Runs (25)` |
| L9 | aria-label `Runs a day: empty for the usual, or “unlimited”` | `Runs per day. Leave empty for the default, or enter unlimited.` |
| L10 | placeholder `note` | `Note` |
| L11 | role select renders raw values `maker` / `admin` / `none` | `Maker` / `Admin` / `None` |
| L12 | `Who has made things` | `People with activity` |
| L13 | `no limit` | `No limit` |
| L14 | `Nobody has made anything yet.` | `No one has generated a screen yet.` |
| L15 | `Reading the list…` | `Loading the access list…` |
| L16 | tag `admin` beside the Access section | `Admin` |
| L17 | `Access` / `Add` / `Remove this line` / `Today` / `Last seen` / `just now` / `12 minutes ago` | Unchanged. |

## M. Sign-in gate — src/web/session.ts:113, index.html

| # | Now | Proposed |
|---|---|---|
| M1 | `Say what you want.` / `Get an app.` / `Keep talking.` | `Describe what you want.` / `Get an apparition.` / `Keep changing it.` — see decisions D1 (a brand line, not UI copy) and D5 (what the tool promises). `Say` and `Keep talking` both named a medium the tool doesn't have: you type. `Keep changing it.` names none, and `it` chains the three lines to the apparition. |
| M2 | `Describe a screen and tap through the mock it becomes. Every message after that changes it.` | `An apparition is a mock that looks like an app. Describe a screen, tap through the apparition that Apparite generates, and change it with every message. Explore an idea before you build it.` — the one place the word is defined for someone who has never seen the tool. |
| M3 | `{email} is not on the list of people who can make things here. Whoever sent you can have it added.` | `{email} isn't on the access list. To get access, ask the person who shared Apparite with you to add your address.` |
| M4 | `One moment…` | `Loading…` |
| M5 | `Making things spends the models' time, which is shared out by name: so many runs a day to each person on the list. Opening an app someone shared with you takes no sign-in.` | `Generating screens uses model capacity, so everyone on the access list has a daily run limit. You don't need to sign in to open an apparition that someone shared with you.` |
| M6 | `<meta name="description">`: `Say what you want, get an app, keep talking.` | `Describe what you want, get an apparition, keep changing it. An apparition is a mock that looks like an app, for exploring an idea before you build it.` (M1, plus the definition, since a search result has no page around it) |
| M7 | `Sign in with Google` / `Use another account` | Unchanged. |

## N. Server messages the UI shows verbatim — src/server/http.ts, auth.ts, apps.ts, models.ts

These reach the person as a snackbar, a failed turn, or a red note.

| # | Now | Proposed |
|---|---|---|
| N1 | `Today's {n} runs are used up. There are more tomorrow (the day turns over at midnight UTC).` | `You've used all {n} of today's runs. Your runs reset at midnight UTC.` |
| N2 | `sign in first` | `Sign in to continue.` |
| N3 | `{email} is not on the list of people who can make things here` | `{email} isn't on the access list.` |
| N4 | `the list is an admin's to edit` | `Only admins can edit the access list.` |
| N5 | `that line is what makes you an admin; another admin can change it` | `You can't change the pattern that grants you admin access. Ask another admin to change it.` |
| N6 | `there is no list: nobody has to sign in here` | `This server has no access list, because it doesn't require sign-in.` |
| N7 | `nothing is saved here: nobody has to sign in, so nothing would be anybody's` | `This server doesn't save apparitions, because it doesn't require sign-in.` |
| N8 | `there is no such app, or it is not shared` | `That apparition doesn't exist, or it isn't shared.` |
| N9 | `saving is for the people who can make things here` | `To save an apparition, your address must be on the access list.` |
| N10 | `this cannot be saved: {why}` | `Can't save this apparition: {why}` |
| N11 | `there is no such app of yours` | `You don't have an apparition with that ID.` |
| N12 | `visibility is private or link` | `Visibility must be private or link.` |
| N13 | `not something an app can be asked` | `This endpoint doesn't support that request method.` |
| N14 | `GET, PUT or DELETE` | `This endpoint supports only GET, PUT, and DELETE requests.` |
| N15 | `expected a prompt, and mode=mock\|jobs\|hybrid\|baseline` | `The request must include a prompt and a mode of mock, jobs, hybrid, or baseline.` |
| N16 | `expected {message, app, design, showing}` | `The request must include message, app, design, and showing.` |
| N17 | `expected {markdown} or {brief}` | `The request must include either markdown or brief.` |
| N18 | `too much was sent` | `The request body is too large.` |
| N19 | `a pattern is an address, with * for anything: *@example.com` | `A pattern must be an email address, where * matches any text. For example, *@example.com.` |
| N20 | `a role is maker, admin or none` | `Role must be maker, admin, or none.` |
| N21 | `runs is a whole number, or null for no limit` | `Runs must be a whole number, or null for no limit.` |
| N22 | `its screens do not add up` | `The apparition's screens don't match its screen list.` |
| N23 | `the component on "{title}" is not what it says it is` | `The custom component on “{title}” doesn't match its definition.` |
| N24 | `its DESIGN.md is too long to save` / `one of its screens is too large to save` | `The apparition's DESIGN.md is too large to save.` / `One of the apparition's screens is too large to save.` |
| N25 | `{service} did not answer: {detail}` | `{service} didn't respond: {detail}` |

Out of scope, console only: `nothing is built: run npm run build first` (main.ts), `{name} is not set (expected in .env)` (models.ts).

## O. Trace labels in the decision log — src/server/*

Shown under "N decisions" and in "How this screen was generated". One decision covers the set;
they are consistent with each other today, and inconsistent with everything above.

| # | Now | Proposed |
|---|---|---|
| O1 | `Jev: plan the screen`, `Jev: profile the job`, `Jev: pick the primary action`, `Jev: plan the surface`, `Jev: design field "{label}"`, `Jev: look on the shelf`, `Jev: what "{thing}" is` | Keep the `Actor: action` shape, imperative and sentence case; rename `look on the shelf` → `reuse a custom component`. |
| O2 | `Gemini: write {part}`, `Gemini: write A2UI directly`, `Gemini: bake "{name}"`, `Gemini: illustrate "{thing}"` | `Gemini: bake` → `Gemini: generate component "{name}"` (R3). Rest unchanged. |
| O3 | `Cancelled 2 speculative writers`, `Kept as it was: header, list`, `Link: {screen}`, `Code: "{pattern}" pattern`, `{design} overrules the plan: {parts}` | `Canceled 2 speculative writers` (US spelling), `Unchanged: header, list`, rest unchanged. |
| O4 | `"{name}" could not be filled from its schema; baking a new one` | `“{name}” doesn't match its schema. Generating a new component.` |
| O5 | validation notes, e.g. `message[2] updateComponents.0.id: Required`, `root: unknown component "Carousel"` | Unchanged: developer diagnostics, already terse and precise. |

## P. Other pages

| # | Now | Proposed |
|---|---|---|
| P1 | access.html: `The access list has moved into Settings.` | `The access list is now in Settings.` |
| P2 | compare.html / compare.ts: `Apparite: pipelines compared`, `Jev decides · Gemini writes · code assembles A2UI`, `Describe a UI…`, `Generate`, `Trace`, `Waiting for the first components…`, `Nothing rendered yet.`, `Jobs: Jev profiles the person`, `Sections: Jev picks the parts`, `Baseline: Gemini writes A2UI` | Developer-only comparison page. Out of scope unless you want it in. |

## Decisions that change many entries at once

- D1. Voice. The tool's own voice is deliberate and literary; the Google style guide is plain and
  instructional. The audit applies the style guide everywhere. The alternative is to exempt the two
  brand lines (M1, M6) and keep the plain voice everywhere else.
- D2. Interaction verb. The preview is a phone drawn on a desktop screen, driven with a mouse. The
  style guide says "click" for desktop, "tap" for touch, "select" when both. Today it's "tap"
  throughout. Options: keep "tap" (it's a phone), or use "select" everywhere.
- D3. Terminology. Three internal metaphors surface in the UI: **mock** (proposed: preview),
  **mix** (proposed: design), **bake / shelf** (proposed: custom component). A fourth, **turn**,
  appears in Save and Library copy (proposed: message). **Run** stays, defined once in Account.
- D4. **Settled: the product is named.** The product is Apparite, and the copy says so wherever it
  used to say "the tool" or "this tool", which is what the style guide prefers. The name is written
  `Apparite`, capitalized, in every sentence and in the wordmark. `jev2ui` remains the name of the
  repository, the npm package, the custom elements and the Cloud Run service; a person never sees it.
- D5. **Settled: what Apparite makes is an apparition, not an app.** The copy promises a mock that
  looks like an app — something to explore an idea in before building it — and never a working app,
  which the tool does not make. A person still *describes* an app, or one screen of one, because that
  is the idea they have in mind (C2, C4, F2); what Apparite generates, saves, shares, lists and
  deletes is an **apparition**, and every sentence a person reads says so: the gate (M1, M2, M5, M6),
  the bar (A1–A8), the library (F1–F9), the rail (H2), the visitor panel (D1–D3), the settings
  (I1, I3, J1, L1, L4–L6) and the server's messages (N7–N11, N22, N24). **Preview** stays the name of
  the pane an apparition is seen in (D3) and **screen** the name of one of its screens, so neither
  word competes with it. `app` remains the name in the code, the API paths (`/api/apps`, `?app=<id>`)
  and Firestore, as D4 settles for `jev2ui`: a person never sees it.
