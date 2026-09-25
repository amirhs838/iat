"use client";

// =============================================================================
// IatApp — participant flow state machine:
//   compat-check → intro → consent → demographics → create session → preload
//   → fullscreen → [block instructions → trials] ×7 → upload → result
//
// Offline-resilience: trial records are buffered to localStorage after each
// block; upload failure keeps them (PENDING_SYNC) with a retry path. No
// network activity occurs between preload and completion.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TrialRunner } from "@/components/iat/TrialRunner";
import { normalizeDigits, toFa } from "@/lib/format";
import type { BlockPlanEntry, ClientQualityMetadata, ClientTrialResult, SessionPlan, TrialSpec } from "@/lib/iat/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "loading-env"
  | "incompatible"
  | "pending-sync"
  | "intro"
  | "consent"
  | "demographics"
  | "creating"
  | "preload"
  | "ready-to-start"
  | "block-intro"
  | "running"
  | "uploading"
  | "result"
  | "sync-error"
  | "error";

interface SessionInfo {
  sessionId: string;
  anonymousId: string;
  conditionOrder: "A" | "B";
  testVersion: { code: string; version: string; scoringVersion: string; blockStructure: string };
  plan: SessionPlan;
}

interface CompleteResponse {
  ok: boolean;
  sessionStatus: string;
  result: {
    valid: boolean;
    dScore: number | null;
    rawD: number | null;
    level: string | null;
    interpretation: string;
    reasonFa: string | null;
    caveat: string;
    conditionOrder: string;
    errorRate: number | null;
    fastResponseRate: number | null;
  };
}

const BUFFER_KEY = "iat-pending-session-v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GENDERS = ["مرد", "زن", "ترجیح می‌دهم نگویم"];
const EDUCATIONS = ["زیر دیپلم", "دیپلم", "کاردانی", "کارشناسی", "کارشناسی ارشد", "دکتری"];
// Monthly approximate household income brackets (Toman) — fixed per researcher spec
const INCOMES = [
  "زیر ۲۵ میلیون تومان",
  "۲۵ تا ۵۰ میلیون تومان",
  "۵۰ تا ۷۰ میلیون تومان",
  "بالای ۱۰۰ میلیون تومان",
  "ترجیح می‌دهم نگویم",
];
const RELIGIOSITIES = ["اصلاً", "کمی", "متوسط", "زیاد", "خیلی زیاد", "ترجیح می‌دهم نگویم"];
const OCCUPATIONS = ["شاغل", "بیکار", "بازنشسته", "دانشجو"];

interface CompatResult {
  ok: boolean;
  reasons: string[];
  deviceType: string;
  screenWidth: number;
  screenHeight: number;
  fullscreenCapable: boolean;
}

function checkCompatibility(): CompatResult {
  // HARD requirements only: browser timing/rendering capabilities.
  // Mobile phones and tablets are explicitly SUPPORTED (on-screen response
  // buttons are the primary input; no keyboard is required). Screen size and
  // pointer type are recorded as metadata, never used to block participation.
  const reasons: string[] = [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (typeof performance?.now !== "function") reasons.push("مرورگر از اندازه‌گیری دقیق زمان پشتیبانی نمی‌کند.");
  if (typeof window.requestAnimationFrame !== "function") reasons.push("مرورگر قدیمی است؛ لطفاً مرورگر را به‌روز کنید.");
  const ua = navigator.userAgent;
  const deviceType = /iPad|Tablet/.test(ua) ? "tablet" : /Mobi|Android.*Mobile|iPhone/.test(ua) ? "mobile" : "desktop";

  return {
    ok: reasons.length === 0,
    reasons,
    deviceType,
    screenWidth: w,
    screenHeight: h,
    fullscreenCapable: typeof document.fullscreenEnabled === "undefined" ? false : document.fullscreenEnabled,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IatApp() {
  const [phase, setPhase] = useState<Phase>("loading-env");
  const [compat, setCompat] = useState<CompatResult | null>(null);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [blockIdx, setBlockIdx] = useState(0);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadFailed, setPreloadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CompleteResponse["result"] | null>(null);
  const [demographics, setDemographics] = useState({
    age: "",
    gender: "",
    education: "",
    income: "",
    religiosity: "",
    occupation: "",
  });
  const [consented, setConsented] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // Quality tracking (refs — zero re-render impact)
  const fullscreenExitRef = useRef(0);
  const fullscreenDeniedRef = useRef(false);
  const visibilityCountRef = useRef(0);
  const awayMsRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const sessionRef = useRef<SessionInfo | null>(null);
  sessionRef.current = session;
  const trialsRef = useRef<ClientTrialResult[]>([]);
  const phaseRef = useRef<Phase>("loading-env");
  phaseRef.current = phase;

  // --- Compatibility check (once) ------------------------------------------
  useEffect(() => {
    const c = checkCompatibility();
    setCompat(c);
    if (!c.ok) {
      setPhase("incompatible");
      return;
    }
    // Pending-sync recovery: an upload failed previously?
    try {
      const raw = localStorage.getItem(BUFFER_KEY);
      if (raw) {
        const buf = JSON.parse(raw) as { sessionId: string; trials: ClientTrialResult[]; quality: ClientQualityMetadata };
        if (buf?.sessionId && Array.isArray(buf.trials) && buf.trials.length > 0) {
          setPhase("pending-sync");
          return;
        }
      }
    } catch {
      localStorage.removeItem(BUFFER_KEY);
    }
    setPhase("intro");
  }, []);

  // --- Global quality event tracking ----------------------------------------
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        fullscreenExitRef.current += 1;
      }
    };
    const onVis = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        visibilityCountRef.current += 1;
      } else if (hiddenAtRef.current !== null) {
        awayMsRef.current += Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
      }
    };
    const onHide = () => {
      // Best-effort abandon marker while a test is in progress
      const s = sessionRef.current;
      const p = phaseRef.current;
      if (s && !finishedRef.current && (p === "running" || p === "block-intro")) {
        try {
          navigator.sendBeacon(`/api/session/${s.sessionId}/abandon`);
        } catch {
          /* best effort */
        }
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const qualityMeta = useCallback((): ClientQualityMetadata => {
    return {
      fullscreenExitCount: fullscreenExitRef.current,
      fullscreenDenied: fullscreenDeniedRef.current,
      visibilityChangeCount: visibilityCountRef.current,
      awayDurationMs: awayMsRef.current,
      screenWidth: compat?.screenWidth ?? 0,
      screenHeight: compat?.screenHeight ?? 0,
      deviceType: compat?.deviceType ?? "desktop",
      language: navigator.language ?? "fa",
    };
  }, [compat]);

  // --- Flow actions ----------------------------------------------------------

  const startCreation = useCallback(async () => {
    setCreating(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          // Same normalization as submitDemographics (Persian/Arabic digits →
          // ASCII); parse in ONE place would be cleaner but the value lives in
          // shared state as a string, so both sites must normalize identically.
          age: parseInt(normalizeDigits(demographics.age).trim(), 10),
          gender: demographics.gender,
          education: demographics.education,
          income: demographics.income,
          religiosity: demographics.religiosity,
          occupation: demographics.occupation,
          environment: {
            screenWidth: compat?.screenWidth ?? 0,
            screenHeight: compat?.screenHeight ?? 0,
            deviceType: compat?.deviceType ?? "desktop",
            language: navigator.language,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "خطا در ایجاد جلسه");
      }
      const data = (await res.json()) as SessionInfo;
      setSession(data);
      setPhase("preload");
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "خطای شبکه");
      setPhase("error");
    } finally {
      setCreating(false);
    }
  }, [demographics, compat]);

  // --- Preload ---------------------------------------------------------------
  const runPreload = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    setPreloadFailed(false);
    setPreloadProgress(0);
    const paths = [...new Set(s.plan.trials.filter((t) => t.stimulusType === "image").map((t) => t.stimulusPath))];
    let loaded = 0;
    let failures = 0;
    await Promise.all(
      paths.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            const done = (ok: boolean) => {
              if (ok) loaded += 1;
              else failures += 1;
              setPreloadProgress(loaded / Math.max(1, paths.length));
              resolve();
            };
            img.onload = () => {
              // ensure full decode before the first critical trial
              if (typeof img.decode === "function") {
                img.decode().then(() => done(true)).catch(() => done(true));
              } else done(true);
            };
            img.onerror = () => done(false);
            img.src = src;
          }),
      ),
    );
    if (failures > 0) {
      console.error(`[IAT] preload failed for ${failures}/${paths.length} images`);
      setPreloadFailed(true);
      return;
    }
    setPhase("ready-to-start");
  }, []);

  // Auto-run preload when entering the preload phase (hook order is stable —
  // this effect lives above all conditional rendering).
  useEffect(() => {
    if (phase === "preload" && !preloadFailed && sessionRef.current) {
      void runPreload();
    }
  }, [phase, preloadFailed, runPreload]);

  const beginTest = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    // Fullscreen request must happen inside the user gesture
    try {
      if (document.fullscreenEnabled) {
        await document.documentElement.requestFullscreen();
      } else {
        fullscreenDeniedRef.current = true;
      }
    } catch {
      fullscreenDeniedRef.current = true;
    }
    // mark RUNNING (no further requests until completion)
    void fetch(`/api/session/${s.sessionId}/start`, { method: "POST" }).catch(() => undefined);
    setBlockIdx(0);
    setPhase("block-intro");
  }, []);

  // --- Upload ------------------------------------------------------------------
  const uploadResults = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    setUploading(true);
    setPhase("uploading");
    const payload = {
      trials: trialsRef.current,
      quality: qualityMeta(),
    };
    try {
      const res = await fetch(`/api/session/${s.sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as CompleteResponse & { error?: string };
      if (res.ok || res.status === 409) {
        // 200 = scored now; 409 = already completed earlier (idempotent reply
        // carries the stored result) — both mean the data is safely recorded.
        if (!data.result) throw new Error("پاسخ ناقص از سرور");
        finishedRef.current = true;
        localStorage.removeItem(BUFFER_KEY);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
        setResult(data.result);
        setPhase("result");
        return;
      }
      if (res.status === 422) {
        // server rejected data — keep buffer for researcher review
        setPhase("sync-error");
        return;
      }
      throw new Error(data.error ?? "upload failed");
    } catch {
      // network failure → PENDING_SYNC (buffer already saved)
      setPhase("sync-error");
    } finally {
      setUploading(false);
    }
  }, [qualityMeta]);

  // --- Block completion -------------------------------------------------------
  const onBlockDone = useCallback(
    (records: ClientTrialResult[]) => {
      const s = sessionRef.current;
      if (!s) return;
      trialsRef.current = trialsRef.current.concat(records);
      // buffer to localStorage (offline resilience)
      try {
        localStorage.setItem(
          BUFFER_KEY,
          JSON.stringify({ sessionId: s.sessionId, trials: trialsRef.current, quality: qualityMeta() }),
        );
      } catch {
        /* storage full — upload still attempted */
      }
      if (blockIdx + 1 < s.plan.blocks.length) {
        setBlockIdx(blockIdx + 1);
        setPhase("block-intro");
      } else {
        void uploadResults();
      }
    },
    [blockIdx, qualityMeta, uploadResults],
  );

  const retryUpload = useCallback(async () => {
    // used both from sync-error and pending-sync recovery on reload
    try {
      const raw = localStorage.getItem(BUFFER_KEY);
      if (!raw) {
        setPhase("intro");
        return;
      }
      const buf = JSON.parse(raw) as { sessionId: string; trials: ClientTrialResult[]; quality: ClientQualityMetadata };
      setUploading(true);
      const res = await fetch(`/api/session/${buf.sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trials: buf.trials, quality: buf.quality }),
      });
      const data = (await res.json().catch(() => ({}))) as CompleteResponse & { error?: string };
      if (res.ok || (res.status === 409 && data.result)) {
        // 200 = scored now; 409 = already completed earlier (result included)
        finishedRef.current = true;
        localStorage.removeItem(BUFFER_KEY);
        setResult(data.result);
        setPhase("result");
        return;
      }
      if (res.status === 422 || res.status === 404 || res.status === 409) {
        localStorage.removeItem(BUFFER_KEY);
        setPhase("intro");
        return;
      }
      setPhase("pending-sync");
    } catch {
      setPhase("pending-sync");
    } finally {
      setUploading(false);
    }
  }, []);

  const discardBuffer = useCallback(() => {
    localStorage.removeItem(BUFFER_KEY);
    trialsRef.current = [];
    setPhase("intro");
  }, []);

  const submitDemographics = useCallback(() => {
    // Normalize Persian/Arabic-Indic digits (mobile Persian keyboards) to ASCII
    const age = parseInt(normalizeDigits(demographics.age).trim(), 10);
    if (!Number.isFinite(age) || age < 8 || age > 100) {
      setDemoError("سن معتبر وارد کنید (۸ تا ۱۰۰).");
      return;
    }
    if (!demographics.gender) {
      setDemoError("جنسیت را انتخاب کنید.");
      return;
    }
    if (!demographics.education) {
      setDemoError("تحصیلات را انتخاب کنید.");
      return;
    }
    if (!demographics.income) {
      setDemoError("درآمد تقریبی ماهانه را انتخاب کنید.");
      return;
    }
    if (!demographics.religiosity) {
      setDemoError("میزان مذهبی‌بودن را انتخاب کنید.");
      return;
    }
    if (!demographics.occupation) {
      setDemoError("وضعیت شغلی را انتخاب کنید.");
      return;
    }
    setDemoError(null);
    void startCreation();
  }, [demographics, startCreation]);

  // --- Render ------------------------------------------------------------------

  if (phase === "loading-env") {
    return <Centered>در حال بررسی محیط…</Centered>;
  }

  if (phase === "incompatible" && compat) {
    return (
      <Centered>
        <Card className="max-w-lg w-full text-right">
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-bold">این مرورگر برای اجرای آزمون مناسب نیست</h2>
            <ul className="list-disc pr-5 space-y-1 text-sm text-muted-foreground">
              {compat.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              لطفاً با یک مرورگر به‌روز (Chrome، Firefox، Safari یا Edge) روی گوشی یا رایانه وارد شوید.
            </p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "pending-sync") {
    return (
      <Centered>
        <Card className="max-w-lg w-full text-right">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-bold">ارسال داده‌های آزمون ناتمام مانده است</h2>
            <p className="text-sm text-muted-foreground">
              داده‌های یک جلسه قبلی در این مرورگر ذخیره شده اما ارسال نشده است. می‌توانید دوباره تلاش کنید یا آن را حذف کنید.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => void retryUpload()} disabled={uploading}>
                {uploading ? "در حال ارسال…" : "تلاش برای ارسال"}
              </Button>
              <Button variant="outline" onClick={discardBuffer}>
                حذف و شروع از نو
              </Button>
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "intro") {
    return (
      <Centered>
        <Card className="max-w-2xl w-full text-right">
          <CardContent className="p-8 space-y-5">
            <h2 className="text-2xl font-bold">آزمون تداعی ضمنی (IAT)</h2>
            {/* Researcher statement — shown verbatim on the first page */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-1 text-center">
              <p className="text-base leading-8 text-foreground">
                این پاسخ‌ها و اطلاعات در راستای یک پژوهش علمی در چارچوب یک پایان‌نامه کارشناسی ارشد است.
              </p>
              <p className="text-base leading-8 text-foreground">ممنون از وقتی که می‌گذارید.</p>
              <p className="text-base leading-8 font-bold">با تشکر</p>
              <p className="text-base leading-8 font-bold">فاطمه بابازاده، دانشجوی کارشناسی ارشد روانشناسی شناختی</p>
            </div>
            <div className="space-y-3 text-base leading-8 text-muted-foreground">
              <p>
                در این آزمون تصویرها و واژه‌هایی نمایش داده می‌شود و شما آن‌ها را با دو دکمهٔ بزرگ پایین صفحه
                طبقه‌بندی می‌کنید. آزمون شامل <b className="text-foreground">۷ بخش</b> و حدود ۲۰۰ مرحله است و
                حدود ۱۰ تا ۱۲ دقیقه زمان می‌برد.
              </p>
              <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 font-semibold">
                تا جای ممکن سریع پاسخ دهید؛ دقت لازم نیست.
              </p>
              <p>
                در صورت اشتباه، نشان ✕ ظاهر می‌شود و دکمهٔ درست سبزرنگ می‌شود؛ همان دکمه را بزنید تا مرحله
                ادامه یابد. به هر محرک فقط یک پاسخ بدهید و دکمه‌ها را پشت‌سرهم چند بار نزنید.
              </p>
              <p className="text-foreground font-medium">
                این آزمون با گوشی موبایل، تبلت و رایانه سازگار است. روی رایانه دکمه‌های پاسخ با حروف کلیدها
                (E و I) نمایش داده می‌شوند و می‌توانید همان کلیدها را روی صفحه‌کلید فشار دهید؛ روی موبایل و
                تبلت دکمه‌های بزرگ لمسی نمایش داده می‌شود. ورود به حالت تمام‌صفحه پیشنهاد می‌شود.
              </p>
            </div>
            <Button size="lg" onClick={() => setPhase("consent")}>
              ادامه
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "consent") {
    return (
      <Centered>
        <Card className="max-w-2xl w-full text-right">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-2xl font-bold">رضایت آگاهانه</h2>
            <div className="text-base leading-8 text-muted-foreground space-y-2">
              <p>
                مشارکت شما کاملاً داوطلبانه است و می‌توانید در هر مرحله از ادامه مشارکت صرف‌نظر کنید. داده‌ها
                به‌صورت ناشناس ذخیره می‌شوند؛ هیچ اطلاعات هویتی (نام، شماره تماس یا نشانی) جمع‌آوری نمی‌شود.
              </p>
              <p>
                داده‌های پاسخ (زمان واکنش و دقت) صرفاً برای اهداف پژوهشی دانشگاهی استفاده خواهد شد و نتایج به‌صورت
                تجمیعی گزارش می‌شود.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={consented} onCheckedChange={(v) => setConsented(v === true)} id="consent" />
              <span className="text-base font-medium">
                شرایط بالا را خواندم و با مشارکت داوطلبانه در این پژوهش موافقم.
              </span>
            </label>
            <div className="flex gap-2">
              <Button disabled={!consented} onClick={() => setPhase("demographics")}>
                ثبت رضایت و ادامه
              </Button>
              <Button variant="outline" onClick={() => setPhase("intro")}>
                بازگشت
              </Button>
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "demographics") {
    return (
      <Centered>
        <Card className="max-w-xl w-full text-right">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-2xl font-bold">اطلاعات جمعیت‌شناختی</h2>
            <p className="text-sm text-muted-foreground">این اطلاعات ناشناس و فقط برای تحلیل پژوهشی است.</p>
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="age">سن</Label>
                {/* type="text" + inputMode="numeric": browsers strip Persian
                    digits (۰-۹) from type="number" inputs, which would lock
                    out Persian-keyboard mobile users. normalizeDigits handles
                    conversion at submit time. */}
                <Input
                  id="age"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9۰-۹٠-٩]*"
                  autoComplete="off"
                  maxLength={3}
                  className="max-w-28"
                  value={demographics.age}
                  onChange={(e) =>
                    setDemographics((d) => ({
                      ...d,
                      age: e.target.value.replace(/[^\d\u06F0-\u06F9\u0660-\u0669]/g, "").slice(0, 3),
                    }))
                  }
                  placeholder="مثلاً ۲۵"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label>جنسیت</Label>
                <Select value={demographics.gender} onValueChange={(v) => setDemographics((d) => ({ ...d, gender: v }))}>
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>تحصیلات</Label>
                <Select
                  value={demographics.education}
                  onValueChange={(v) => setDemographics((d) => ({ ...d, education: v }))}
                >
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>درآمد تقریبی در ماه</Label>
                <Select value={demographics.income} onValueChange={(v) => setDemographics((d) => ({ ...d, income: v }))}>
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOMES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>تا چه حد خود را مذهبی می‌دانید؟</Label>
                <Select
                  value={demographics.religiosity}
                  onValueChange={(v) => setDemographics((d) => ({ ...d, religiosity: v }))}
                >
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELIGIOSITIES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>شغل</Label>
                <Select
                  value={demographics.occupation}
                  onValueChange={(v) => setDemographics((d) => ({ ...d, occupation: v }))}
                >
                  <SelectTrigger dir="rtl">
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPATIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {demoError && <p className="text-sm text-destructive">{demoError}</p>}
            <Button onClick={submitDemographics} disabled={creating}>
              {creating ? "در حال ایجاد جلسه…" : "ادامه به آزمون"}
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "preload") {
    return (
      <Centered>
        <Card className="max-w-lg w-full text-right">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-xl font-bold">
              {preloadFailed ? "خطا در بارگذاری محرک‌ها" : "در حال بارگذاری محرک‌های آزمون…"}
            </h2>
            {!preloadFailed && (
              <>
                <Progress value={preloadProgress * 100} />
                <p className="text-sm text-muted-foreground">
                  همه تصویرها پیش از شروع بارگذاری می‌شوند تا زمان‌سنجی آزمون دقیق باشد. لطفاً صبر کنید.
                </p>
              </>
            )}
            {preloadFailed && (
              <p className="text-sm text-destructive">
                بارگذاری برخی تصویرها ناموفق بود. آزمون بدون پیش‌بارگذاری کامل آغاز نمی‌شود. اتصال را بررسی و
                دوباره تلاش کنید.
              </p>
            )}
            <Button onClick={() => void runPreload()}>{preloadFailed ? "تلاش دوباره" : "بارگذاری مجدد"}</Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "ready-to-start" && session) {
    return (
      <Centered>
        <Card className="max-w-lg w-full text-right">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-xl font-bold">همه‌چیز آماده است</h2>
            <ul className="text-sm leading-7 text-muted-foreground list-disc pr-5">
              <li>دو دکمهٔ پایین صفحه را ببینید؛ نام هر گروه روی دکمهٔ خودش نوشته شده است.</li>
              <li>به هر محرک فقط یک بار پاسخ دهید؛ نیازی به زدن دوبارهٔ دکمه نیست.</li>
              <li>در صورت اشتباه، ✕ ظاهر می‌شود و دکمهٔ درست سبز می‌شود؛ همان دکمه را بزنید.</li>
              <li>در صورت امکان، حالت تمام‌صفحه فعال می‌شود.</li>
              <li>کد ناشناس شما: <span className="font-mono text-foreground" dir="ltr">{session.anonymousId}</span></li>
            </ul>
            <Button size="lg" onClick={() => void beginTest()}>
              شروع آزمون
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "block-intro" && session) {
    const block = session.plan.blocks[blockIdx];
    return (
      <BlockIntro
        block={block}
        index={blockIdx}
        total={session.plan.blocks.length}
        onStart={() => setPhase("running")}
      />
    );
  }

  if (phase === "running" && session) {
    const block = session.plan.blocks[blockIdx];
    const trials = session.plan.trials.filter((t) => t.blockNumber === block.number);
    return <TrialRunner block={block} trials={trials} onBlockDone={onBlockDone} />;
  }

  if (phase === "uploading" || (phase === "sync-error" && uploading)) {
    return <Centered>در حال ثبت داده‌ها… لطفاً صفحه را نبندید.</Centered>;
  }

  if (phase === "sync-error") {
    return (
      <Centered>
        <Card className="max-w-lg w-full text-right">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-xl font-bold">ارسال داده‌ها ناموفق بود</h2>
            <p className="text-sm text-muted-foreground">
              داده‌های شما در همین مرورگر ذخیره شده است و چیزی از دست نرفته است. اتصال اینترنت را بررسی کنید و
              دوباره تلاش کنید.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => void uploadResults()}>تلاش دوباره</Button>
              <Button variant="outline" onClick={() => setPhase("pending-sync")}>
                بعداً
              </Button>
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "error") {
    return (
      <Centered>
        <Card className="max-w-lg w-full text-right">
          <CardContent className="p-8 space-y-3">
            <h2 className="text-xl font-bold text-destructive">خطا</h2>
            <p className="text-sm text-muted-foreground">{compatError ?? demoError ?? "خطای نامشخص"}</p>
            <Button variant="outline" onClick={() => setPhase("intro")}>
              بازگشت به ابتدا
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (phase === "result" && result) {
    return (
      <Centered>
        <Card className="max-w-2xl w-full text-right">
          <CardContent className="p-8 space-y-5">
            <h2 className="text-2xl font-bold">آزمون کامل شد</h2>
            <p className="text-sm text-muted-foreground">
              پاسخ‌های شما ثبت شد. از مشارکت شما سپاسگزاریم.
            </p>
            {result.valid ? (
              <div className="space-y-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-muted-foreground">شاخص D (نسخه بهبودیافته Greenwald و همکاران، ۲۰۰۳):</span>
                  <span className="text-3xl font-bold font-mono" dir="ltr">
                    {result.dScore === null ? "—" : result.dScore.toFixed(3)}
                  </span>
                </div>
                <p className="text-sm leading-7">{result.interpretation}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm leading-7 text-amber-700">{result.interpretation}</p>
                {result.reasonFa && <p className="text-xs text-muted-foreground">دلیل: {result.reasonFa}</p>}
              </div>
            )}
            <p className="text-xs leading-6 text-muted-foreground border-t pt-4">{result.caveat}</p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  return <Centered>…</Centered>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
      {children}
    </div>
  );
}

function BlockIntro({
  block,
  index,
  total,
  onStart,
}: {
  block: BlockPlanEntry;
  index: number;
  total: number;
  onStart: () => void;
}) {
  // Same desktop detection as TrialRunner (pointer: fine + hover) — on desktop
  // the key letters are shown next to each group so the E/I mapping is explicit.
  const [desktopKeys] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)")?.matches === true &&
      window.matchMedia?.("(hover: hover)")?.matches === true
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onStart]);

  return (
    <div className="fixed inset-0 z-50 bg-white experiment-mode flex flex-col items-center justify-center p-6" data-testid="block-intro">
      <div className="max-w-2xl w-full space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{block.instructionTitle}</h2>
          <span className="text-sm text-neutral-400">
            بخش {toFa(index + 1)} از {toFa(total)}
          </span>
        </div>
        <div className="flex justify-between gap-4" dir="ltr" aria-hidden>
          <span className="px-5 py-3 rounded-lg border-2 border-neutral-800 font-semibold text-lg text-center">
            {block.leftLabel}
            {desktopKeys && (
              <span
                className="ms-2 inline-flex items-center justify-center rounded-md border-2 border-neutral-800 bg-white px-2 py-1 align-middle font-mono text-base font-bold leading-none"
                dir="ltr"
              >
                {block.leftKey}
              </span>
            )}
          </span>
          <span className="px-5 py-3 rounded-lg border-2 border-neutral-800 font-semibold text-lg text-center">
            {block.rightLabel}
            {desktopKeys && (
              <span
                className="ms-2 inline-flex items-center justify-center rounded-md border-2 border-neutral-800 bg-white px-2 py-1 align-middle font-mono text-base font-bold leading-none"
                dir="ltr"
              >
                {block.rightKey}
              </span>
            )}
          </span>
        </div>
        <p className="text-base leading-8 text-neutral-700 whitespace-pre-line text-center">
          {block.instructionBody}
        </p>
        <div className="text-center space-y-3">
          <p className="text-sm text-neutral-500">
            برای شروع، دکمهٔ زیر را بزنید (روی رایانه، کلید Space هم کار می‌کند).
          </p>
          <Button size="lg" className="w-full sm:w-auto" onClick={onStart}>
            شروع بخش {toFa(index + 1)}
          </Button>
        </div>
      </div>
    </div>
  );
}
