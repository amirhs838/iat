# IAT Research Platform — Implicit Association Test (7-Block, Self-Hosted)

A production-minded, **research-grade, fully self-hosted** web platform for running the
standard **7-block Implicit Association Test** with the **improved scoring algorithm of
Greenwald, Nosek & Banaji (2003)**.

Current test version: targets **Iranian / Afghan** (placeholder images), attributes
**Positive / Negative** (standard IAT word exemplars in Persian). Every category name,
stimulus, and trial count is **configuration-driven** — replacing images later requires
**zero changes** to the engine, scoring, database, or dashboard.

---

## 1. Scientific references (source of truth)

| Topic | Source |
|---|---|
| Scoring algorithm (D, recommended/improved) | Greenwald, A. G., Nosek, B. A., & Banaji, M. R. (2003). *Understanding and Using the Implicit Association Test: I. An Improved Scoring Algorithm.* Journal of Personality and Social Psychology, 85(2), 197–216. |
| 7-block procedure | Greenwald et al. (2003), Table 1; Nosek, Greenwald & Banaji (2007), *The IAT at Age 7*; standard Inquisit (Millisecond) IAT layout. |
| Reference implementations used for cross-checking | ianhussey/ImplicitAssociationTest (PsychoPy; block layout 20/20/20/40/**40**/20/40), jsPsych `iat-image` plugin docs (E/I keys, red-X + force-correct behavior), IATscores R package (`recode600` + `dscore` definitions). |
| Interpretation magnitude conventions | Nosek, Greenwald & Banaji (2007): \|D\| < 0.15 negligible, 0.15–0.35 slight, 0.35–0.65 moderate, ≥ 0.65 strong (conventions, not thresholds). |

**No statistical formula was invented.** The scorer is validated numerically against an
independent step-by-step implementation (see §Validation).

### Locked block configuration (explicit constants)

```
BLOCK_1_TRIAL_COUNT = 20   # target discrimination
BLOCK_2_TRIAL_COUNT = 20   # attribute discrimination
BLOCK_3_TRIAL_COUNT = 20   # combined practice        [critical for D]
BLOCK_4_TRIAL_COUNT = 40   # combined test            [critical for D]
BLOCK_5_TRIAL_COUNT = 40   # REVERSED target discrimination  ← locked at 40
BLOCK_6_TRIAL_COUNT = 20   # reversed combined practice [critical for D]
BLOCK_7_TRIAL_COUNT = 40   # reversed combined test     [critical for D]
TOTAL = 200 trials
```

Why Block 5 = 40: Greenwald et al. (2003) Table 1 and the Inquisit standard use 40
trials (the older layout used 20). This is locked in
`src/config/iat/test-definition.ts` and exported as `BLOCK_5_TRIAL_COUNT`, asserted by a
unit test.

> **Engineering note — why not jsPsych?** The jsPsych `iat-image` plugin was evaluated.
> It was rejected for this platform because it cannot provide: seeded reproducible
> sequences, server-authoritative plans, the improved (2003) scoring pipeline, per-trial
> quality tracking (fullscreen/visibility), or offline buffering. Our engine follows the
> same standard procedure and cross-checked reference behaviors instead.

---

## 2. Architecture

```
┌────────────────────────────── Next.js 16 (App Router, TypeScript) ─────────────────────────────┐
│                                                                                                │
│  Participant SPA (/)                     Admin (/admin/*)              API layer (/api/*)      │
│  ├── compat check                        ├── login (scrypt +           ├── /api/session        │
│  ├── consent + demographics              │   DB session cookies)       │   (create+plan)      │
│  ├── preload (all stimuli)               ├── dashboard + charts        ├── /api/session/[id]   │
│  ├── 7-block engine (offline)            ├── sessions / detail         │   /start /complete    │
│  ├── RT via performance.now()            ├── participants              │   /abandon            │
│  ├── quality tracking                    ├── analytics                 ├── /api/admin/*        │
│  └── result page                         ├── stimuli                   │   (stats, sessions,   │
│                                          └── settings + exports        │    participants,      │
│                                                                        │    analytics, stimuli,│
│  src/lib/iat/* — engine core (pure, tested)                            │    settings, export)  │
│  src/lib/iat/scoring/* — scorers (server-side only)                    └───────────────────────┘
│  src/config/iat/test-definition.ts — single source of truth for the test                     │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
                                   │ Prisma ORM
                                   ▼
                 SQLite (sandbox) / PostgreSQL (production target)
```

Key directories:

```
prisma/schema.prisma            # PostgreSQL-portable schema (see DB note below)
db/custom.db                    # SQLite file (sandbox only)
src/config/iat/test-definition.ts  # ★ THE test configuration (edit THIS to change stimuli)
src/lib/iat/types.ts            # shared engine types
src/lib/iat/random.ts           # mulberry32 PRNG, seeding, condition assignment
src/lib/iat/blocks.ts           # counterbalanced block plan builder
src/lib/iat/sequence.ts         # seeded trial-sequence generator (quotas + constraints)
src/lib/iat/scoring/improved-d-score.ts     # ★ Greenwald et al. (2003) recommended algorithm
src/lib/iat/scoring/conventional-score.ts   # legacy scorer (inactive, for comparison)
src/lib/iat/scoring/index.ts    # server-side validation + score orchestration
src/lib/iat/interpretation.ts   # directionality normalization + neutral Persian text
src/components/iat/TrialRunner.tsx  # critical experiment screen (timing engine)
src/components/iat/IatApp.tsx       # participant state machine
src/components/admin/*          # admin dashboard UI
src/app/api/**                  # REST API (route handlers)
tests/unit/*.test.ts            # 31 unit/integration tests (bun test)
scripts/seed.ts                 # admin + TestVersion + Stimulus seeding
scripts/seed-demo.ts            # optional DEMO dashboard data (labeled "DEMO-")
scripts/generate-stimuli.mjs    # placeholder SVG generator
scripts/validate-scorer.ts      # scorer vs independent reference validation
docs/IAT_SCORING.md             # ★ full scoring methodology document
```

---

## 3. Data model (Prisma)

`AdminUser`, `AdminSession`, `Participant`, `Session`, `Trial`, `Score`, `Stimulus`, `TestVersion`.

Important design decisions:

- **Raw data is never modified.** `Trial.rt` stores the first-response latency exactly as
  measured; error trials additionally store `correctionRt` and `errorCount`.
  Preprocessing (BIEP replacement, 10 s deletion) happens **only inside the scorer** and
  is stored in `Score.statsJson` / per-trial `flags` — never written back to raw fields.
- **Reproducibility.** Every `Session` stores `testVersionId`, `conditionOrder`,
  `blockOrder`, `randomSeed`, and a full `blockPlanJson` snapshot (all 200 planned
  trials). Given the seed + condition + test-definition version, the sequence is
  bit-identical (unit-tested).
- **Scores are versioned.** `Score.scoringAlgorithm` ∈ {`improved-d-2003`,
  `conventional-2003`} and `scoringVersion` ∈ {`improved-d-2003/v1`,
  `conventional-2003/v1`}. They are separate rows and never mixed. The participant
  result page uses **only** `improved-d-2003`.
- `Score.normalizedD` is sign-normalized: **positive = stronger Iranian+Positive /
  Afghan+Negative association**, regardless of counterbalancing order (see
  `docs/IAT_SCORING.md`).

### Database note (documented deviation)

The research target is **PostgreSQL**; this sandbox ships **SQLite only**. The schema is
written to be 100 % PostgreSQL-portable (no SQLite-specific types; JSON stored as TEXT;
enum-like fields are strings validated with zod + TS unions). To switch on a VPS:

1. In `prisma/schema.prisma`: `provider = "postgresql"`.
2. Set `DATABASE_URL` to the Postgres connection string.
3. `npx prisma migrate dev --name init` (or `prisma db push`).

---

## 4. Method: procedure, counterbalancing, randomization

### 4.1 Response mapping (standard IAT)

- Response **sides**: **left** / **right**, internally coded as **E (left)** / **I (right)**
  (standard IAT convention).
- **Primary input (v1.1.0+): two large on-screen buttons** pinned to the bottom-left and
  bottom-right of the experiment screen, labeled with the current block's category names.
  They capture `pointerdown` (identical path for touch, mouse and pen — no keyboard
  required; mobile/tablet participation is supported).
- On desktop, the physical keyboard (**E**/`KeyE`, **I**/`KeyI` via `event.code`) remains
  silently supported as a secondary input, so Persian keyboard layouts behave identically.
  The stored `responseKey` always means the chosen **side** (E = left, I = right), not the
  physical device.
- Attribute categories keep the same side in **all** combined blocks
  (Positive → left/E, Negative → right/I).
- Target categories swap sides at Block 5 and keep those sides through 6–7 → the
  target–attribute pairing reverses (verified against Inquisit/jsPsych behavior).
  The block-intro screen and the button labels always show the current mapping; every
  side-pinned UI row is rendered with an explicit `dir="ltr"` container so physical screen
  sides always match the engine's left/right semantics under the RTL document direction.

### 4.2 Counterbalancing (condition A / B)

| Block | Condition A (left / right) | Condition B (left / right) |
|---|---|---|
| 1 | ایرانی / افغان | افغان / ایرانی |
| 2 | مثبت / منفی | مثبت / منفی |
| 3–4 | ایرانی یا مثبت / افغان یا منفی | افغان یا مثبت / ایرانی یا منفی |
| 5 | افغان / ایرانی | ایرانی / افغان |
| 6–7 | افغان یا مثبت / ایرانی یا منفی | ایرانی یا مثبت / افغان یا منفی |

- Condition A ⇒ **Iranian+Positive** is the first pairing (blocks 3–4).
- Condition B ⇒ **Iranian+Negative** is the first pairing.
- Assignment is **cryptographically random 50/50** per session (`crypto.getRandomValues`),
  stored in `Session.conditionOrder` (never user-id parity or client-side logic).

### 4.3 Randomization (seeded, reproducible)

- Per-session 16-hex-char `randomSeed` (`crypto.randomBytes`), stored in DB.
- Pure generator `buildSessionPlan(conditionOrder, seed, blockOrder)` produces the full
  200-trial plan; the server snapshots it (`blockPlanJson`) and the client merely
  executes it — **the client never randomizes**.
- Constraints (unit-tested):
  - exact per-block category quotas — 50/50 for single-discrimination blocks,
    25/25/25/25 for combined blocks;
  - no immediate repetition of the same exemplar;
  - no more than 3 consecutive trials of the same category;
  - exemplar cycling: full shuffled cycles before any exemplar repeats.

### 4.4 Error handling (standard IAT behavior)

Wrong response → red **✕** below the stimulus **+ the correct button is highlighted green** →
participant must press the **correct** button/key to continue (force-correct, as in the
Inquisit standard / jsPsych `force_correct_key_press`).
Recorded per trial: first-response key + `rt` (raw), `correctionRt` (onset → correct response),
`errorCount` (including extra wrong presses during correction).

**Anticipation lockout (v1.1.0+):** inputs arriving within the first **200 ms** after stimulus
onset are ignored (not recorded, trial keeps waiting). Rationale: choice RT below ~200 ms is
not physically meaningful, and the window absorbs double-tap/double-press input leaking from
the previous trial into the next one (a common touch-input artifact). This is an *input*
criterion, not a data transformation — raw RTs of accepted responses are never altered.

### 4.5 Timing strategy

- `performance.now()` at **post-paint stimulus onset** (double `requestAnimationFrame`
  after commit) → first response (`pointerdown` on the on-screen buttons, or keypress on
  desktop) = `rt`.
- Inter-trial interval: 250 ms blank (config); inputs during the ITI are ignored.
- Inputs < 200 ms after onset are ignored (anticipation lockout, §4.4).
- No network requests, animations, analytics, or lazy loading during critical trials.
  All stimuli are preloaded and `decode()`d before the first trial; the experiment DOM is
  stable (fixed-height stimulus/feedback slots prevent layout shift). Double-tap zoom and
  pull-to-refresh are disabled on the experiment screen (`touch-action: manipulation`,
  `overscroll-behavior: none`).

### 4.6 Preloading

Every unique image in the plan is preloaded (`Image` + `decode()`) with a progress bar.
Any failure aborts the start (clear error + retry). Words need no preload.

### 4.7 Environment gates & quality tracking

- Compatibility screen (v1.1.0+): only hard browser-capability checks (`performance.now`,
  `requestAnimationFrame`). **Mobile phones and tablets are explicitly supported**; screen
  size / pointer type / device type are recorded as session metadata, never used to block.
  Known limitation: touch RT distributions differ from keyboard RT distributions, so input
  modality is versioned (test definition v1.1.0) and should not be mixed with v1.0.0
  keyboard-only data in the same analysis.
- Fullscreen requested on "شروع آزمون" (user gesture). Denial is recorded
  (`fullscreenDenied`) but does not block; exits are counted (`fullscreenExitCount`).
- `visibilitychange` counting + accumulated away time; a `sendBeacon` marks the session
  `ABANDONED` if the page unloads mid-test (server only transitions RUNNING→ABANDONED).
- Session lifecycle: `CREATED → RUNNING → COMPLETED | ABANDONED | INVALID | PENDING_SYNC`.
- Trials are buffered to `localStorage` after every block; upload failure keeps them
  (PENDING_SYNC screen with retry) — the participant is never lost to a network blip.

---

## 5. Scoring (summary)

Full details: **[docs/IAT_SCORING.md](docs/IAT_SCORING.md)**.

**Improved D (recommended, `improved-d-2003/v1`)** — Greenwald et al. (2003):

1. Use blocks 3, 4, 6, 7.
2. Delete trials with rt > 10,000 ms.
3. If > 10 % of remaining trials have rt < 300 ms → session invalid
   (`fast_responses_gt_10pct`); otherwise fast trials are **retained**.
4. Built-in error penalty (BIEP): error latencies → block mean of correct latencies + 600 ms.
5. Block means include penalized error latencies.
6. Pooled SD (sample, n−1) over all latencies of (B3,B6) and (B4,B7).
7. `D1 = (M6−M3)/SD(3,6)`, `D2 = (M7−M4)/SD(4,7)`, `D = (D1+D2)/2`.
8. No 300/3000 recoding (explicitly avoided per the paper).

Directionality: `D > 0` = first pairing (blocks 3–4) faster. The stored
`normalizedD` applies the condition sign so that **positive = stronger
Iranian+Positive / Afghan+Negative** for both conditions.

**Conventional D (`conventional-2003/v1`)** — errors excluded, 300/3000 winsorizing — is
computed for research comparison, stored separately, and inactive in results.

---

## 6. Validation & tests

```bash
bun run test             # 31 tests / 1794 assertions — scorer, randomization,
                         # counterbalancing, pipeline, tamper-rejection
bun run validate:scorer  # 500 synthetic sessions vs independent reference
                         # implementation → EXACT numerical agreement (max diff 0.00e+0)
```

Test coverage includes: all-correct, errors (BIEP), >10 s removal, ≤10 % fast retained,
>10 % fast → invalid, missing RT, incomplete session, zero-variance, no-correct-block,
single-trial blocks, condition-order sign flip, seeded determinism, quota/constraint
verification, plan-vs-submission tamper rejection.

Browser E2E performed: full 7-block run (200 trials) through the real UI with
server-side scoring and the result page; admin dashboard verified against seeded data.

---

## 7. Admin dashboard

`/admin` (protected by DB-backed session cookies; login at `/admin/login`).

- Metric cards: participants, completed/valid/invalid sessions, mean D, median RT, completion rate.
- Charts: D distribution, RT distribution, error-rate distribution (+ analytics page: D by condition, sessions over time, block RTs, exclusion reasons).
- Filters: date range, test version, condition order, validity.
- Sessions & session detail: block performance (B1–B7 mean/median/SD/errors), both score rows, full 200-trial raw table.
- Stimuli registry: per-slot methodological spec (what each image must show), per-slot upload
  (JPEG/PNG/WebP, ≥200×200, ≤8 MB) with reference restore; on-disk file checks; replacement guide.
- Settings: version info, scoring constants, change password.
- Exports: `participants`, `sessions`, `trials (raw)`, `scores (processed)`, `full` × CSV (UTF-8 BOM, Excel-safe) / JSON. Raw vs processed are separate datasets.

**Default credentials (development):** `admin` / `iat-admin-2024` — set
`ADMIN_USERNAME` / `ADMIN_PASSWORD` before seeding in production and change the
password in Settings.

Security: scrypt password hashing (N=16384), opaque session tokens (only SHA-256 stored),
httpOnly+sameSite=lax cookies, secure cookies in production, login rate limiting
(5 attempts / 15 min lockout), origin checks on mutations, Prisma-parameterized queries,
zod validation on every API input, React auto-escaping (no `dangerouslySetInnerHTML`).

---

## 8. Setup & run

```bash
# 1) install
bun install

# 2) environment
cp .env.example .env    # if present; otherwise create .env:
#   DATABASE_URL=file:/home/z/my-project/db/custom.db
#   ADMIN_USERNAME=admin
#   ADMIN_PASSWORD=<strong password>

# 3) database
bun run db:push         # create/sync schema (SQLite sandbox; Postgres on VPS)
bun run db:seed         # admin user + TestVersion + Stimulus registry

# 4) (optional) demo dashboard data — clearly labeled DEMO- participants
bun run db:seed-demo

# 5) reference stimuli (already committed; spec + provenance below)
bun run stimuli:generate   # only if regenerating placeholder SVGs (legacy)

# 6) develop
bun run dev             # http://localhost:3000  (admin: /admin/login)

# 7) quality gates
bun run test && bun run validate:scorer && bun run lint
```

Environment variables:

| Var | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Prisma connection | `file:./db/custom.db` |
| `ADMIN_USERNAME` | seeded admin name | `admin` |
| `ADMIN_PASSWORD` | seeded admin password | `iat-admin-2024` (dev only!) |

---

## 9. Deployment (VPS, self-hosted, no SaaS)

```bash
# Ubuntu 22.04 example
sudo apt update && sudo apt install -y nginx postgresql
# Node 20+ (or Bun 1.1+), e.g. via nvm / bunup

# 1) database
sudo -u postgres createdb iat
sudo -u postgres psql -c "CREATE USER iat_user WITH ENCRYPTED PASSWORD '…';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE iat TO iat_user;"

# 2) app
git clone <your-repo> /opt/iat && cd /opt/iat
bun install
cat > .env <<'EOF'
DATABASE_URL="postgresql://iat_user:…@localhost:5432/iat"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="<strong unique password>"
NODE_ENV="production"
EOF

# 3) schema switch (one line) + migrate + seed
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
npx prisma migrate dev --name init_postgres   # or: npx prisma db push
bun run db:seed

# 4) build & serve (behind nginx with TLS)
bun run build
bun run start          # serves .next/standalone on :3000
```

nginx reverse proxy (TLS via certbot) → `proxy_pass http://127.0.0.1:3000;`.
Run under systemd (`Restart=always`). No external CDN, no paid API, no third-party
service is required at runtime — fonts, charts, and stimuli are self-hosted.

---

## 10. Target stimulus images — spec, provenance, upload

### 10a. Methodological spec (what each slot must contain)

Basis: standard race/ethnicity IAT face-stimulus conventions
(Greenwald, McGhee & Schwartz, 1998, Exp. 3; Greenwald, Nosek & Banaji, 2003;
Project Implicit race-IAT practice):

- real photographs of faces, front-facing (full-face view), neutral or mildly expressive
- grayscale (removes low-level colour/luminance confounds)
- gender-balanced across categories: 4 men + 4 women per target category
- age-matched across categories (adults, 18–45 recommended)
- plain background, uniform crop/size (reference set: 480×600 JPEG)
- no glasses / distinctive accessories, no famous/recognisable individuals (fame confound)
- Iranian–Afghan specific: women in BOTH categories wear a simple head covering so that
  hijab style is not itself a category cue

The authoritative per-slot descriptions live in `STIMULUS_SPEC` /
`STIMULUS_SPEC_GENERAL` (`src/config/iat/test-definition.ts`) and are surfaced in the
admin panel (admin → محرک‌ها) next to each slot.

### 10b. Current reference set (provisional — replace before data collection)

The committed files are REAL photographs (not AI-generated) of Iranian and Afghan
people, sourced from Wikimedia Commons and Flickr via the Openverse API,
CC-licensed (no ND), converted to grayscale and cropped to 480×600. They satisfy the
spec approximately and are explicitly marked «مجموعه مرجع» (provisional) in the admin UI.
The researcher MUST vet/replace them with the final licensed, vetted set before the
main study. Keep a record of image provenance/permissions for the thesis appendix.

### 10c. Replacing images — two supported flows

1. **Admin panel (recommended):** admin → محرک‌ها → per-slot «بارگذاری فایل».
   JPEG/PNG/WebP, ≥200×200 px, ≤8 MB, decodability-validated server-side.
   Non-destructive: the seeded reference file is kept; uploads are stored as
   `<stimulusKey>-custom.<ext>` and the DB registry path is switched; new sessions
   pick them up automatically (registry overlay in `src/lib/iat/registry.ts`);
   archived sessions keep the paths they ran with. «بازگردانی به مرجع» restores the
   reference. Re-running `bun run db:seed` does NOT clobber uploads.
2. **File drop + config:** overwrite files under `public/iat/stimuli/<category>/`
   keeping names (or edit the `exemplars` arrays), bump `version`, re-run
   `bun run db:seed`. Engine, block structure, randomization, scoring, dashboard and
   the participant UI are untouched. Any number of exemplars per category (≥ 2) is
   supported. Attribute words and category labels are edited in the same file.

> Production note: on the VPS, serve `public/` directly from nginx/Caddy (see
> deployment section) so runtime-uploaded files are served without a rebuild.

---

## 11. Export structure

- `participants`: one row per participant (anonymousId, demographics, consent).
- `sessions`: session metadata incl. `conditionOrder`, `blockOrder`, `randomSeed`,
  quality counters — everything needed to reproduce a session.
- `trials` (**raw**): exactly what the browser observed — `rt`, `responseKey`,
  `correctKey`, `correctionRt`, `errorCount`, ingest `flags`. Never transformed.
- `scores` (**processed**): one row per (session × scoring algorithm) with all
  intermediate quantities (`b3Mean…b7Mean`, `pooledSd*`, `d1`, `d2`, `dScore`,
  `normalizedD`, validity).
- `full`: JSON research bundle (all tables + provenance header) or flat joined CSV.

---

## 12. Known limitations (documented, deliberate MVP scope)

1. **SQLite in the sandbox** — production target is PostgreSQL; one-line switch (§3).
2. Rate limiting is in-memory (per instance, resets on restart) — adequate for a
   single-instance self-hosted MVP.
3. Client clock provides `Trial.timestamp` (informational only); all science is in
   server-validated `rt` and the plan snapshot.
4. No resume of an interrupted test (session is marked ABANDONED; the participant starts
   fresh) — deliberate for timing integrity.
5. Timing precision is web-standard (± a few ms; rAF-aligned onsets). For sub-millisecond
   lab precision use in-lab software; for online research this is the accepted standard.
6. The result page uses conventional magnitude breakpoints (§1) — they are community
   conventions, not statistical thresholds, and are labeled as such in the UI.
7. Demo data (`db:seed-demo`) is for dashboard evaluation only and is clearly labeled.

## 13. Legal / research note

The scoring implementation follows the published algorithm of Greenwald, Nosek & Banaji
(2003) for academic research use. This project is built for a master's thesis; any future
commercial use should re-review licensing/permissions related to that publication.
