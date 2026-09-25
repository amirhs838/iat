import type { TestDefinition } from "@/lib/iat/types";

// =============================================================================
// IAT TEST DEFINITION — VERSION 1.2.0 (single source of truth)
// =============================================================================
// CHANGELOG:
//   v1.2.0 — Target stimuli replaced: real reference photographs (CC-licensed
//            photos of Iranian and Afghan people from Wikimedia Commons and
//            Flickr via Openverse; grayscale, 480×600, face-centered crop)
//            replace the abstract SVG placeholders. Per-slot stimulus spec
//            (STIMULUS_SPEC) added — the admin Stimuli panel shows what each
//            slot must contain and lets the researcher upload the final
//            vetted image per slot (uploads take effect for NEW sessions
//            without code changes). Engine, timing, block structure and
//            scoring unchanged.
//   v1.1.0 — Input modality changed: primary response input is now the two
//            on-screen buttons (pointerdown; touch/mouse/pen) instead of the
//            physical keyboard. Keyboard E/I remains silently supported on
//            desktop. Mobile/tablet participation is now allowed (was
//            desktop-only in v1.0.0). Client-side ANTICIPATION_LOCKOUT_MS =
//            200 added (inputs < 200 ms after stimulus onset are ignored;
//            no data transformation). Scoring algorithm unchanged.
//   v1.0.0 — Initial definition (keyboard-only, desktop-only).
// =============================================================================
// HOW TO REPLACE STIMULI LATER (no engine changes required):
//
// 1) TARGET IMAGES (Iranian / Afghan):
//    Replace the image files under:
//        public/iat/stimuli/iranian/   (currently placeholder-*.svg)
//        public/iat/stimuli/afghan/
//    Keeping the SAME file names requires no changes at all.
//    If you add/remove files, update the `exemplars` arrays below.
//    Any number of exemplars per category is supported (>= 2 recommended).
//
// 2) ATTRIBUTE WORDS (Positive / Negative):
//    Edit the `exemplars[].path` values below (literal word text).
//
// 3) CATEGORY NAMES / LABELS:
//    Edit `label` fields — engine, UI and scoring all read from here.
//
// 4) After changing this file, bump `version`, re-run `bun run db:seed`
//    and create a new TestVersion snapshot (see README → Versioning).
//
// Provenance of attribute word lists:
//    The English source words follow the standard IAT attribute exemplars
//    (Greenwald, McGhee & Schwartz, 1998; Greenwald, Nosek & Banaji, 2003):
//    positive: glorious, laughter, happy, love, peace, wonderful, pleasure, beautiful
//    negative: terrible, horrible, evil, hatred, awful, failure, agony, brutal
//    Persian translations are used as the default display words for this study.
//    Target IMAGES: standardized frontal head-shot portraits (4 men + 4 women
//    per category, 20–35 years, neutral expression, uniform light-gray
//    background). The current placeholder set is AI-generated for visual
//    consistency; for final data collection replace them with real photos via
//    admin → محرک‌ها (see STIMULUS_SPEC below for per-slot requirements) and
//    disclose the stimulus source in the thesis.
// =============================================================================

export const IAT_TEST_DEFINITION: TestDefinition = {
  name: "IAT Iranian–Afghan × Positive–Negative",
  version: "1.3.0",
  code: "iranian-afghan-att",
  scoringVersion: "improved-d-2003/v1",
  language: "fa",
  responseKeys: { left: "E", right: "I" },
  timing: {
    // Standard IAT inter-trial interval (blank screen between trials)
    interTrialIntervalMs: 250,
  },
  scoring: {
    // Greenwald, Nosek & Banaji (2003) recommended algorithm constants.
    // Do not change without bumping scoringVersion and re-documenting.
    errorPenaltyMs: 600,
    slowCutoffMs: 10000,
    fastThresholdMs: 300,
    fastMaxProportion: 0.1,
  },

  // -------------------------------------------------------------------------
  // TARGET CATEGORIES — real reference photographs (grayscale 480×600).
  // These are CC-licensed web photographs that satisfy the per-slot spec;
  // the researcher MUST vet/replace them via the admin panel before the
  // final data collection (see STIMULUS_SPEC and admin → محرک‌ها).
  // -------------------------------------------------------------------------
  targets: [
    {
      key: "iranian",
      label: "ایرانی",
      stimulusType: "image",
      exemplars: [
        { id: "iranian-01", path: "/iat/stimuli/iranian/iranian-01.jpg", label: "Iranian man 1" },
        { id: "iranian-02", path: "/iat/stimuli/iranian/iranian-02.jpg", label: "Iranian man 2" },
        { id: "iranian-03", path: "/iat/stimuli/iranian/iranian-03.jpg", label: "Iranian man 3" },
        { id: "iranian-04", path: "/iat/stimuli/iranian/iranian-04.jpg", label: "Iranian man 4" },
        { id: "iranian-05", path: "/iat/stimuli/iranian/iranian-05.jpg", label: "Iranian woman 1" },
        { id: "iranian-06", path: "/iat/stimuli/iranian/iranian-06.jpg", label: "Iranian woman 2" },
        { id: "iranian-07", path: "/iat/stimuli/iranian/iranian-07.jpg", label: "Iranian woman 3" },
        { id: "iranian-08", path: "/iat/stimuli/iranian/iranian-08.jpg", label: "Iranian woman 4" },
      ],
    },
    {
      key: "afghan",
      label: "افغان",
      stimulusType: "image",
      exemplars: [
        { id: "afghan-01", path: "/iat/stimuli/afghan/afghan-01.jpg", label: "Afghan man 1" },
        { id: "afghan-02", path: "/iat/stimuli/afghan/afghan-02.jpg", label: "Afghan man 2" },
        { id: "afghan-03", path: "/iat/stimuli/afghan/afghan-03.jpg", label: "Afghan man 3" },
        { id: "afghan-04", path: "/iat/stimuli/afghan/afghan-04.jpg", label: "Afghan man 4" },
        { id: "afghan-05", path: "/iat/stimuli/afghan/afghan-05.jpg", label: "Afghan woman 1" },
        { id: "afghan-06", path: "/iat/stimuli/afghan/afghan-06.jpg", label: "Afghan woman 2" },
        { id: "afghan-07", path: "/iat/stimuli/afghan/afghan-07.jpg", label: "Afghan woman 3" },
        { id: "afghan-08", path: "/iat/stimuli/afghan/afghan-08.jpg", label: "Afghan woman 4" },
      ],
    },
  ],

  // -------------------------------------------------------------------------
  // ATTRIBUTE CATEGORIES (standard IAT word exemplars, Persian)
  // -------------------------------------------------------------------------
  attributes: [
    {
      key: "positive",
      label: "مثبت",
      stimulusType: "word",
      exemplars: [
        { id: "pos-01", path: "عشق", label: "love" },
        { id: "pos-02", path: "شادی", label: "joy/laughter" },
        { id: "pos-03", path: "صلح", label: "peace" },
        { id: "pos-04", path: "زیبا", label: "beautiful" },
        { id: "pos-05", path: "لذت", label: "pleasure" },
        { id: "pos-06", path: "خوشحال", label: "happy" },
        { id: "pos-07", path: "پرشکوه", label: "glorious" },
        { id: "pos-08", path: "فوق‌العاده", label: "wonderful" },
      ],
    },
    {
      key: "negative",
      label: "منفی",
      stimulusType: "word",
      exemplars: [
        { id: "neg-01", path: "نفرت", label: "hatred" },
        { id: "neg-02", path: "شکست", label: "failure" },
        { id: "neg-03", path: "عذاب", label: "agony" },
        { id: "neg-04", path: "فاجعه", label: "disaster" },
        { id: "neg-05", path: "وحشتناک", label: "terrible" },
        { id: "neg-06", path: "هولناک", label: "horrible" },
        { id: "neg-07", path: "شرارت", label: "evil" },
        { id: "neg-08", path: "بی‌رحم", label: "brutal" },
      ],
    },
  ],

  // -------------------------------------------------------------------------
  // COUNTERBALANCING CONDITIONS
  // -------------------------------------------------------------------------
  conditions: {
    A: {
      description: "Iranian+Positive paired in blocks 3-4 (first pairing)",
      firstPairing: { target: "iranian", attribute: "positive" },
    },
    B: {
      description: "Iranian+Negative paired in blocks 3-4 (first pairing)",
      firstPairing: { target: "iranian", attribute: "negative" },
    },
  },

  // -------------------------------------------------------------------------
  // 7-BLOCK STRUCTURE — LOCKED (BLOCK_5_TRIAL_COUNT = 40)
  // Source: Greenwald, Nosek & Banaji (2003), Table 1; Nosek et al. (2007);
  // standard Inquisit IAT layout. Critical blocks for D: 3, 4, 6, 7.
  // -------------------------------------------------------------------------
  blocks: [
    { number: 1, kind: "target-discrimination", trialCount: 20, isCritical: false },
    { number: 2, kind: "attribute-discrimination", trialCount: 20, isCritical: false },
    { number: 3, kind: "combined", trialCount: 20, isCritical: true },
    { number: 4, kind: "combined", trialCount: 40, isCritical: true },
    { number: 5, kind: "target-discrimination-reversed", trialCount: 40, isCritical: false },
    { number: 6, kind: "combined-reversed", trialCount: 20, isCritical: true },
    { number: 7, kind: "combined-reversed", trialCount: 40, isCritical: true },
  ],
};

export const STIMULUS_SPEC_GENERAL: Record<string, string> = {
  iranian:
    "چهره‌ی تمام‌رخ و بزرگ‌نمایی‌شده‌ی یک فرد بزرگسال ایرانی (۲۰–۳۵ سال)، حالت خنثی، نگاه مستقیم به دوربین، پس‌زمینه‌ی یکدست خاکستری روشن، نور یکنواخت؛ فقط صورت و لبه‌ی شانه‌ها در کادر است (بدون بدن، بدون عینک، بدون تزئینات). ترکیب دسته: ۴ مرد + ۴ زن. نشانه‌های گروهی: چهره‌ی فارسی/ایرانی؛ مردان با موی کوتاه مدرن و ریش کوتاه یا بدون ریش؛ زنان با روسری تیره‌ی ساده که فقط مو را می‌پوشاند و صورت کاملاً پیدا است.",
  afghan:
    "چهره‌ی تمام‌رخ و بزرگ‌نمایی‌شده‌ی یک فرد بزرگسال افغان (۲۰–۳۵ سال)، حالت خنثی، نگاه مستقیم به دوربین، پس‌زمینه‌ی یکدست خاکستری روشن، نور یکنواخت؛ فقط صورت و لبه‌ی شانه‌ها در کادر است (بدون بدن، بدون عینک، بدون تزئینات). ترکیب دسته: ۴ مرد + ۴ زن. نشانه‌های گروهی: چهره‌ی پشتون/هزاره‌ی افغانستانی با ویژگی‌های متمایز؛ مردان با ریش کامل پرپشت و یقه‌ی سنتی پراهن‌تنبان؛ زنان با روسری رنگی سنتی که روی سر و شانه انداخته می‌شود.",
};

export const STIMULUS_SPEC: Record<string, string> = {
  "iranian-01": "مرد ایرانی (۱) — ۲۷ سال، موی کوتاه مدرن سیاه، بدون ریش، پوست زیتونی روشن، صورت کشیده.",
  "iranian-02": "مرد ایرانی (۲) — ۳۱ سال، موی کوتاه تیره، ته‌ریش کوتاه، پوست گندمی، صورت گردتر.",
  "iranian-03": "مرد ایرانی (۳) — ۲۴ سال، موی موج‌دار کوتاه تیره، بدون ریش، پوست روشن.",
  "iranian-04": "مرد ایرانی (۴) — ۳۴ سال، موی کوتاه تیره، ریش کوتاه مرتب، پوست زیتونی تیره‌تر، صورت کشیده.",
  "iranian-05": "زن ایرانی (۱) — ۲۶ سال، روسری سیاه که فقط مو را می‌پوشاند، صورت کاملاً پیدا، پوست روشن، صورت بیضی.",
  "iranian-06": "زن ایرانی (۲) — ۳۰ سال، روسری سرمه‌ای، صورت پیدا، پوست گندمی روشن، صورت کشیده‌تر.",
  "iranian-07": "زن ایرانی (۳) — ۲۳ سال، روسری قهوه‌ای تیره، صورت پیدا، پوست زیتونی، صورت پرتر.",
  "iranian-08": "زن ایرانی (۴) — ۳۲ سال، روسری خاکستری زغالی، صورت پیدا، پوست گندمی، گونه‌های برجسته.",
  "afghan-01": "مرد افغان (۱) — پشتون، ۲۹ سال، ریش کامل پرپشت سیاه، چشم‌های گود، پوست گندمی، یقه‌ی سنتی پراهن‌تنبان.",
  "afghan-02": "مرد افغان (۲) — پشتون، ۳۳ سال، ریش کامل تیره با کمی سفیدی، بینی برجسته، پوست برنزه، یقه‌ی سنتی کرم.",
  "afghan-03": "مرد افغان (۳) — پشتون، ۲۵ سال، ریش کامل پرپشت جوان، فک زاویه‌دار، پوست قهوه‌ای روشن، یقه‌ی سنتی خاکستری.",
  "afghan-04": "مرد افغان (۴) — هزاره، ۲۸ سال، ریش کامل سیاه، چهره‌ی پهن با گونه‌های برجسته (ویژگی‌های شرق‌آسیایی)، یقه‌ی سنتی قهوه‌ای.",
  "afghan-05": "زن افغان (۱) — پشتون، ۲۷ سال، روسری سنتی آبی روشن روی سر و شانه، پوست گندمی گرم.",
  "afghan-06": "زن افغان (۲) — هزاره، ۳۰ سال، روسری سنتی سبز آبی روی سر و شانه، ویژگی‌های شرق‌آسیایی، گونه‌های برجسته.",
  "afghan-07": "زن افغان (۳) — پشتون، ۲۴ سال، روسری سنتی نارنجی-قرمز روی سر و شانه، پوست گندمی طلایی، صورت گرد.",
  "afghan-08": "زن افغان (۴) — ۳۳ سال، روسری سنتی سبز تیره به‌صورت آزاد روی سر و شانه، چهره‌ی قوی، پوست گندمی تیره‌تر.",
};

/** Canonical block-order string stored on every session. */
export function describeBlockOrder(def: TestDefinition): string {
  return def.blocks
    .map((b) => {
      const short =
        b.kind === "target-discrimination"
          ? "TD"
          : b.kind === "attribute-discrimination"
            ? "AD"
            : b.kind === "combined"
              ? "C"
              : b.kind === "target-discrimination-reversed"
                ? "TDR"
                : "CR";
      return `${b.number}:${short}`;
    })
    .join(",");
}

export const BLOCK_5_TRIAL_COUNT = IAT_TEST_DEFINITION.blocks.find((b) => b.number === 5)!
  .trialCount; // = 40 — explicit constant, documented in README
