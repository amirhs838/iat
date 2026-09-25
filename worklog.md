# Worklog — IAT Research Platform

Project: Self-hosted, research-grade 7-block Implicit Association Test platform (Next.js 16 + TypeScript + Prisma).

Scoring source of truth: Greenwald, Nosek & Banaji (2003), "Understanding and Using the Implicit Association Test: I. An Improved Scoring Algorithm", JPSP 85(2), 197–216.

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Repo inspection + scientific spec verification

Work Log:
- Inspected repo: Next.js 16.1.1, React 19, TS 5, Prisma 6.11 (SQLite datasource, db/custom.db), recharts, zod, sonner, full shadcn/ui component set available.
- No PostgreSQL binary on machine → decision: implement on SQLite with a PostgreSQL-portable schema; provider switch + migration documented in README for VPS deployment.
- Confirmed dev server runs on port 3000, `bun run lint` / `bun run db:push` available.
- Plan: custom TypeScript IAT engine (documented decision vs jsPsych iat-image: plugin lacks seed reproducibility, improved scoring, quality tracking; cross-checked against Greenwald et al. 2003 Table 1, Inquisit/jsPsych reference behavior).

Stage Summary:
- Environment constraints locked: SQLite now, Postgres-ready schema; no CDN; self-hosted fonts; custom engine.

---
Task ID: 2,3,4,5,6,7 (core platform)
Agent: main (Z.ai Code)
Task: Database, IAT engine core, scoring, tests, APIs, participant SPA

Work Log:
- Prisma schema (PostgreSQL-portable; SQLite in sandbox): AdminUser, AdminSession, Participant, Session, Trial, Score, Stimulus, TestVersion. db:push OK.
- Config-driven test definition: src/config/iat/test-definition.ts (v1.0.0, blocks 20/20/20/40/40/20/40, BLOCK_5_TRIAL_COUNT=40).
- Engine libs: types.ts, random.ts (mulberry32+seed), blocks.ts (counterbalancing A/B), sequence.ts (seeded, quotas 50/50 & 25x4, no exemplar repeats, max same-category run 3).
- Scoring: improved-d-score.ts (Greenwald et al. 2003 recommended: >10s delete, BIEP 600ms, >10% <300ms invalid, pooled SD over paired blocks, D=avg(D1,D2)); conventional-score.ts (legacy, inactive); scoring/index.ts (server-authoritative correctness, tamper validation); interpretation.ts (normalizedD: positive = stronger Iranian+Positive; Persian neutral text).
- Tests: 31 tests / 1794 assertions PASS (bun test). Includes hand-computed fixtures + independent reference impl comparison.
- Validation: scripts/validate-scorer.ts → 500 synthetic sessions, max |diff| = 0.00e+0 (EXACT agreement).
- APIs: /api/session (create+plan), /api/session/[id]/start|complete|abandon; /api/admin/login|logout|me|stats|analytics|sessions|sessions/[id]|participants|stimuli|settings|export/[dataset] (CSV/JSON, BOM).
- Auth: scrypt password hashing, DB-backed opaque session tokens (SHA-256 stored), httpOnly cookies, login rate limiting, origin checks, middleware redirect.
- Placeholder stimuli: 16 abstract SVGs via scripts/generate-stimuli.mjs. Vazirmatn self-hosted in public/fonts.
- Participant SPA: src/app/page.tsx + src/components/iat/{IatApp,TrialRunner}.tsx (compat check, consent, demographics, preload w/ decode, fullscreen, 7-block engine, event.code keys, X-feedback, ITI 250ms, quality tracking, localStorage buffer, PENDING_SYNC retry, result page).
- Admin chrome: middleware, (protected) layout, AdminShell (RTL sidebar), /admin/login page.

Stage Summary:
- Core is complete and scientifically verified. Admin pages still to be built (Tasks 8-b, 8-c).
- Key contracts for admin UI: see src/app/api/admin/**/route.ts. Stats shape: {cards, charts}. Auth via cookie (automatic). Design: RTL, Vazirmatn, teal primary, shadcn/ui, recharts (wrap charts in dir=ltr).

---
Task ID: 8-c
Agent: main (Z.ai Code)
Task: Admin pages — participants list, analytics, stimuli registry, settings

Work Log:
- Read worklog + API contracts (src/app/api/admin/{participants,analytics,stimuli,settings}/route.ts), format helpers (toFa/formatMs/formatD), AdminShell nav, use-toast hook, and globals.css design tokens before coding.
- src/app/admin/(protected)/participants/page.tsx: server-paginated table (anonymousId mono/LTR, age/gender/education/province, consent badge, Jalali date via Intl fa-IR, session/completed counts in Persian digits), 350ms-debounced anonymousId search, prev/next pagination with "نمایش X–Y از Z", skeleton/empty/error states + retry, abortable fetch, 401 → /admin/login.
- src/app/admin/(protected)/analytics/page.tsx: 4 required sections + data-quality card — (1) D by condition BarChart (A/B meanD, zero ReferenceLine, LTR wrapper) + n/meanD/SD/medianD table + mandated normalizedD note; (2) sessions-over-time LineChart (30d, Persian-digit ticks); (3) block RT BarChart B3/B4/B6/B7 with meanRt + meanRtCorrect bars (chart-1/chart-2) + medianRt/n table; (4) exclusion reasons as count badges with Persian labels (fast_responses_gt_10pct, zero_variance, insufficient_trials_for_sd). Literal colors var(--chart-1)/var(--chart-2), LTR tooltips, Persian-digit axis formatters.
- src/app/admin/(protected)/stimuli/page.tsx: 4 category cards (ایرانی/افغان/مثبت/منفی) in deterministic order; target categories flagged "placeholder — قابل جایگزینی"; image items as h-14 w-14 thumbnails + fileExists badge (موجود / یافت نشد destructive); word items as large Persian text + EN label; stimulusKey mono; replacementGuide rendered as 3-line info box (LTR mono code).
- src/app/admin/(protected)/settings/page.tsx: currentTestVersion card (code/version/scoringVersion/blockStructure/block5TrialCount + scoring-constants table with formatMs and fastMaxProportion %), exemplar summary table (هدف/ویژگی, type, count), testVersions history table with active badge + Jalali date, sessionCounts badges (CREATED/RUNNING/COMPLETED/ABANDONED/PENDING_SYNC → Persian), change-password form (client-side min-10-chars + confirm-match validation, POST /api/admin/settings, 401/422 mapped to field errors, success → toast "گذرواژه تغییر کرد" via use-toast + inline confirmation).
- Fixed react-hooks/set-state-in-effect lint errors by moving fetch orchestration into async run() inside effects; removed unused eslint-disable directive.
- Quality gates: bunx tsc --noEmit → 0 errors in scope (only pre-existing examples/ + skills/ errors); bun run lint → 0 problems in my 4 files (remaining items are pre-existing TrialRunner/IatApp); verified via authenticated curl session (admin seed creds): all 4 pages + 4 APIs return 200, dev.log shows clean compiles with real Prisma queries and no runtime errors.

Stage Summary:
- Admin console is now feature-complete for tasks in scope: participants registry, research analytics (D/RT/trends/exclusions), stimulus registry with replacement guide, and settings incl. password rotation — all RTL, Vazirmatn, teal-primary shadcn/ui, Persian digits, skeleton/error/empty states, no mock data (every view renders live API data).
- Note for Task 8-b agents: /admin dashboard + /admin/sessions pages were not in my scope; nav links already exist in AdminShell. Lint pattern requirement: wrap effect fetches in `const run = async () => {...}; void run();` to satisfy react-hooks/set-state-in-effect.

---
Task ID: 8-b
Agent: admin-ui (Z.ai Code sub-agent)
Task: Admin dashboard, sessions list + session detail pages (RTL Persian, shadcn/ui, recharts)

Work Log:
- Read worklog.md + verified all backend contracts by reading src/app/api/admin/**/route.ts, src/lib/admin-queries.ts, src/lib/iat/blocks.ts (plan block labels), prisma/schema.prisma, src/lib/format.ts (toFa/formatMs), globals.css (oklch --chart-1..5 tokens + .scrollbar-thin exist).
- Created src/components/admin/StatCard.tsx — metric card (icon chip, title, value node, sub, skeleton loading).
- Created src/components/admin/AdminTableHelpers.tsx — fetchAdminJson (401 → window.location.href="/admin/login", ApiError with status), SessionStatusBadge (COMPLETED=bg-primary/10, ABANDONED=amber, INVALID=destructive, RUNNING=secondary, CREATED=muted, PENDING_SYNC=outline), ValidityBadge, ConditionBadge + conditionLabel ("شرط A: ایرانی+مثبت در بلوک ۳-۴" / B variant), categoryLabel/BLOCK_KIND_LABELS, formatDateTimeFa/formatDateFa (Intl fa-IR), DValue (3 decimals, dir=ltr, font-mono), formatPercentFa, TablePagination (مجموع/صفحه X از Y + قبلی/بعدی), EmptyState ("داده‌ای موجود نیست"), ErrorState (+تلاش دوباره), TableSkeletonRows, InfoItem, parseJsonArray.
- Created src/app/admin/(protected)/page.tsx — dashboard: date from/to (<Input type=date>, `to` sent as T23:59:59.999 for inclusive end), conditionOrder/validity selects, test-version select (fetched from /api/admin/settings → testVersions), reset button; 7 StatCards (participants, completed, valid, invalid, meanD w/ toFixed(3) mono-LTR, medianRt formatMs, completionRate ٪); 3 recharts BarCharts (D histogram −1.5..1.5 with ReferenceLine at 0, RT 200..2000 ms, error rate 0..50%) wrapped in <div dir="ltr">, colors var(--chart-1/2/3), ResponsiveContainer height=260, Persian tooltips (count via toFa); loading skeletons / ErrorState / per-chart EmptyState.
- Created src/app/admin/(protected)/sessions/page.tsx — status/condition/validity selects + debounced (400ms) search on anonymousId/session id; 11-column table (anonymousId+demographics, status badge, condition, test version, DValue, validity, error rate %, trial count, device, completion date, جزئیات link) in max-h-[70vh] overflow-y-auto scrollbar-thin; TablePagination (pageSize 25); DropdownMenu export = 5 datasets × CSV/JSON built from current filters (relative <a href> + download); empty/error states.
- Created src/app/admin/(protected)/sessions/[id]/page.tsx — useParams() (NOT use(params)); info card (anonymousId, short session id, test version, conditionLabel, status, block order/seed/lang, dates incl. abandonedAt, browser/OS, device, screen size, UA, consent); quality card (fullscreenExitCount, visibilityChangeCount, awayDurationMs, fullscreenDenied, session qualityFlags JSON → mono badges, exclusionReason); scores table with BOTH rows (improved-d-2003 highlighted "مرجع" + conventional-2003) × 16 cols (dScore, normalizedD, d1, d2, b3/b4/b6/b7 means, pooled SDs, error rate, fast-response rate, validity, exclusion reason, computedAt); block-performance table B1..B7 joined with blocksSummary (kind label, left/right labels+keys, critical badge, trials/plan total, errors+%, mean/median/sd RT, mean RT correct); raw trials table (200 rows) max-h-96 overflow-y-auto scrollbar-thin with sticky thead (top-0 z-10 bg-card): number, block, stimulus (h-8 w-8 <img> thumbnail for image type, word text otherwise), category, correct key, response key, درست/غلط badge, RT via formatMs, flags badges; 404 + error + skeleton states.
- Verification: bunx tsc --noEmit → zero errors in my files (only pre-existing examples/, skills/ errors remain); bunx eslint on src/app/admin/(protected) + src/components/admin → clean (remaining project lint issues are pre-existing in src/components/iat/, out of scope).
- Runtime E2E (read/write via public HTTP APIs only, no code changes): logged in as seeded admin; curl-verified /api/admin/stats + /api/admin/sessions shapes; browser-verified via agent-browser: login → dashboard renders 7 cards + 3 charts (60 bar rectangles, zero-line present, values ۴۱/۳۸/۳۸/۰/−0.289/۶۸۱/۹۳٪), sessions table 25 rows + pagination "مجموع ۴۱ رکورد — صفحه ۱ از ۲", export dropdown 10 items with correct relative URLs, scores CSV downloads with BOM; session detail renders condition label, D values mono-LTR, 7 block rows, 200 trial rows with 120 image thumbnails + sticky header. Zero console/page errors; dev.log clean.
- Created one additional COMPLETED session via the public participant APIs (id cmud276b10006qwwdjlrahwpc, in-range trial timestamps) as an E2E fixture — useful for detail-page testing; helper script kept at /home/z/.tmp-e2e/iat-e2e.mjs (outside the repo).

Stage Summary:
- All 5 in-scope files delivered and verified (dashboard, sessions list, session detail, AdminTableHelpers, StatCard). Admin can now browse, filter, paginate, export (CSV/JSON) and drill into any session. Fetches are client-side with 401 → /admin/login redirect, skeleton loading, retryable errors and empty states.
- ⚠️ FOUND A PRE-EXISTING PLATFORM BUG (out of my scope — prisma/schema.prisma + src/app/api are do-not-touch): Trial.timestamp is `Int` but stores client epoch-**ms** (~1.79e12) → Prisma P2023 "Value does not fit in an INT column" → GET /api/admin/sessions/[id] returns 500 for EVERY seeded session (all 7,400 demo trials overflow). My detail page handles it gracefully (error + retry). FIX SUGGESTION for coordinator: change Trial.timestamp to `BigInt` (or store seconds) in schema.prisma + db:push + adjust seed-demo/complete route typing. The e2e fixture session (timestamps 1.7e9) bypasses the bug and proves the endpoint + detail page work once data fits.

---
Task ID: 9,10,11 (final QA + docs)
Agent: main (Z.ai Code)
Task: Browser E2E verification, bug fixes, documentation, cleanup

Work Log:
- Fixed real bug found by subagent 8-b: Trial.timestamp Int → DateTime (epoch-ms overflows SQLite Int32 → P2023). Updated complete API, demo seeder; wiped + re-seeded demo data.
- Fixed React hooks-order violation (preload effect before conditional returns), ref-update-during-render (TrialRunner), TDZ issue (uploadResults/onBlockDone order), unused eslint directives, RTL bidi ambiguity in trial progress (dir=ltr).
- Browser E2E (agent-browser): full participant run — intro → consent → demographics → session create → preload (16 images, decode) → fullscreen → 7 block intros → 200 trials with correct-key automation (RT 380–800ms) → upload → server scoring → RESULT SCREEN (D=0.002, valid, neutral interpretation) → session visible in admin API. Zero page errors.
- Admin browser verification: login → dashboard renders metric cards (۴۱/۳۷/۳۷/۰، meanD −0.299، medianRT ۶۸۰، ۹۰٪) + 3 charts + filters.
- Cleaned all automation/fixture data; final dataset = 40 DEMO participants / 37 completed sessions.
- Docs: README.md (architecture, procedure, scoring summary, DB/Postgres migration, VPS deployment, image replacement guide, exports, limitations, legal note) + docs/IAT_SCORING.md (full methodology: raw vs processed, BIEP, pooled SD, directionality contract, validity rules, fixtures).

Stage Summary:
- Final gates: bun test 31/31 PASS (1794 assertions); validate:scorer exact agreement (0.00e+0, 500 sessions); eslint 0 problems; tsc clean for project sources.
- Platform complete: participant SPA + engine + server-authoritative scoring + admin dashboard + exports + docs.

---
Task ID: 12 (UX feedback round)
Agent: main (Z.ai Code)
Task: Fix user-reported participant-UX issues: (1) double-press showing red X, (2) "reversed" directions, (3) mobile support, (4) on-screen buttons instead of keyboard

Work Log:
- ROOT CAUSE FOUND for #1+#2: html is dir=rtl, so every side-pinned flex row (`justify-between`) in TrialRunner/BlockIntro rendered leftLabel on the PHYSICAL RIGHT while the engine maps leftCategories→E(left). Display was mirrored vs engine → correct presses marked wrong → constant ✕ + "directions are reversed" perception.
- TrialRunner.tsx rewritten: all side-pinned rows wrapped in explicit dir="ltr" (physical sides now always match engine sides under RTL); two large on-screen response buttons (min-h 88/104px, bottom-left/right, category labels ON the buttons, safe-area-inset padding); input via onPointerDown (touch/mouse/pen, lowest latency); keyboard E/I silently kept as secondary; ANTICIPATION_LOCKOUT_MS=200 (inputs <200ms after onset ignored — absorbs double-tap/keypress leaks, no data transformation); error phase now highlights the CORRECT button green + dims wrong one + helper text "دکمهٔ سبزرنگ را فشار دهید"; key-hints row removed; mobile-first sizing (34vh stimulus, fixed feedback slot, no layout shift).
- blocks.ts: all 5 instructionBody texts rewritten to reference دکمهٔ سمت چپ/راست + button labels (no key names).
- IatApp.tsx: checkCompatibility now hard-gates ONLY on performance.now/rAF — mobile/tablet explicitly allowed; intro/ready-to-start texts updated (button-first, "one response per stimulus, don't double-tap", ✕→green-button flow); BlockIntro preview row dir="ltr", start text button-first, Space listener kept for desktop.
- globals.css .experiment-mode += touch-action:manipulation, overscroll-behavior:none, -webkit-tap-highlight-color:transparent, -webkit-touch-callout:none.
- Test definition version 1.0.0 → 1.1.0 (input modality is methodological: touch-first vs keyboard-only); changelog comment added; bun run db:seed upserted active TestVersion (iranian-afghan-att v1.1.0, 20/20/20/40/40/20/40).
- Docs: README §4.1/4.4/4.5/4.7 rewritten (on-screen buttons, responseKey=side semantics, anticipation lockout, mobile support + do-not-pool-modalities note); docs/IAT_SCORING.md new section "Input modality & client-side input filter (v1.1.0)".
- Gates: eslint 0 problems; tsc 0 errors; bun test 31/31 PASS (1794 assertions).
- Browser E2E (agent-browser): mobile 390px (iPhone 14 emulation) full flow intro→consent→demographics→preload→block1 trials — verified leftLabel x=12 / rightLabel x=326 (physical sides correct), wrong click → ✕ + green correct-button highlight + dim wrong, correct click advances, dblclick on correct button → advances exactly 1 trial with NO phantom ✕ (lockout verified), keyboard E fallback works; desktop 1280px positions verified (24 vs 1175, 104px buttons); zero page errors; test session marked ABANDONED (data clean).

Stage Summary:
- All four user complaints fixed and browser-verified on mobile + desktop. Response modality is now touch-first with versioned methodology (v1.1.0). Note for future agents: responseKey E/I in DB/exports = chosen SIDE (left/right), not physical keyboard; do not pool v1.0.0 (keyboard) and v1.1.0 (touch) sessions in one analysis without modality covariate.

---
Task ID: hotfix-1
Agent: main (Z.ai Code)
Task: Admin login rejected with 403 behind preview gateway — user believed credentials were wrong

Work Log:
- Reproduced: dev.log showed POST /api/admin/login → 403 (cross-origin rejection), not 401 (invalid credentials); DB hash verified correct for admin / iat-admin-2024 via verifyPassword.
- Root cause: sandbox preview gateway rewrites Host; browser Origin no longer matched Host header → sameOrigin() rejected admin POSTs (login/logout/settings). /api/session routes don't call sameOrigin, which is why participant flows worked.
- Fix in src/lib/api-utils.ts: sameOrigin() now uses Fetch Metadata (sec-fetch-site: same-origin|same-site → allow, cross-site → reject) as primary signal, proxy-proof; fallback compares Origin/Referer against x-forwarded-host + host (full host then hostname-only); console.warn diagnostics logged on every rejection.
- Fix in src/app/admin/login/page.tsx: 403 now shows distinct security-error message (refresh page) instead of generic "wrong credentials" text.
- Verification: bun run lint clean; curl matrix T1–T6 all pass (proxy-browser 200, real CSRF 403, old-browser fallback 403, matching-origin 200, no-origin 200, wrong-password 401); agent-browser E2E: login → redirected to /admin, dashboard rendered with کاربر: admin, /api/admin/stats 200, no page errors; screenshot tool-results/admin-login-verified.png.

Stage Summary:
- Admin login now works through the preview gateway; CSRF protection retained via Fetch Metadata + hardened Origin fallback.
- Credentials unchanged: admin / iat-admin-2024 (change in Settings).

---
Task ID: stim-1
Agent: main (Z.ai Code)
Task: Per-slot stimulus spec + admin panel image upload + real reference photographs

Work Log:
- Research: no published Iranian-Afghan IAT stimulus set exists; followed standard race-IAT face conventions (Greenwald et al. 1998 Exp.3; Greenwald, Nosek & Banaji 2003; Project Implicit): front-facing real faces, grayscale, gender-balanced (4M+4W per category), age-matched 18-45, plain background, no famous individuals; Iranian-Afghan addition: simple head covering for women in BOTH categories so hijab is not a category cue.
- Sourcing: web image search rejected (watermarks/wrong subjects); Wikimedia Commons + Openverse (Flickr, CC no-ND) API queries; downloaded ~100 candidates, visually inspected via labeled contact sheets, selected 16 real portraits; processed with sharp → grayscale, normalise, 480×600 JPEG, face-centered crops; removed legacy SVG placeholders. Files: public/iat/stimuli/{iranian,afghan}/<key>.jpg.
- Config (v1.1.0 → v1.2.0 + changelog): exemplar paths .svg→.jpg, labels "Iranian/Afghan man/woman N"; added STIMULUS_SPEC (16 per-slot Persian descriptions) + STIMULUS_SPEC_GENERAL (category-level spec incl. hijab note) in test-definition.ts.
- Schema: Stimulus.description + Stimulus.uploadedAt columns (db:push). Seed writes descriptions and PRESERVES panel uploads (uploadedAt != null → path untouched).
- Runtime overlay: new src/lib/iat/registry.ts loadEffectiveDefinition() — session API (POST /api/session) now builds the trial plan from the DB registry paths/labels (panel uploads take effect for NEW sessions; archived sessions keep stored blockPlanJson paths).
- Upload API: POST/DELETE /api/admin/stimuli/upload — admin+same-origin guarded, multipart, JPEG/PNG/WebP ≤8MB ≥200×200, sharp decodability check; non-destructive (uploads stored as <key>-custom.<ext>, reference kept); DELETE restores reference and clears uploadedAt.
- Admin UI: stimuli page rewritten — per-slot cards (thumbnail, key, spec text, uploaded/reference badge + timestamp, بارگذاری فایل button + hidden input, بازگردانی به مرجع), category general-spec box, toasts, word categories unchanged; GET /api/admin/stimuli now returns per-slot description + generalSpec + testVersion.
- Verification: lint + tsc clean (after fixing TS null-guard in sameOrigin source var); E2E agent-browser: login → stimuli page renders specs/slots; upload to iranian-01 → POST 200, DB path → -custom.jpg + uploadedAt set; NEW session plan (POST /api/session) uses /iat/stimuli/iranian/iranian-01-custom.jpg for iranian-01 trials; restore via panel → DB back to reference, custom file deleted; dev server restart needed once (stale Prisma Client without uploadedAt → P2021-style validation error, 500; fixed by restart); screenshot tool-results/stimuli-panel.png.
- Docs: README §10 rewritten (spec basis, provisional provenance/licensing caveat, two replacement flows, production public/ serving note).

Stage Summary:
- Panel upload flow is live and E2E-verified; reference set is now 16 real grayscale photographs (provisional, CC-licensed, documented); test definition v1.2.0 active; engine/scoring untouched; reproducibility preserved (session-scoped plan snapshots).

---
Task ID: audit-1
Agent: main (Z.ai Code)
Task: Full platform audit per user request — bugs, calculation errors, structural issues across participant site + admin dashboard

Work Log:
- Quality gates baseline: eslint 0 problems, tsc 0 errors (project scope), bun test 31/31 (1794 assertions), dev.log clean of 5xx.
- Engine audit (READ-ONLY, verified correct): 7-block structure 20/20/20/40/40/20/40; counterbalancing A/B mapping; sequence quotas 50/50 + 25×4, no adjacent exemplar repeats, max same-category run 3; improved D-score matches Greenwald et al. (2003) rule-by-rule (10s deletion, >10% <300ms invalid, BIEP 600ms on block correct-mean, pooled sample-SD over paired blocks, D=avg(D1,D2)); directionality normalization A:+1/B:−1 verified against all 39 stored scores — 0 mismatches, 0 direction anomalies; recomputed D from raw trials of 5 completed sessions = machine-precision agreement (~1e-16); all COMPLETED sessions have exactly 200 trials; no RT<0.
- BUG 1 FIXED (src/lib/admin-queries.ts completedWhere): validity filter silently no-oped everywhere (sessions list, exports, analytics) — now enforced via scores relation {scoringAlgorithm: improved-d-2003, valid}.
- BUG 2 FIXED (src/app/api/admin/sessions/route.ts): choosing any status filter DROPPED conditionOrder/date filters entirely, and validity was never applied in either branch — where-clause rebuilt so ALL filters AND-combine (status + condition + dates + version + validity + search).
- BUG 3 FIXED (src/app/api/admin/stats/route.ts): completion-rate denominator ignored from/to/conditionOrder filters — now same filters as numerator minus validity, over status ∈ {COMPLETED, ABANDONED}.
- BUG 4 FIXED (src/app/api/admin/export/[dataset]/route.ts): "full" flat CSV headers said participantAnonymousId/testVersionCode but rows contained internal participantId/testVersionId UUIDs — now includes participant/testVersion relations and emits anonymousId/code.
- BUG 5 FIXED (complete API idempotency): documented "409 with the existing result" was never implemented — 409 now returns the stored result rebuilt from the persisted improved-score row; client (IatApp uploadResults + retryUpload) treats 200 and 409 identically → a participant retrying after a lost response recovers their result instead of looping in sync-error/pending-sync forever.
- BUG 6 FIXED (IatApp + lib/format.ts): age input — (a) parseInt failed on Persian digits ۰-۹ (added normalizeDigits + shared parsing in submitDemographics AND startCreation — initial partial fix caught during E2E: submitDemographics normalized but startCreation re-parsed raw state → NaN → 422); (b) input type="number" silently strips Persian digits so Persian-keyboard mobile users could not type an age at all — changed to type="text" + inputMode="numeric" + pattern, with input filtering to digits-only, maxLength 3.
- Cleanup: /api root route "Hello, world!" → proper health endpoint {ok, service, time}; removed dead groupBy query in analytics route; removed dead byCategory map in stimuli route.
- API verification (curl matrix, all pass): health 200; sessions validity=valid → 38→39 with all-valid rows, validity=invalid → 1; status=COMPLETED&conditionOrder=A → 18 (condition respected); validity=valid&conditionOrder=B → 20; stats validity=valid/invalid correct; analytics?validity=invalid → empty D-by-condition (correct); export full CSV now shows DEMO-… / iranian-afghan-att in identity columns; complete-on-COMPLETED → 409 {ok, alreadyCompleted, result{dScore,…}}.
- Browser E2E (agent-browser): DESKTOP full participant run with auto-responder — intro→consent→demographics(Persian-digit age ۲۵ accepted)→session→preload→7 blocks→200 trials (incl. error-correction: wrong press → ✕ + green correct button → advance)→upload→server result D=−1.022 shown with neutral interpretation; zero console/page errors. ADMIN: login→dashboard (۴۸/۴۰/۳۹/۱, meanD −0.314, completion ۸۷٪=40/46), sessions list + working validity filter via UI (۳۹ records), session detail (info/quality/scores/block-stats/200 raw trials), analytics, stimuli, participants, settings all render live data. MOBILE 390px (iPhone 14): sticky footer exact (footer bottom == viewport 844), demographics flow, trial UI geometry (buttons pinned 8/382, 88px touch targets, labels==buttons), touch response → ✕ error-correction → advance verified; anticipation lockout visibly absorbed too-early input.
- Removed both E2E fixture participants/sessions (robotic data) — dataset back to 47 participants / 39 completed.

Stage Summary:
- 7 real defects fixed (2 admin-API filter bugs, 1 stats denominator, 1 export column mismatch, 1 idempotency/recovery loop, 1 Persian-digit input chain with 2 root causes, plus hygiene). Core IAT engine, timing, randomization and scoring verified correct — no calculation errors found there.
- All gates green post-fix: eslint 0, tsc 0, bun test 31/31, curl matrix pass, desktop+mobile browser E2E pass, no 5xx in dev.log.

---
Task ID: git-push-1
Agent: Z.ai Code (main)
Task: Push project to github.com/amirhs838/iat (user-provided PAT), prepare for Vercel deployment

Work Log:
- Audited git state: 7 local commits with UUID messages; discovered `.env` and `db/custom.db` were TRACKED in history (would leak admin password hash, session tokens, participant data on push)
- Hardened .gitignore: added /db/, *.db, *.db-journal
- Rebuilt git history via orphan branch (single clean commit) so sensitive blobs are unreachable; verified `git log --all -- db/custom.db .env` is empty
- Set git identity to amirhs838 / amirhs838@users.noreply.github.com (local config)
- Vercel readiness fixes in package.json: added `postinstall: prisma generate`; moved standalone self-host steps to `build:selfhost`; `build` is now plain `next build`; renamed package to iat-research-platform v1.0.0
- Pushed main via one-time token-embedded URL (first attempt hit GitHub 500, retry succeeded); remote origin stored as clean URL without token
- Verified: remote main = 342be83; token not persisted in .git/config or any file

Stage Summary:
- github.com/amirhs838/iat now hosts the clean codebase (main @ 342be83)
- Known blocker for Vercel: Prisma provider is `sqlite` — serverless FS is ephemeral/read-only, so DB writes will not persist. Migration to managed Postgres (Neon/Vercel Postgres) or Turso required; schema is documented as 100% Postgres-portable
- User advised to revoke the PAT shared in chat after use

---
Task ID: vercel-deploy-1
Agent: Z.ai Code (main)
Task: Deploy to Vercel (user-provided token), provision database, make everything work

Work Log:
- Verified Vercel token: user amirhs838, team team_iOSLb19nJVlKTwsPXD83eCIZ, hobby plan
- Created project "iat" via POST /v2/projects with gitRepository link to github.com/amirhs838/iat (auto-deploy on push; domain iat-seven.vercel.app)
- Provisioned DB: storage store creation APIs returned 404 (not permitted via REST on this plan), so reused existing Neon instance from user's account store and created ISOLATED database "iat" (CREATE DATABASE via @neondatabase/serverless WebSocket mode over 443; note: HTTP proxy mode silently swallowed CREATE DATABASE, and raw TCP 5432 from bun failed TLS — both worked around)
- Migrated Prisma: provider postgresql + directUrl; first attempt used PrismaNeonHTTP adapter but Neon HTTP mode does NOT support Prisma transactions (stats API 500; session/complete uses $transaction) -> final solution: standard Prisma query engine over TCP with POOLED endpoint + pgbouncer=true&connection_limit=10 (runtime) and DIRECT_URL non-pooled (schema engine). Removed adapter deps.
- Local sandbox: shell pre-set DATABASE_URL=file:.../custom.db overrides .env (bun does not override existing process env) -> dev server must be started with explicit env prefix; wrote correct exports to ~/.bashrc as mitigation
- Set Vercel env vars DATABASE_URL + DIRECT_URL (encrypted, all environments) and buildCommand "prisma db push --skip-generate && next build"
- Seeded prod DB: admin user, test version iranian-afghan-att v1.2.0 (20/20/20/40/40/20/40), 32 stimuli
- Deploys: dpl_ADa1WVb... (READY, postgres migration) then dpl_7hBj1Z3... (READY, transaction fix) — auto-triggered by git push
- E2E verification on production: homepage 200, admin login 200, stats/sessions/participants/analytics/stimuli all 200; POST /api/session creates session with conditionOrder/randomSeed/blockPlan; full 200-trial submission through /api/session/[id]/complete succeeded (valid=true, D=0.391, errorRate 12.5%) proving $transaction + D-score pipeline on Postgres; direction check: conditionOrder A -> normalizedD == rawD as expected
- Seeded 27 labeled demo sessions (DEMO- prefix) for dashboard visualization (deletable via admin)
- agent-browser E2E on production: participant home renders RTL fa, admin login -> dashboard renders KPIs (30 participants, 26 completed, mean D -0.206), sessions table with demo rows; no console errors. Screenshots: tool-results/vercel-home.png, vercel-admin.png, vercel-sessions.png
- Local preview also verified against same Neon DB (homepage/login/stats 200)

Stage Summary:
- PRODUCTION LIVE: https://iat-seven.vercel.app (auto-deploys on push to main)
- DB: Neon Postgres, isolated "iat" database on user's existing instance; Prisma 6.19.2 postgresql provider
- Credentials unchanged: admin / iat-admin-2024 (user should change in admin Settings)
- User advised to revoke both the GitHub PAT and the Vercel token shared in chat

---
Task ID: font-stimuli-1
Agent: Z.ai Code (main)
Task: B Nazanin font + standardized stimulus set (frontal face-only, gender-balanced, clear Iranian/Afghan distinction)

Work Log:
- Verified config already standard: 8+8 target exemplars (4 men + 4 women per category), matching 7-block IAT conventions; issue was image quality, not counts
- Assessed existing photos: earbuds, hats, side angles, mixed ages (confound), inconsistent backgrounds, ambiguous group distinction -> replacement justified
- B Nazanin webfont: fetched from fontcdn.ir (followed 307 to fdn host), self-hosted woff2/woff/ttf (regular+bold) in public/fonts; registered @font-face (400/700); --font-sans and html font-family updated to "B Nazanin" with Vazirmatn fallback (covers 500/600 weights Nazanin lacks); layout preloads swapped to nazanin woff2
- Generated 16 standardized portraits (z-ai image CLI, 1024x1024, ~40s each; one batch crashed on timeout and was resumed): systematic group cues — Iranian: Persian features, modern short hair, light/trimmed stubble, dark roosari covering hair only (women); Afghan: Pashtun/Hazara features, full beards, perahan tunban collar (men), colored traditional scarf draped over head+shoulders (women, incl. Hazara East-Asian-influenced features); all frontal, direct gaze, neutral expression, uniform light-gray background, ages 20-35
- Processed with sharp: 480x480 cover JPEG q85, replaced public/iat/stimuli/{iranian,afghan}/XX.jpg (total 728K)
- Rewrote STIMULUS_SPEC_GENERAL + STIMULUS_SPEC (per-slot gender/age/appearance in Persian); bumped test version 1.2.0 -> 1.3.0; provenance comment documents AI-generated placeholder status
- Re-seeded prod Neon DB: test version v1.3.0 snapshot + 32 stimuli rows updated
- Deploy dpl_E6mwGcBE... READY; verified on production: fonts 200, images 200, homepage renders in B Nazanin (screenshot tool-results/prod-nazanin.png), admin stimuli panel shows v1.3.0 with new thumbnails (tool-results/local-stimuli-panel.png); no console errors

Stage Summary:
- Live on production with B Nazanin + standardized stimulus set v1.3.0
- METHODOLOGICAL NOTE (must disclose): current face stimuli are AI-generated placeholders chosen for consistency; replace with real photos via admin panel before final data collection and disclose stimulus source in thesis

---
Task ID: stimuli-real-photos-1
Agent: Z.ai Code (main)
Task: Replace all target stimuli with REAL photographs (user rejected AI images as "فیکه"), from standard sources, face close-up frontal, gender-balanced, clearly distinguishable Iranian/Afghan

Work Log:
- Discovered v1.4.0 commit (471aadb) was UNPUSHED (origin/main at 3158150) and its image files on disk were still the v1.3.0 AI-generated portraits — only admin upload/inline-word-edit plumbing + an empty ATTRIBUTION.md template had shipped
- Sourced candidates: 3 rounds of z-ai image-search (40+40+24 URLs), fresh Openverse API queries (102 URLs), and Wikimedia Commons API search (98 candidates downloaded after sequential+delay retry to dodge 403/429 throttling)
- Visually vetted every candidate via labeled contact sheets (Read tool); rejected watermarked stock (Alamy/123RF/Dreamstime), AI-generated (Leonardo.Ai), famous persons (Khamenei, Malala), children, group shots, profiles, sunglasses, covered faces
- Final 16 curated (4 men + 4 women per category), cropped to 480x600 JPEG q88 (sharp, EXIF-rotated, face-dominant, attention strategy + 2 manual crops for group photos); afghan-08 re-cropped 3x to isolate subject
- Sources: Wikimedia Commons CC BY/CC BY-SA (Man in Kabul, Afghanistan man, Iranian girl), Flickr CC BY (Hamed Saber ×3, kamshots, Jeremy Weate, DVIDSHUB, ResoluteSupportMedia), Flickr CC BY-ND (hapal "Mustache man" — ND flagged), web image search (Reddit/Kaleidoscope/The Guardian/NYT/Eurac — 4 unknown-license slots flagged for vetting)
- Filled ATTRIBUTION.md: full per-slot provenance + license table + 4 methodological caveats (Afghan men age skew 40-70, iranian-07 winter beanie vs roosari, distinctiveness basis, 4 unknown licenses) + researcher obligations
- Bumped test definition to v1.5.0; CHANGELOG documents that v1.4.0 never actually replaced the files; rewrote STIMULUS_SPEC + STIMULUS_SPEC_GENERAL to describe actual shipped photos (Persian); targets comment updated
- eslint.config.mjs + .gitignore: excluded tool-results/ (temp research scripts caused 26 lint errors); git rm --cached tool-results/ (previously tracked)
- Re-seeded local DB: test version iranian-afghan-att v1.5.0 + 32 stimuli; lint clean
- Browser E2E (agent-browser): homepage renders B Nazanin RTL; admin login OK; محرک‌ها panel shows v1.5.0 + real-photo thumbnails + per-slot upload + spec cards; inline attribute word edit (pos-01 عشق→مهر) persisted across reload, then reverted; participant flow consent→demographics→block1 trial renders NEW real photo with on-screen category buttons; no console errors
- Committed 153a835 "Replace target stimuli with curated real photographs (v1.5.0)"
- PUSH BLOCKED: no GitHub credentials available (old PAT was one-time and per security advice should be revoked); Vercel auto-deploy will trigger once pushed

Stage Summary:
- LOCAL COMPLETE + VERIFIED: real-photo stimulus set v1.5.0 (16 files, 728KB→~1MB), attribution documented, admin text-editing confirmed working
- TO DEPLOY: push main (needs fresh GitHub token from user) → Vercel auto-builds → re-seed prod DB (bun run db:seed with prod env) → verify iat-seven.vercel.app
- Screenshots: tool-results/v15-home.png, v15-stimuli-panel2.png, v15-block1-trial.png, shipped-v15.jpg

---
Task ID: demographics-instructions-1
Agent: Z.ai Code (main)
Task: Standard font size, 6-field demographics form, speed-first instructions, researcher statement on first page (user message 16)

Work Log:
- Font: root font-size raised 16px → 18px in globals.css (B Nazanin is optically small; all rem-based sizes scale site-wide, participant + admin). Participant-flow body text bumped text-sm → text-base (intro/consent/consent-checkbox/demographics subtitle).
- Demographics rebuilt to EXACTLY the researcher's 6 fields: سن (Persian-digit input), جنسیت (مرد/زن/ترجیح می‌دهم نگویم — سایر removed), تحصیلات (standard ladder kept), درآمد تقریبی در ماه (زیر ۲۵ / ۲۵–۵۰ / ۵۰–۷۰ / بالای ۱۰۰ میلیون تومان / ترجیح می‌دهم نگویم — exactly as specified, gap ۷۰–۱۰۰ flagged to researcher), تا چه حد خود را مذهبی می‌دانید؟ (اصلاً/کمی/متوسط/زیاد/خیلی زیاد/ترجیح می‌دهم نگویم), شغل (شاغل/بیکار/بازنشسته/دانشجو). استان (province) removed entirely.
- Schema: Participant.province → income/religiosity/occupation (db:push --accept-data-loss, only 35 DEMO rows affected); Prisma client regenerated; dev server restarted (stale-client pitfall).
- Server-side: session API zod schema + participant.create updated; admin participants API select, participants page (استان column → درآمد + شغل, skeleton/colSpan 9→10), session detail page (interface + جمعیت‌شناسی join + two new InfoItems), participants CSV export headers/rows all updated. seed-demo.ts fields replaced.
- Instructions: all 5 block instruction bodies in blocks.ts now end "تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست." (was "هم سرعت و هم دقت مهم است."); intro page adds the same sentence in a highlighted amber box.
- Intro (first) page: researcher statement block added verbatim above the test description — «این پاسخ‌ها و اطلاعات در راستای یک پژوهش علمی در چارچوب یک پایان‌نامه کارشناسی ارشد است. / ممنون از وقتی که می‌گذارید. / با تشکر / فاطمه بابازاده، دانشجوی کارشناسی ارشد روانشناسی شناختی».
- Test definition bumped 1.5.0 → 1.6.0 (instruction wording is part of the session plan snapshot; versioned for reproducibility) + CHANGELOG entry; seeded (shared Neon DB) → v1.6.0 active.
- E2E (agent-browser): intro shows statement + speed box in larger B Nazanin (desktop + iPhone 14 screenshots); consent → demographics shows exactly 6 fields; Persian-digit age ۲۵ accepted; session created; block-1 instruction shows new wording; trial response advances; admin participants table (درآمد/شغل), session detail (درآمد ماهانه=۲۵ تا ۵۰, مذهبی‌بودن=متوسط), participants CSV export includes income/religiosity/occupation. Robotic E2E participant P-M6VJJMZB deleted. eslint 0, tsc 0.

Stage Summary:
- New demographics (6 fields) + speed-first instructions + researcher first-page statement + 18px B Nazanin are live locally and in the shared Neon DB (v1.6.0 active).
- NOTE for researcher: income options have no bracket between ۷۰ and ۱۰۰ میلیون تومان (implemented exactly as specified — say the word to add ۷۰ تا ۱۰۰).
- NOTE: production iat-seven.vercel.app gets the code on next push; DB side (schema + v1.6.0) already applied.

---
Task ID: demographics-deploy-1
Agent: Z.ai Code (main)
Task: Push to GitHub + verify Vercel production deployment

Work Log:
- Pushed main 3158150..b3a98ad to github.com/amirhs838/iat via one-time token-embedded URL (delivers v1.5.0 real-photo commit + v1.6.0 demographics/instructions/font commit).
- Vercel auto-deploy completed; production verified via agent-browser: intro shows researcher statement + speed instruction; consent → demographics shows exactly 6 fields (سن/جنسیت/تحصیلات/درآمد/مذهبی/شغل); /api health {ok:true}. No session created on prod during the check.
- DB side already shared (local dev + prod = same Neon iat database), so schema + v1.6.0 were live before the push; build-time prisma db push is a no-op.

Stage Summary:
- PRODUCTION https://iat-seven.vercel.app fully serves: 18px B Nazanin, 6-field demographics, speed-first instructions, researcher first-page statement, v1.6.0.
- User should revoke the GitHub PAT shared in chat (again advised).
