# IAT Scoring — Methodology & Implementation Specification

**Scoring version:** `improved-d-2003/v1` (platform result) · `conventional-2003/v1` (inactive, comparison only)
**Source of truth:** Greenwald, A. G., Nosek, B. A., & Banaji, M. R. (2003).
*Understanding and Using the Implicit Association Test: I. An Improved Scoring Algorithm.*
Journal of Personality and Social Psychology, 85(2), 197–216.
**Implementation:** `src/lib/iat/scoring/improved-d-score.ts` (pure, deterministic, unit-tested)
**Independent validation:** `scripts/validate-scorer.ts` — 500 synthetic sessions vs. a
naive step-by-step reference implementation written directly from the paper: **max
absolute difference 0.00e+0 (exact numerical agreement)**.

---

## 1. What is raw data vs. processed data

| Layer | Where | Content | Mutability |
|---|---|---|---|
| **Raw** | `Trial` rows | `rt` (first-response latency, ms), `responseKey` (first key), `correct` (derived server-side from plan), `correctionRt`, `errorCount`, `flags` (ingest-time annotations) | **Immutable.** Never overwritten, never "cleaned". |
| **Processed** | `Score` rows + `statsJson` | block means, pooled SDs, D1/D2, D, normalizedD, validity, counters (removed/penalized trials) | Recomputable from raw + plan snapshot. |

Preprocessing exists **only** inside the scorer as a derived copy. Nothing in the
scoring pipeline writes back to `Trial` rows.

Correctness (`correct`) is derived **server-side** from the immutable session plan
(`correctKey`) vs. the client's submitted `responseKey`; the client is never trusted for
correctness judgments.

### Input modality & client-side input filter (test definition v1.1.0)

Since v1.1.0 the primary response input is the two **on-screen buttons** (`pointerdown`;
touch/mouse/pen) with the keyboard (E/I) as a silently supported desktop alternative.
The stored `responseKey` (E/I) always denotes the chosen **side** (left/right), identical
semantics across input devices.

Client-side **anticipation lockout = 200 ms** (`ANTICIPATION_LOCKOUT_MS`,
`TrialRunner.tsx`): inputs arriving < 200 ms after stimulus onset are *ignored* (the trial
continues waiting; nothing is recorded). This is an input-collection criterion, applied
*before* any data exists — it is **not** a preprocessing step and does not transform or
delete recorded data. Consequence for the scorer: recorded RTs are ≥ ~200 ms by
construction, which is below the 300 ms fast-response threshold, so the fast-response rule
(§3, step 3) remains fully meaningful. Sessions collected with v1.0.0 (keyboard-only,
desktop-only) and v1.1.0 (touch-first) differ in input modality; do not pool them in a
single analysis without checking modality as a covariate (`Session.deviceType`,
`TestVersion.version`).

## 2. Data entering the scorer

Only the four **critical combined blocks**: B3 (20 trials), B4 (40), B6 (20), B7 (40) —
120 trials per session. Practice discrimination blocks (1, 2, 5) are excluded.

## 3. Preprocessing steps (in order)

1. **Missing/implausible RT** (`null`, negative, non-finite): excluded from all
   computations; counted as `missingRt`; flag `trials_with_missing_rt_excluded`.
   (Healthy sessions contain none — trials wait indefinitely for a response.)
2. **Slow cutoff:** trials with `rt > 10,000 ms` are **deleted** (not recoded);
   counted as `slowRemoved`; flag `slow_trials_over_10000ms_removed`.
3. **Fast-response rule:** count trials with `rt < 300 ms` among the remaining.
   - If proportion **> 10 %** → quality flag `fast_responses_gt_10pct` and the session
     is **invalid** (`exclusionReason = fast_responses_gt_10pct`). The D is still
     computed and stored for research inspection, but `valid = false`.
   - Otherwise fast trials are **retained** in scoring (per the paper — no deletion).
4. **Built-in error penalty (BIEP):** for each critical block *b*:
   `correctMean(b) = mean(rt of correct trials in b)`;
   each error trial's effective latency := `correctMean(b) + 600 ms`.
   - A block with **zero correct trials** cannot be penalized → session invalid
     (`no_correct_trials_in_block_<b>`).
   - Flag: `errors_penalized_biep_600ms`; counter `penalizedErrors`.

There is **no 300/3000 ms recoding** in the improved algorithm. (The paper found the
conventional recoding harmful; extreme values are handled by the 10 s deletion + 300 ms
exclusion rule.)

## 4. Block statistics

For each critical block, over all used trials (correct raw RTs + penalized error RTs):

```
M(b) = mean(effective latencies of b)
```

Stored per session: `b3Mean`, `b4Mean`, `b6Mean`, `b7Mean`.

## 5. Pooled standard deviations

For each paired set of blocks, the **sample SD (n−1 denominator)** is computed over the
**pooled set of all effective latencies** from both blocks (correct + penalized error):

```
SD_practice = SD( B3 ∪ B6 )      # stored as pooledSdPractice
SD_test     = SD( B4 ∪ B7 )      # stored as pooledSdTest
```

Edge cases:
- `SD = 0` → session invalid (`zero_variance`).
- `n < 2` in a pooled pair → session invalid (`insufficient_trials_for_sd`).

## 6. D computation

```
D1 = ( M(B6) − M(B3) ) / SD_practice
D2 = ( M(B7) − M(B4) ) / SD_test
D  = ( D1 + D2 ) / 2
```

Stored: `d1`, `d2`, `dScore` (= D).

## 7. Directionality (normalizedD)

`D > 0` means responses were faster in the **first pairing** (blocks 3–4) than in the
reversed pairing (blocks 6–7). Which association that corresponds to depends on the
counterbalancing condition:

| Condition | Blocks 3–4 pairing | Raw D > 0 means | normalizedD |
|---|---|---|---|
| **A** | Iranian+Positive | stronger Iranian+Positive association | `D` |
| **B** | Iranian+Negative (Afghan+Positive) | stronger Iranian+Negative association | `−D` |

```
normalizedD = D × (+1 if conditionOrder == "A" else −1)
```

**Contract (fixed for all analyses):** `normalizedD > 0` = stronger
**Iranian+Positive / Afghan+Negative** association; `normalizedD < 0` = the reverse.
Both `dScore` (procedure-native) and `normalizedD` (analysis-native) are stored.

## 8. Session-level validity

A session's improved score is `valid = true` iff **all** of the following hold:

- all four critical blocks were submitted with the exact planned trial counts and
  sequence (server-side check vs. `blockPlanJson`; mismatch → session `INVALID`,
  reason `trial_count_mismatch` / `trial_sequence_mismatch`);
- no `empty_critical_block_*`, `no_correct_trials_in_block_*`;
- `fastResponseRate ≤ 0.10`;
- `pooledSdPractice > 0` and `pooledSdTest > 0`.

Quality metadata (`fullscreenExitCount`, `visibilityChangeCount`, `awayDurationMs`,
`fullscreenDenied`) are stored and displayed for the researcher but **never** alter
timing data or validity by themselves.

## 9. Interpretation conventions (result page)

Neutral, relative language only — never normative statements. Magnitude classes follow
common IAT practice (Nosek, Greenwald & Banaji, 2007):

| \|normalizedD\| | Class (fa) |
|---|---|
| < 0.15 | ناچیز |
| 0.15 – 0.35 | اندک |
| 0.35 – 0.65 | متوسط |
| ≥ 0.65 | نسبتاً قوی |

The page always includes the caveat that the IAT is a **relative** index of automatic
association in a specific task, not a definitive measure of attitude. Invalid sessions
show: «به دلیل کیفیت ناکافی داده‌ها، این نتیجه برای تفسیر پژوهشی قابل اتکا نیست.»

## 10. Conventional scorer (`conventional-2003/v1`, inactive)

Implements the pre-2003 procedure as described in Greenwald et al. (2003, pp. 202–204):
errors **excluded** entirely; remaining latencies **winsorized** to [300, 3000] ms;
block means over correct trials; pooled SDs over the same recoded latencies;
`D = avg((M6−M3)/SD, (M7−M4)/SD)`; same directionality contract. Stored in its own
`Score` row — the two scorers are never mixed or averaged.

## 11. Versioning policy

- `scoringVersion` is stored per `Score` row and per `TestVersion`.
- Any change to constants (600 / 10000 / 300 / 0.10), the BIEP rule, the SD definition,
  or directionality **must** bump the version (e.g. `improved-d-2003/v2`) and be
  accompanied by updated unit tests and this document. Historical rows are never
  recomputed.

## 12. Hand-verifiable fixtures (also encoded in tests)

**Fixture 1 (all correct):** B3 = 20×600, B4 = 40×600, B6 = 20×800, B7 = 40×800.
M3=M4=600, M6=M7=800. SD(3,6)=√(400000/39), SD(4,7)=√(800000/79).
D1 = 200/SD(3,6), D2 = 200/SD(4,7), D = (D1+D2)/2 ≈ **1.9748, 1.9874 → 1.9811**.

**Fixture 2 (BIEP):** B3 = 18 correct @500 + 2 errors → correctMean = 500 → errors
become 1100 → M3 = (18·500 + 2·1100)/20 = **560**. With M4=600, M6=700, M7=900:
SD(3,6)=√(844000/39) over {18×500, 2×1100, 20×700}, SD(4,7)=√(1800000/79).
D1 = 140/SD(3,6) ≈ 0.9517, D2 = 300/SD(4,7) ≈ 1.9874 → D ≈ **1.4696**.

Both are asserted to 1e-9 against the implementation and against the independent
reference implementation.
