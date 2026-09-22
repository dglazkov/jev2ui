# email

> `email` describes one email that a product sends to one of the people who use it. Work out what that email is made of.

A graph nobody wrote code for: the emails a product sends. It is here to find out whether the format only fits the screens it was taken from. Written by hand; its examples were labelled before it was first run (docs/grammar.md). Its parts are drawn by the kit's patterns ([kit](../kit.md)). Nothing in the kit draws a one-time code, so that part is a slot, and what fills it is baked.

## header

Written for every email, whatever it is made of.

- `title` — The subject line, as it shows in an inbox.
- `subtitle` — The preheader: the one line an inbox shows after the subject.

## kind

The order of the parts belongs to the kind of email. What matters most comes first, because most of an email is never scrolled to.

> What kind of email is this?

- **receipt** — Proof of something bought, booked or billed: an order confirmation, an invoice, a booking confirmation, a renewal notice.
  `prose? items FACTS cta?`
- **alert** — Something happened to the person's account that they must know about now: a new sign-in, a password change, a failed payment, a breach.
  `WARNING prose? facts cta`
- **verify** — The person has to prove who they are or confirm an address: a one-time code, a magic link, a confirm-your-email message.
  `prose? code cta`
- **newsletter** — A regular round-up of several things to read or look at: a weekly digest, product updates, new arrivals, recommended articles.
  `hero prose? ITEMS cta?`
- **announcement** — One piece of news from the product: a launch, a sale, a new feature, an invitation to an event.
  `hero PROSE facts? cta` at least 2
- **welcome** — The first email after signing up: a greeting and how to get started.
  `hero? PROSE steps cta` at least 2
- **reminder** — Something is coming up or was left undone: an appointment tomorrow, a trial about to end, a cart left behind, a task that is due.
  `warning? prose items? facts CTA` at least 2

### warning (never padding) → banner

> Does the email carry a notice the person must not miss, set apart from the rest?

+ A security notice, a deadline, a failed payment, an expiry: ignoring it costs the person something.
- Nothing is at stake; the email informs, confirms or invites.

- `title` as title — What happened or what is due, in a few words.
- `text` as text — One sentence on what it means for the person.
- `tone` as tone, decided by warning_tone

#### warning_tone (once written)

> For the person reading the email, what kind of news is `warning`?

- **danger** — Something has gone wrong or is at risk now: a sign-in nobody recognises, a failed payment, a breach.
- **warning** — Something will go wrong if nothing is done: a trial about to end, a card about to expire, a deadline.
- **neutral** `accent` — A notice that is neither: a change of terms, something coming up that needs no worry.

### hero (never padding) → picture

> Should a large picture lead this email?

+ It is about something with a look, or it sets a mood: products, a place, an event, a feature shown off, a seasonal sale.
- It is about an account, a payment, a code, an appointment or a record, and a picture would only be in the way.

- `imageUrl` as picture, from library by pictures_of else painted else placeholder

### prose → prose

> Does the email need a paragraph or more of running text?

+ An explanation, a story, a greeting with some warmth, the consequences of something, a message from a person.
- A line or two is enough; the rest is details, items or a button.

- `body` as body — What the email says, in short paragraphs. Simple markdown is allowed.

### code → slot with ratio 3:1

> Does the email exist to hand the person a code or a number they will copy or type somewhere else?

+ A one-time passcode, a verification code, a voucher code, a booking reference to quote.
- There is nothing to copy; the person reads, or presses a button.

→ The code is the whole point of the email and the person will type it somewhere else: set it very large, in spaced groups, with a line above it saying what it is for and a line below saying how long it lasts. They only read it; a button to copy it is welcome.

filled from shelf else baked else closed

### items → collection

> Does the email show several similar things?

+ Products ordered, articles to read, line items, recommendations, sessions booked, things left in a cart.
- It is about one thing, or about the account.

- `heading` as heading — A heading above them, in a few words.
- `items` 2–6, as items — The things.
  - `title` as headline — Its name.
  - `subtitle` as supporting — One short line about it.
  - `price` as meta, when item_price is yes — Its price or amount, with currency.
  - `imageUrl` as picture, from library by pictures_of else painted else placeholder, when item_picture is yes

#### item_picture → leading

> If the email shows several similar things, would each one have its own picture?

+ `thumbnail` Products, articles with a lead image, places, films, recipes.
- `none` Line items on an invoice, transactions, tasks, sign-ins.

#### item_price

> If the email shows several similar things, does each one have a price or an amount?

+ Things bought, booked or billed.
- Things read, watched or done.

### facts → details

> Is there a set of label-and-value details to show?

+ A total, a date and time, an address, an order number, a device and a place, a plan and what it costs.
- There are no discrete details; it is all said in sentences.

- `facts` 2–6, as rows — Label-and-value details.
  - when facts_total is yes — The last one is the total.
  - `label` as label — Short label.
  - `value` as value — Short value.
  - `strong` as strong, computed

#### facts_total

> If the email shows label-and-value details, do they add up to a total on the last line?

+ An order summary, an invoice, a bill, a refund.
- Independent details that do not sum.

### steps → steps

> Does the email tell the person what to do, in order?

+ Getting started in three steps, how to return an item, what to bring and when to arrive.
- There is at most one thing to do, and a button does it.

- `steps` 2–5, as steps — What to do, in order.
  - `title` as title — The step, as an instruction.
  - `detail` as detail — One sentence more.

### cta → actions

> Does the email ask the person to press one main button?

+ Confirm, track the order, reset the password, read more, book, finish checking out, update the card.
- The email is a record to keep; nothing needs doing.

- `cta` 1–1, as actions — The one button.
  - `label` as label — What the button says, in two or three words.
  - `variant` as variant, decided by main

#### main (among each button in cta)

> Which button is the main thing the email asks of the person?

+ `primary` It is the one.
- `secondary` It is one of the others.

## pictures_of

> If the email shows pictures, what are they pictures of?

among [subjects](../subjects.md)

## tone

> How should this email sound?

- **plain** — A record or a fact, said once and without colour: receipts, codes, confirmations.
- **warm** — A person glad to be writing: welcomes, thanks, invitations, a note from a small business.
- **urgent** — Something needs doing soon and the email must not be mistaken for marketing: security, failed payments, deadlines.
- **lively** — Selling or showing off: a sale, a launch, a round-up meant to be enjoyed.

## length → word budget

> How much should this email say?

1. `25` A glance: a code, a one-line confirmation.
2. `60` A few lines around the details or the button.
3. `120` A short message with a paragraph of its own.
4. `250` Several sections, each with a little text.
5. `500` Something to sit down and read.

## Rules

- when code, no hero — an email opened to copy a code is read in two seconds
- when warning, no hero — a warning leads; a picture above it buries it
- when code, no items — a code is the whole of what the email is for
- when no items, facts_total is no — a total needs lines to be the total of

## Examples

- Order confirmation for two pairs of sneakers, with the totals → kind is receipt, items, facts, facts_total is yes, no hero
- Invoice for March from a web hosting company → kind is receipt, facts, no hero, tone is plain
- Your one-time sign-in code → kind is verify, code, no hero, no items
- Confirm your email address to finish signing up → kind is verify, cta, no warning
- We noticed a new sign-in to your account from Berlin → kind is alert, warning, no hero, tone is urgent
- Your payment failed; update your card to keep your subscription → kind is alert, warning, cta, tone is urgent
- Weekly digest of the five most-read design articles → kind is newsletter, items, item_picture is yes, item_price is no
- Welcome to the pottery studio, and how to book your first class → kind is welcome, prose, tone is warm
- Your dentist appointment is tomorrow at 9:40 → kind is reminder, facts, cta, no items
- You left a tent in your cart → kind is reminder, items, cta
- Dark mode is here: we are launching it today → kind is announcement, prose, no code
- Spring sale, 30% off everything this weekend → kind is announcement, hero, cta, tone is lively
