# Can Jev see the job a screen is hired to do?

Probe run 2026-09-18 with `jev-1.13.0`. Reproduce with `npm run probe:jtbd` (add `-- -v` for full profiles).

## Setup

The current pipeline asks Jev about the solution ("should the screen have a list?"). This probe asks only
about the person: 18 questions per prompt, in one request, about where they are in getting what they want,
what is true when it goes well, what they will mostly be doing, how many items they need to see, stakes,
attention, urgency, habit, five anxieties and five selection criteria. Choice options are written as
first-person job statements.

Prompts are 20 minimal pairs: same topic, different job ("Delete my account and all of its data" against
"What happens to my data if I delete my account?"). Hand labels for stage, done and high stakes were written
before the first run. No Gemini, no UI.

Cost: about 1,900 input tokens and a median of about 150 ms per prompt.

## Findings

**Jev separates jobs.** All 20 pairs were separated by at least one question (separation ≥ 0.5 on a 0–1
scale). Stage separated 18, done 17, cardinality 14, flow 7, stakes 7, urgency 5.

**It mostly agrees with a person.** Stage 36/40, high stakes 38/40, done 30/40. Confidence is lower where it
disagrees (stage 0.82 against 0.93, done 0.60 against 0.79), so confidence is usable as a routing signal,
though not a sharp one.

**Several disagreements are the labels' fault.** "Find me three Italian restaurants" is exploring, not
comparing, because the option says "I have a few candidates in mind" and the person has none; stage plus
cardinality (`few`) recovers the intent. `done` blurs where the categories overlap: know against reassured
("Where is my package?"), and finished_task read literally ("Log today's run").

**Wording matters more than anything else.** Two questions were reworded after the first run:

- Flow asked "who holds the information that matters?". Jev read it literally: my spending is *my*
  information, so "How much did I spend on eating out?" came back person-to-system. Reworded to "what will
  the person mostly be doing?", it now says "Delete my account", "Send $50 to Alex" and "Book the 7am
  flight" are *read first, then confirm*, which is the confirmation pattern a designer would reach for.
- Cardinality asked "how many things is the person dealing with?". Someone shopping for a laptop wants *one*
  laptop. Reworded to "how many separate items would the assistant need to show?", its separations went
  from 6 pairs to 14, and `many` started appearing.

A rewording of stage made things worse ("My car won't start, what do I do?" became exploring) and was
reverted. The hand labels for flow and cardinality were written for the old wording, so those two are no
longer scored against labels.

**The graded scales behave.** Stakes: deleting an account 2.9 of 3, sending money 2.0, booking a flight 1.9,
read-only requests 0.0–0.4. Urgency: "for tonight" 1.7 of 2, "right now" 2.0, "my car won't start" 2.0.
Attention: "Send $50" 0.1 of 3, comparing laptops 2.0, a how-to 2.3.

**Anxieties are plausible and sparse.** A mole: loss and safety. A weird login email: loss and safety. A
smelly sourdough starter: loss and doing it wrong. The electricity bill: cost. "Delete my account" raises
only commitment, while "What happens to my data if I delete my account?" raises commitment, loss and doing
it wrong: the first person has decided, the second has not. "Send $50 to Alex" raises none.

**Conditional questions are not gated.** "If the person is choosing among options, will price matter?"
answers sensibly for restaurants and laptops but also fires for "Where is my package?". As in the rest of
the pipeline, ask speculatively and let code read the answer only when stage says a choice is being made.

## What this supports

A job profile is cheap, fast and discriminating enough to drive layout. A first mapping to try:

| Profile                                          | Pattern                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| committing, stakes ≥ 2                           | confirmation: consequences restated, safe default button   |
| committing, flow = both                          | review then confirm; form only for what is still unknown   |
| checking, attention < 1                          | one number or status, big; everything else behind a button |
| checking, done = reassured                       | verdict first ("you're fine"), evidence second             |
| comparing, cardinality = few                     | side-by-side cards with aligned attributes                 |
| exploring, cardinality = many                    | browsable list, selection criteria as card fields          |
| doing, urgency high                              | steps, large, no prose                                     |
| any anxiety ≥ 0.6                                | a line of reassurance addressing that anxiety              |
| stage split between two options                  | serve the likelier; offer the runner-up as an action       |

Selection criteria (`by_price`, `by_time`, ...) can choose which fields Gemini writes per item and which one
becomes the card's badge, so Jev would shape the content schema and not only the layout.

## Caveats

Forty prompts, one labeller, one model version, no context beyond the prompt. The labels and the questions
came from the same head, which flatters agreement. Nothing here shows that job-driven screens are better
screens; it shows the signal exists.
