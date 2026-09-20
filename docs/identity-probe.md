# Incremental destination identity: first comparison

Run: `2026-09-20T21-18-35-133Z`, September 20, 2026. Endpoint: Jev, model: `jev-latest`.

This is a decision experiment, not a change to production navigation. It asks whether a newly
encountered link refers to a registered mock destination or a new destination. It does not
implement settings, application state, picker options, or screen generation.

## Method

Twenty cases were frozen before the run. Six use evidence from the checked-in
`src/probe/fixtures/podcast-settings-return.json` recording; fourteen are authored contrasts.
The recording's fingerprint is verified before extraction. Expected identities are authored
contracts, not model judgments, and are never included in requests. Existing generated duplicate
screens in the capture are excluded from the candidate catalogs.

Each case ran twice in forward and reversed candidate order, through each of two strategies:
160 HTTP requests, 80 per strategy. Three concurrent workers were used. Each request is one Jev
batch; pairwise comparisons are independent questions in that batch, not a series of round trips.
Both strategies receive the same source evidence and candidate records, with opaque option keys.
No probability threshold, retry, model tie-breaker or prompt tuning was applied.

- **Selection:** choose an existing destination, new, or uncertain from one Choice question.
- **Pairs:** independently choose same, different, or uncertain for each candidate. Exactly one
  same and no uncertain answers produces reuse; all different produces new; conflicting matches
  or any uncertain comparison produces uncertain.

Candidate records include the original introduction, destination intent, aliases when established,
and planned/generating/made status. Their IDs remain stable when option positions change.
The intent text for captured links is constructed by the existing `mock/link.ts` code; authored
cases explicitly supply scope and intent. This latter simplification must be tested against more
raw screen evidence before drawing production conclusions.

## Results

| Measure | Selection | Pairs |
| --- | ---: | ---: |
| Correct trial decisions | 72/80 | 75/80 |
| Incorrect reuse against expected identity | 8 | 5 |
| New when an existing destination was expected | 0 | 0 |
| Uncertain answers | 0 | 0 |
| Correct recorded-evidence trials | 24/24 | 24/24 |
| Correct authored-contrast trials | 48/56 | 51/56 |
| Median request latency | 137 ms | 147 ms |
| p95 request latency | 212 ms | 219 ms |
| Reported input tokens | 69,380 | 109,388 |
| Forward/reverse disagreements | 0/34 | 1/34 |
| Repeated same-order disagreements | 0/40 | 1/40 |
| Request errors | 0 | 0 |

The whole run took 8.23 seconds at concurrency three. These are measured request latencies,
not production interaction latency guarantees. There were no Gemini calls.

The 80 trials per strategy are repetitions of 20 unique cases, not 80 independent examples.
Order comparisons exclude single-candidate catalogs. The pairwise order disagreement overlaps
ordinary repeat variability, so this run does not isolate a causal position effect.

Both approaches passed the recorded Settings gear, Home return, Settings navigation and individual
Skip-forward picker cases. Both separated Theme from Units, reused planned and generating
identities, distinguished recipe reading from editing, and honored an established alias.

## Preserved failures

1. **Broader Appearance overview versus existing Preferences.** The requested destination was an
   overview of fonts, density and theme, whereas the existing Preferences destination covered
   display, units and alerts. Selection reused Preferences in all four trials; pairs did so once
   and correctly chose new three times. Selection's first failed answer put 0.46 on reuse and 0.42
   on new. The method still chose reuse: probabilities were recorded, not used as an ad hoc gate.
2. **Theme with unspecified owner.** The catalog contained both app Theme and physical-display
   Theme. The requested link supplied neither scope. Both strategies selected app Theme in all
   four trials, rather than the authored policy expectation of uncertainty. One selection answer
   put 0.50 on app Theme and 0.43 on uncertain. The app context may encourage that assumption;
   this result shows that requesting abstention does not reliably enforce it.

No failing case was removed and no prompt was tuned after observing these results.

## Interpretation and next experiment

The catalog formulation supports distinctions the fixed responsibility map could not express.
Pairwise matching was somewhat more accurate on this small set, with similar request latency and
about 58% more reported input tokens. That is insufficient evidence to select a production winner.
Neither method reliably abstained on missing scope.

The next probe should independently ask whether evidence establishes the destination's scope,
separately from which candidate is closest. Evaluate that on a fresh held-out set including
ambiguous parent/child overviews, app versus device/account scopes, and conflicting aliases. Do
not select confidence cutoffs on these twenty examples and report them as validated accuracy.

Production integration also needs a sequential catalog replay and concurrent registration tests.
These cases supply catalogs directly: they test reuse of in-flight records, but not atomic creation
or deduplication of two simultaneously discovered new destinations. Exact repeated links should
ultimately bypass Jev through stored bindings.

## Reproduce and inspect

```sh
npm run probe:identity -- --repeats=2
node --import tsx --test src/server/ia/identity.test.ts
```

Each run creates `.cache/identity/<timestamp>/run.json` containing the frozen cases, expected
answers, exact requests, answers and probabilities, timings, aggregate scores, and source snapshots
with SHA-256 hashes. `summary.json` contains the metrics and every failed trial. These files remain
local and are git-ignored; this document preserves the first run's results in the repository.

The experiment lives in `src/server/ia/identity.ts`, `src/probe/identity-cases.ts`, and
`src/probe/identity.ts`. Unit tests cover stable IDs under candidate reorder, ambiguous/conflicting
pair decisions, malformed answers, empty-catalog behavior, separate error metrics, capture integrity,
and keeping gold labels out of requests.
