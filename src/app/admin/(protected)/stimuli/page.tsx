"use client";

// =============================================================================
// /admin/stimuli — stimulus registry with per-slot methodological spec.
// Target image slots show what the image must contain (gender, ethnicity,
// pose, grayscale...) + an upload control; uploads take effect for NEW
// sessions. Attribute words are display-only (standard IAT lists).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toFa } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  Images,
  AlertTriangle,
  RefreshCw,
  Info,
  ImageIcon,
  Type,
  Upload,
  Loader2,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

type StimulusItem = {
  id: string;
  stimulusKey: string;
  type: "image" | "word";
  category: string;
  path: string;
  label: string | null;
  description: string | null;
  version: string;
  active: boolean;
  sortOrder: number;
  uploadedAt: string | null;
  fileExists: boolean | null;
};

type CategoryGroup = {
  category: string;
  items: StimulusItem[];
  generalSpec: string | null;
};

type StimuliResponse = {
  categories: CategoryGroup[];
  total: number;
  testVersion: { code: string; version: string };
  replacementGuide: { targetImages: string; attributeWords: string; noEngineChanges: string };
};

const CATEGORY_ORDER = ["iranian", "afghan", "positive", "negative"] as const;

const CATEGORY_META: Record<string, { title: string; isTarget: boolean }> = {
  iranian: { title: "ایرانی", isTarget: true },
  afghan: { title: "افغان", isTarget: true },
  positive: { title: "مثبت", isTarget: false },
  negative: { title: "منفی", isTarget: false },
};

function categoryTitle(category: string): string {
  return CATEGORY_META[category]?.title ?? category;
}

function faDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function StimuliPage() {
  const { toast } = useToast();
  const [data, setData] = useState<StimuliResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/stimuli", { signal: ac.signal });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StimuliResponse;
        setData(json);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("بارگذاری فهرست محرک‌ها ناموفق بود.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void run();

    return () => ac.abort();
  }, [reloadTick]);

  const upload = async (item: StimulusItem, file: File) => {
    setBusyKey(item.stimulusKey);
    try {
      const form = new FormData();
      form.append("stimulusKey", item.stimulusKey);
      form.append("file", file);
      const res = await fetch("/api/admin/stimuli/upload", { method: "POST", body: form });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) {
        toast({
          title: "بارگذاری ناموفق بود",
          description: payload.error ?? `خطای سرور (${res.status})`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "تصویر جایگزین شد",
        description: `${item.stimulusKey} — برای جلسه‌های جدید اعمال می‌شود.`,
      });
      setReloadTick((t) => t + 1);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید.", variant: "destructive" });
    } finally {
      setBusyKey(null);
      const input = fileInputs.current[item.stimulusKey];
      if (input) input.value = "";
    }
  };

  const restore = async (item: StimulusItem) => {
    setBusyKey(item.stimulusKey);
    try {
      const res = await fetch("/api/admin/stimuli/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stimulusKey: item.stimulusKey }),
      });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: "بازگردانی ناموفق بود",
          description: payload.error ?? `خطای سرور (${res.status})`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "به مجموعه‌ی مرجع بازگشت", description: item.stimulusKey });
      setReloadTick((t) => t + 1);
    } catch {
      toast({ title: "خطای شبکه", description: "دوباره تلاش کنید.", variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  // Order categories deterministically; unknown categories go last.
  const categories = [...(data?.categories ?? [])].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.category as (typeof CATEGORY_ORDER)[number]);
    const ib = CATEGORY_ORDER.indexOf(b.category as (typeof CATEGORY_ORDER)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const guide = data?.replacementGuide;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Images className="h-5 w-5 text-primary" />
            محرک‌ها
          </h1>
          <p className="text-xs text-muted-foreground">
            دفتر ثبت محرک‌های آزمون — مجموعاً {data ? toFa(data.total) : "…"} محرک در چهار دسته
            {data?.testVersion ? ` · نسخه‌ی آزمون v${data.testVersion.version}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start"
          onClick={() => setReloadTick((t) => t + 1)}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          به‌روزرسانی
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setReloadTick((t) => t + 1)} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} className="h-64" />
          ))}
        </div>
      ) : !data || categories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Images className="h-8 w-8 opacity-40" />
            <p className="text-sm">هیچ محرکی در پایگاه داده ثبت نشده است.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {categories.map(({ category, items, generalSpec }) => {
              const isTarget = CATEGORY_META[category]?.isTarget ?? false;
              const isWord = items[0]?.type === "word";
              const uploadedCount = items.filter((s) => s.uploadedAt).length;
              return (
                <Card key={category}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        {isWord ? <Type className="h-4 w-4 text-primary" /> : <ImageIcon className="h-4 w-4 text-primary" />}
                        {categoryTitle(category)}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({toFa(items.length)} محرک)
                        </span>
                      </CardTitle>
                      {isTarget &&
                        (uploadedCount > 0 ? (
                          <Badge className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {toFa(uploadedCount)} اسلات شخصی‌سازی‌شده
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            مجموعه مرجع — قابل جایگزینی
                          </Badge>
                        ))}
                    </div>
                    <CardDescription>
                      {isWord
                        ? "محرک‌های واژگانی ویژگی (attribute) — فهرست استاندارد IAT"
                        : "محرک‌های تصویری هدف (target) — برای هر اسلات، توضیح محتوای مجاز و دکمه‌ی بارگذاری نمایش داده می‌شود"}
                    </CardDescription>
                    {generalSpec && (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground">مشخصات کلی دسته: </span>
                        {generalSpec}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isTarget ? (
                      <ul className="space-y-2.5 max-h-[26rem] overflow-y-auto scrollbar-thin">
                        {items.map((s) => (
                          <li key={s.id} className="flex gap-3 rounded-md border p-3">
                            <div className="shrink-0 space-y-1.5 text-center">
                              <img
                                src={`${s.path}${s.uploadedAt ? `?v=${encodeURIComponent(s.uploadedAt)}` : ""}`}
                                alt={`محرک ${categoryTitle(category)} — ${s.stimulusKey}`}
                                className="h-20 w-16 object-cover border rounded bg-muted"
                              />
                              <span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">
                                {s.stimulusKey}
                              </span>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant={s.uploadedAt ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                                    {s.uploadedAt ? `بارگذاری‌شده · ${faDateTime(s.uploadedAt)}` : "مجموعه مرجع"}
                                  </Badge>
                                  {s.fileExists === false && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                      فایل یافت نشد
                                    </Badge>
                                  )}
                                  {!s.active && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      غیرفعال
                                    </Badge>
                                  )}
                                </div>
                                {s.label && (
                                  <span className="text-[10px] text-muted-foreground" dir="ltr">
                                    {s.label}
                                  </span>
                                )}
                              </div>
                              {s.description && (
                                <p className="text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                              )}
                              <div className="mt-auto flex items-center gap-2">
                                <input
                                  ref={(el) => {
                                    fileInputs.current[s.stimulusKey] = el;
                                  }}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void upload(s, f);
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 h-8"
                                  disabled={busyKey === s.stimulusKey}
                                  onClick={() => fileInputs.current[s.stimulusKey]?.click()}
                                >
                                  {busyKey === s.stimulusKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                  بارگذاری فایل
                                </Button>
                                {s.uploadedAt && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1.5 h-8 text-muted-foreground"
                                    disabled={busyKey === s.stimulusKey}
                                    onClick={() => void restore(s)}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    بازگردانی به مرجع
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 max-h-72 overflow-y-auto scrollbar-thin">
                        {items.map((s) => (
                          <li
                            key={s.id}
                            className="flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-center"
                            title={s.description ?? s.label ?? s.stimulusKey}
                          >
                            <span className="flex h-14 w-14 items-center justify-center text-lg font-semibold leading-tight">
                              {s.path}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">
                              {s.stimulusKey}
                            </span>
                            {s.label && (
                              <span className="text-[10px] text-muted-foreground" dir="ltr">
                                {s.label}
                              </span>
                            )}
                            {!s.active && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                غیرفعال
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {guide && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  راهنمای جایگزینی محرک‌ها
                </CardTitle>
                <CardDescription>
                  جایگزینی محرک‌ها نیازی به تغییر موتور آزمون یا منطق امتیازدهی ندارد.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm">
                  <li className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3">
                    <span className="text-xs font-semibold">۱. تصاویر هدف (بارگذاری از همین صفحه)</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      قالب‌های مجاز: JPEG / PNG / WebP — حداقل ۲۰۰×۲۰۰ پیکسل — حداکثر ۸ مگابایت. فایل مرجع حفظ می‌شود و با
                      «بازگردانی به مرجع» قابل بازگشت است.
                    </span>
                    <code dir="ltr" className="block text-left font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                      {guide.targetImages}
                    </code>
                  </li>
                  <li className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3">
                    <span className="text-xs font-semibold">۲. واژه‌های ویژگی</span>
                    <code dir="ltr" className="block text-left font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                      {guide.attributeWords}
                    </code>
                  </li>
                  <li className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3">
                    <span className="text-xs font-semibold">۳. بدون تغییر در موتور</span>
                    <code dir="ltr" className="block text-left font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                      {guide.noEngineChanges}
                    </code>
                  </li>
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
