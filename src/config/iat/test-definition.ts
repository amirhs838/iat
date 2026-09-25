import type { TestDefinition } from "@/lib/iat/types";

// =============================================================================
// IAT TEST DEFINITION — VERSION 1.5.0 (single source of truth)
// =============================================================================
// CHANGELOG:
//   v1.5.0 — The 16 shipped target stimuli are now ACTUALLY replaced with
//            curated REAL photographs (the v1.4.0 release had updated the
//            admin/config plumbing but the image files on disk were still
//            the v1.3.0 AI-generated placeholders — researcher rejected
//            them as "fake"). New set: real photos of Iranian and Afghan
//            people (color, 480×600, face-dominant frontal crops), 4 men +
//            4 women per category, sourced from Wikimedia Commons, Flickr
//            (CC) and a standard web image search; full per-slot provenance
//            + license table in public/iat/stimuli/ATTRIBUTION.md. Engine,
//            timing, block structure and scoring unchanged.
//   v1.4.0 — Admin panel gained inline editing of attribute words
//            (PATCH /api/admin/stimuli) and the upload flow now stores
//            replacements in the DB (served via /api/stimuli-image/[key])
//            so it works on Vercel. (Image files were NOT changed in this
//            release — corrected in v1.5.0.)
//   v1.3.0 — B Nazanin font (self-hosted woff2) + AI-generated standardized
//            portraits (superseded in v1.4.0).
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
//    NOTE: attribute words can also be edited at runtime from the admin panel
//    (پنل مدیریت → محرک‌ها); the DB Stimulus registry overrides the static
//    paths/labels here for NEW sessions (see src/lib/iat/registry.ts).
//
// 4) After changing this file, bump `version`, re-run `bun run db:seed`
//    and create a new TestVersion snapshot (see README → Versioning).
//
// Provenance of attribute word lists:
//    The English source words follow the standard IAT attribute exemplars
//    (Greenwald, McGhee & Schwartz, 1998; Greenwald, Nosek & Banaji, 2003):
//    positive: glorious, laughter, happy, love, peace, wonderful, pleasure, beautiful
//    negative: terrible, horrible, evil, hatred, awful, failure, agony, brutal
//    Persian translations are the default display words; they are editable
//    from the admin panel without code changes.
//    Target IMAGES: real frontal face-dominant photographs (4 men + 4 women
//    per category, adults, neutral-to-mild expression, face filling the
//    frame, no text or watermarks) — see public/iat/stimuli/ATTRIBUTION.md
//    for per-image provenance and license status. The researcher MUST vet
//    image content and usage rights before final data collection and
//    disclose the stimulus source in the thesis.
// =============================================================================

export const IAT_TEST_DEFINITION: TestDefinition = {
  name: "IAT Iranian–Afghan × Positive–Negative",
  version: "1.5.0",
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
  // TARGET CATEGORIES — real photographs (color, 480×600, face-dominant).
  // Files were curated from Wikimedia Commons, Flickr (CC) and a standard
  // web image search, and manually vetted: frontal face-dominant crops,
  // adults, no watermarks/text, gender-balanced (4 men + 4 women per
  // category). See ATTRIBUTION.md for provenance + licenses; the researcher
  // must vet licensing before final data collection and can replace any
  // slot via admin → محرک‌ها.
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
    "عکس واقعی (نه ساختگی) چهره‌ی تمام‌رخ و بزرگ‌نمایی‌شده‌ی یک فرد بزرگسال ایرانی، نگاه مستقیم یا نزدیک به مستقیم به دوربین، حالت چهره‌ی خنثی یا ملایم؛ صورت در کادر بزرگ است؛ بدون متن، واترمارک یا عینک آفتابی. نشانه‌های گروهی: چهره و استایل روزمره‌ی ایرانیِ رایج — مردان با موی کوتاه مدرن و ریش کوتاه/ته‌ریش یا بدون ریش؛ زنان با روسری ساده (یا پوشش سر ساده) که صورت کاملاً پیدا است. ترکیب دسته: ۴ مرد + ۴ زن.",
  afghan:
    "عکس واقعی (نه ساختگی) چهره‌ی تمام‌رخ و بزرگ‌نمایی‌شده‌ی یک فرد بزرگسال افغان، نگاه مستقیم یا نزدیک به مستقیم به دوربین، حالت چهره‌ی خنثی یا ملایم؛ صورت در کادر بزرگ است؛ بدون متن، واترمارک یا عینک آفتابی. نشانه‌های گروهی: چهره و استایل متمایز افغانستانی — مردان پشتون (کلاه پکول/دستار/چفیه یا ریش کامل) یا هزاره (ویژگی‌های شرق‌آسیایی)؛ زنان با روسری سنتی یا شال که روی سر انداخته می‌شود، از جمله زنان هزاره با ویژگی‌های شرق‌آسیایی. ترکیب دسته: ۴ مرد + ۴ زن.",
};

export const STIMULUS_SPEC: Record<string, string> = {
  "iranian-01": "مرد ایرانی (۱) — عکس واقعی چهره‌ی تمام‌رخ بزرگ‌نمایی‌شده، موی کوتاه مدرن، ته‌ریش، نگاه مستقیم به دوربین؛ تی‌شرت خاکستری.",
  "iranian-02": "مرد ایرانی (۲) — عکس واقعی چهره‌ی تمام‌رخ، جوان‌تر، پیراهن سفید، لبخند ملایم، نگاه مستقیم.",
  "iranian-03": "مرد ایرانی (۳) — عکس واقعی چهره‌ی تمام‌رخ، سبیل پرپشت و موی فر، نگاه نزدیک به مستقیم؛ پیراهن آبی.",
  "iranian-04": "مرد ایرانی (۴) — عکس واقعی چهره‌ی تمام‌رخ، میان‌سال، سبیل/ته‌ریش جوگندمی، نگاه مستقیم.",
  "iranian-05": "زن ایرانی (۱) — عکس واقعی چهره‌ی تمام‌رخ، روسری آبی روشن، نگاه مستقیم.",
  "iranian-06": "زن ایرانی (۲) — عکس واقعی چهره‌ی تمام‌رخ، روسری آبی با طرح و عینک طبی، نگاه نزدیک به مستقیم.",
  "iranian-07": "زن ایرانی (۳) — عکس واقعی چهره‌ی تمام‌رخ، لبخند، پوشش سر زمستانی (کلاه بافت) — در صورت نیاز به روسری، از پنل مدیریت جایگزین کنید.",
  "iranian-08": "زن ایرانی (۴) — عکس واقعی چهره‌ی تمام‌رخ، روسری تیره، نگاه مستقیم.",
  "afghan-01": "مرد افغان (۱) — عکس واقعی چهره‌ی تمام‌رخ، چفیه/شال گردن سنتی، سبیل و ته‌ریش، لبخند، نگاه مستقیم.",
  "afghan-02": "مرد افغان (۲) — عکس واقعی چهره‌ی تمام‌رخ بزرگ‌نمایی‌شده، ریش کامل، چهره‌ی آفتاب‌سوخته، لبخند، نگاه مستقیم.",
  "afghan-03": "مرد افغان (۳) — عکس واقعی چهره‌ی تمام‌رخ، دستار سنتی، ریش بلند سفید، نگاه مستقیم.",
  "afghan-04": "مرد افغان (۴) — عکس واقعی چهره‌ی تمام‌رخ، دستار خاکستری، ریش سفید، نگاه مستقیم.",
  "afghan-05": "زن افغان (۱) — عکس واقعی چهره‌ی تمام‌رخ، شال قهوه‌ای سنتی روی سر و شانه، ویژگی‌های هزاره (شرق‌آسیایی)، نگاه مستقیم.",
  "afghan-06": "زن افغان (۲) — عکس واقعی چهره‌ی تمام‌رخ، لباس/روسری سنتی فیروزه‌ای گلدوزی‌شده، پس‌زمینه‌ی کوهستان، نگاه مستقیم.",
  "afghan-07": "زن افغان (۳) — عکس واقعی چهره‌ی تمام‌رخ، شال تیره‌ی سبزآبی، ویژگی‌های هزاره (شرق‌آسیایی)، نگاه مستقیم.",
  "afghan-08": "زن افغان (۴) — عکس واقعی چهره‌ی تمام‌رخ، روسری قهوه‌ای و کاپشن، نگاه مستقیم.",
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
