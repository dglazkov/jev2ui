# Watching coherence probes

The default observer now shows the [closed IA experiment](closed-ia.md), built from JEV/GEV decisions
and code. These earlier transition experiments remain available at `http://127.0.0.1:5174/transitions`.

Start the local observer, then a probe in a second terminal:

```sh
npm run observe:journeys                 # http://127.0.0.1:5174
npm run probe:coherence                  # Jev
npm run probe:coherence -- --endpoint=gev # requires GEV_API_KEY
```

The observer is read-only and binds to the loopback interface. `JOURNEY_PORT` changes its port.
Choose a run and a journey to see each action, before/after content, pending requests, decisions,
all alternative probabilities, latency, input tokens, and errors. Expand the evidence panels for
the exact model state, question wording, and timestamped answers. A run link has its ID in the URL
fragment; send that link to another browser on the same machine to open the same run. The server
must still be running. New runs appear in the selector without changing the run being inspected.

Every request is saved before calling the model. Each answer or failure updates the recording
atomically in `.cache/journeys/`. Completed runs can be revisited without further model calls;
the download link exports the entire JSON recording. A forcibly stopped probe can leave a run
marked `running`; the observer reports a lack of recent events instead of assuming success or
failure. The recordings contain fixture content and model inputs/outputs, but no API keys.

For a preview without model calls:

```sh
npm run probe:coherence -- --fixtures
```

This records only the fixtures and questions, with no simulated answers. Hand labels are always
kept separate from the model request. Labels are one person's judgment, not an objective measure
of IA quality. Disagreements remain visible; proposed repairs are never applied.

## What is being observed

The default suite observes **constructed semantic journeys**. Ten cases contain fourteen transitions, covering redundant Settings and Add booking
actions, legitimate narrower scopes, completion and intentional repetition, confirmation regress,
duplicate profiles, Back, in-place changes, and unexplored destinations.

The fixture descriptions explicitly state what changed. This isolates whether the critic can read
the relationship; it does not test extraction of that relationship from generated screens.
The saved-app mode below now tests actual generated screen content. Nothing has been added to
production screen generation.

The critic answers two independent Choice questions: the transition's semantic relationship and a
suggested repair. `remove` means remove or replace a redundant forward action; it does **not** mean
the missing completion behavior has been implemented. There is no automatic correction loop yet.

## First run

On 2026-09-20, the configured Jev endpoint with requested model `jev-latest` matched both labels on
13/14 transitions, with no request errors. The API's resolved model version was not recorded.
The duplicate-profile case was classified `repeats / reuse`, while the labels were `narrows / reuse`.
This suggests the relation wording can confuse duplication elsewhere in the app with repetition
of the current task, even when the repair choice is right. The original result is preserved in the
recording; the rubric and labels were not tuned after that run. GEV was not run because its key
was not configured. These explicit, small fixtures do not establish reliability on real apps.

## Checks

```sh
node --import tsx --test src/probe/journey-observer.test.ts src/probe/saved-journey.test.ts
npm run typecheck
```

The observer test verifies live pending/answer/error states, persisted replay, raw probability
retention, incomplete/corrupt file handling, and read-only/path boundaries without calling a model.

## Real case: podcast Settings

The first captured case comes from the user's [shared podcast app](https://jev2ui.cnfg.ai/?app=V5aRTiGrnarkJIU2v2Nzsp).
Its public `/api/apps/<id>` response supplies the Firestore-backed snapshot, so direct database access
was unnecessary. `src/probe/fixtures/podcast-settings.json` preserves the app payload, its SHA-256
fingerprint, source URL, capture time, and the external hypothesis `repeats / remove`. Owner metadata
from the response is excluded. The fingerprint covers `JSON.stringify(app)` before schema parsing.

```sh
npm run probe:coherence -- --saved=src/probe/fixtures/podcast-settings.json
```

The importer replays data updates with the renderer's replace-at-path semantics and collects the final
component tree. It verifies that the saved source/action key actually leads to the selected destination.
The critic sees the original app brief, action, and both screens' final data and components. The prompt
does not invent an end-user goal or describe a defect. Original generation judgments and the user's
diagnosis remain outside the critic input and can be expanded separately in the observer.

Both original screens were generated through GEV. Screen 1 is a settings archetype (0.9807) with a
Settings top-bar action (0.7189). Screen 2 is also settings (0.9696), with no top-bar action (0.6338).
The saved journey therefore demonstrates one redundant transition, not an indefinitely repeating loop.

| Evidence | Before | After the gear tap |
| --- | --- | --- |
| Header | Settings | Playback Settings |
| Groups | Playback, Storage, Account | Playback, Downloads, Notifications, Account |
| Email | alex.turner@example.com | alex.morgan@example.com |
| Subscription | Premium | Premium Annual |
| Auto download | On/off switch | Value picker: Unplayed only |

The title suggests a narrower destination, but Account remains and Notifications are added. Existing
settings overlap, while some facts and control semantics change without a corresponding user action.
This is why a strict test for identical screens would miss the user's complaint.

On 2026-09-20, the **unchanged** `transition-v1` critic, run through Jev against this content, answered
`narrows` (0.92) and `keep` (0.73). This contradicts the recorded hypothesis. Its 2,897-token request and
raw distributions are preserved in the observer. This is one observation, not a reliability estimate.
The rubric was not changed to get a passing result. GEV generated the screens; Jev critiqued them.

The code supplies three concrete mechanisms:

1. The planner asks archetype and top-bar action independently, and `readPlan` accepts the Settings
   action on a settings archetype. The first result contains that combination.
2. `mock/link.ts` maps the gear to `Settings for the app`, and `web/app.ts` keys that destination by
   source ID and action. It has no semantic identity check against the current screen.
3. An app-bar transition carries no `about` object. The content writers get the original brief and
   arrival description, but not the source screen's preference/account data, allowing it to be invented again.

Next hypotheses to test: whether the critic follows the header too strongly; whether extra controls are
mistaken for a narrower scope; and whether scope, ownership of settings, and continuity of data should
be evaluated separately. Title-neutralized counterfactuals and independent scope/continuity questions
would distinguish these explanations. None has been tested yet.

## Continuation: Home creates a third Settings destination

The user's [second shared snapshot](https://jev2ui.cnfg.ai/?app=1bBefIY7vTKA84bPDZtckf)
continues the same app. The saved creation path contains Settings (1) → Back → Podcast Home (4)
→ Settings tab → Podcast Settings (5). Screens 2 and 3, Playback Settings and its Skip forward
picker, also existed before screen 5. We do not infer unrecorded back-stack taps from creation turns.

```sh
npm run probe:coherence -- --saved=src/probe/fixtures/podcast-settings-return.json
```

The browser already tries to preserve Settings when making Home, but registers only the key
`4:appbar:settings` against screen 1. Home's generated top-bar action is Notifications, and Settings
is a bottom navigation destination. Its tap uses `nav:Settings`, which is absent, so screen 5 is
created. The saved keys confirm this exact split. This is a routing/identity defect before the next
screen planner is even called.

Screen 5 has Settings in its top bar again (GEV probability 0.542), so it also reintroduces the first
problem's entry point. Its account data is now `sarah.jenkins@example.com` and `Premium Plus`, a third
version of the same app's account. A gear tap from screen 5 is not present in this saved snapshot.

The importer now recognizes app-wide nav keys, checks the recorded source against the generation
request, and includes destinations created before the target's creation turn. It also carries the
explicitly selected, verified prior path. Original model decisions and all hand labels stay out of
the critic input. The importer uses the saved screen snapshots; a later edit to an earlier screen
would need a historical version to reconstruct exactly what was visible at that time.

With the same `transition-v1` questions, Jev selected `starts` (0.43; `advances` 0.39) and `reuse`
(0.64) on 2026-09-20, using 6,892 input tokens. Our labels were `returns / reuse`. The repair matches;
the relationship label differs. Opening preferences from Home can reasonably look like starting a
task, so this combined-label disagreement should not be treated as an entirely wrong critique.
The observer now shows agreement separately for each decision. No controlled ablation has shown
which extra evidence caused the reuse recommendation.

This motivates separating three decisions: what destination an action addresses, whether that
destination already exists, and which navigation presentation it needs at this entry point.
Screen 1 has a Back arrow; screen 5 has the main navigation. Reusing the same logical destination
must preserve its content while allowing that surrounding navigation to be appropriate to the route.
The current critic recommends reuse but does not yet select which existing Settings destination
should own the content. No production routing fix has been applied.
