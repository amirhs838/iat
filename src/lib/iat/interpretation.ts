// =============================================================================
// D-score directionality normalization + neutral interpretation (Persian).
//
// Directionality contract (documented in /docs/IAT_SCORING.md):
//   normalizedD > 0  => responses were faster when "Iranian" shared a key with
//                       "Positive" (equivalently: "Afghan" with "Negative").
//   normalizedD < 0  => the reversed pattern.
// This holds for BOTH counterbalancing conditions because the sign is
// normalized by conditionOrder at scoring time (see scoring/index.ts).
//
// Magnitude conventions follow common IAT research practice (Nosek, Greenwald
// & Banaji, 2007): |D| < 0.15 negligible, 0.15-0.35 slight, 0.35-0.65 moderate,
// >= 0.65 strong. These are conventions, not statistical thresholds.
// =============================================================================

import type { ConditionOrder } from "@/lib/iat/types";

/** Sign-normalize a raw procedure D so positive = stronger Iranian+Positive. */
export function normalizeD(rawD: number, conditionOrder: ConditionOrder): number {
  return conditionOrder === "A" ? rawD : -rawD;
}

export type InterpretationLevel = "negligible" | "slight" | "moderate" | "strong";

export function magnitudeLevel(absD: number): InterpretationLevel {
  if (absD < 0.15) return "negligible";
  if (absD < 0.35) return "slight";
  if (absD < 0.65) return "moderate";
  return "strong";
}

const LEVEL_FA: Record<InterpretationLevel, string> = {
  negligible: "ناچیز",
  slight: "اندک",
  moderate: "متوسط",
  strong: "نسبتاً قوی",
};

export interface Interpretation {
  level: InterpretationLevel;
  /** Neutral, research-appropriate Persian text (no normative judgments) */
  text: string;
}

/**
 * Build the participant-facing interpretation from a NORMALIZED D.
 * Never uses normative language; describes relative response-speed differences.
 */
export function interpretNormalizedD(
  normalizedD: number,
  labels: { iranian: string; afghan: string; positive: string; negative: string },
): Interpretation {
  const level = magnitudeLevel(Math.abs(normalizedD));
  const dText = normalizedD.toFixed(3).replace("-", "−");

  if (level === "negligible") {
    return {
      level,
      text:
        `شاخص D شما برابر ${dText} بود. این مقدار نشان می‌دهد عملکرد شما در دو ترکیب اصلی آزمون ` +
        `تفاوت ناچیزی از نظر سرعت پاسخ‌دهی داشته است.`,
    };
  }

  const positiveFaster = normalizedD > 0;
  const desc = positiveFaster
    ? `پاسخ‌دهی شما در ترکیبی که «${labels.iranian}» و «${labels.positive}» یک کلید مشترک داشتند، ` +
      `نسبت به ترکیب مخالف («${labels.iranian}» با «${labels.negative}») سریع‌تر بود`
    : `پاسخ‌دهی شما در ترکیبی که «${labels.iranian}» و «${labels.negative}» یک کلید مشترک داشتند، ` +
      `نسبت به ترکیب مخالف («${labels.iranian}» با «${labels.positive}») سریع‌تر بود`;

  return {
    level,
    text:
      `شاخص D شما برابر ${dText} بود؛ تفاوتی در سطح ${LEVEL_FA[level]}. ` +
      `${desc}. شاخص D این تفاوت نسبی در سرعت پاسخ‌دهی را خلاصه می‌کند.`,
  };
}

export const RESULT_CAVEAT_FA =
  "توجه: آزمون تداعی ضمنی یک شاخص نسبی از تداعی خودکار در یک تکلیف مشخص است؛ " +
  "این نتیجه درصدی قطعی از نگرش یا ویژگی فرد نیست و باید در کنار شواهد دیگر تفسیر شود.";

export const INVALID_RESULT_FA =
  "به دلیل کیفیت ناکافی داده‌ها، این نتیجه برای تفسیر پژوهشی قابل اتکا نیست.";

export function exclusionReasonFa(reason: string | null): string | null {
  if (!reason) return null;
  const map: Record<string, string> = {
    fast_responses_gt_10pct: "بیش از ۱۰٪ پاسخ‌ها سریع‌تر از آستانهٔ ۳۰۰ میلی‌ثانیه بوده است.",
    zero_variance: "پراکندگی زمان پاسخ در بلوک‌های اصلی صفر بود (پاسخ‌های یکنواخت).",
    insufficient_trials_for_sd: "تعداد پاسخ‌های معتبر برای محاسبهٔ شاخص کافی نبود.",
    empty_critical_block: "یکی از بلوک‌های اصلی آزمون ناقص است.",
    no_correct_trials_in_block: "در یکی از بلوک‌ها هیچ پاسخ صحیحی ثبت نشد.",
    trial_count_mismatch: "تعداد trials ارسال‌شده با طرح آزمون هم‌خوانی نداشت.",
    trial_sequence_mismatch: "ترتیب trials ارسال‌شده با طرح آزمون هم‌خوانی نداشت.",
    incomplete_critical_blocks: "داده‌های بلوک‌های اصلی ناقص است.",
  };
  for (const key of Object.keys(map)) {
    if (reason.startsWith(key)) return map[key];
  }
  return reason;
}
