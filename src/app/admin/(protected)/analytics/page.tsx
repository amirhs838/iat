"use client";

// =============================================================================
// /admin/analytics — research view: D by condition, sessions over time,
// block-wise RTs, exclusion reasons, data-quality metrics. recharts, LTR.
// =============================================================================

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatD, formatMs, toFa } from "@/lib/format";
import {
  BarChart3,
  AlertTriangle,
  RefreshCw,
  Info,
  LineChart as LineChartIcon,
  Timer,
  FilterX,
  ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

type DByCondition = {
  condition: string;
  n: number;
  meanD: number | null;
  sdD: number | null;
  medianD: number | null;
};

type AnalyticsResponse = {
  dByCondition: DByCondition[];
  exclusionReasons: { reason: string; count: number }[];
  sessionsOverTime: { date: string; count: number }[];
  blockRt: {
    block: string;
    meanRt: number | null;
    medianRt: number | null;
    meanRtCorrect: number | null;
    n: number;
  }[];
  quality: { meanErrorRate: number | null; meanFastResponseRate: number | null };
};

const EXCLUSION_LABELS: Record<string, string> = {
  fast_responses_gt_10pct: "بیش از ۱۰٪ پاسخ‌های سریع (< ۳۰۰ms)",
  zero_variance: "واریانس صفر در بلوک‌های بحرانی",
  insufficient_trials_for_sd: "داده‌ی ناکافی برای محاسبه SD",
  unknown: "نامشخص",
};

function exclusionLabel(reason: string): string {
  return EXCLUSION_LABELS[reason] ?? reason;
}

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${toFa((rate * 100).toFixed(1))}٪`;
}

function axisNum(v: number): string {
  return toFa(Math.round(v * 100) / 100);
}

function dayTick(iso: string): string {
  return toFa(iso.slice(5).replace("-", "/"));
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/analytics", { signal: ac.signal });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnalyticsResponse;
        setData(json);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("بارگذاری تحلیل‌ها ناموفق بود.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void run();

    return () => ac.abort();
  }, [reloadTick]);

  const hasDData = (data?.dByCondition ?? []).some((d) => d.n > 0);
  const totalSessions = (data?.sessionsOverTime ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            تحلیل‌ها
          </h1>
          <p className="text-xs text-muted-foreground">
            نمای عمیق پژوهشی: اثر بر حسب شرط، روند جلسات، زمان واکنش بلوک‌ها و دلایل حذف
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
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-72 md:col-span-2" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72 md:col-span-2" />
          <Skeleton className="h-72" />
          <Skeleton className="h-60" />
        </div>
      ) : !data ? null : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* ------------------------- 1) D by condition ------------------------- */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">اثر IAT بر حسب ترتیب شرط (A/B)</CardTitle>
              <CardDescription className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                شاخص نمایش‌داده‌شده normalizedD است: مثبت = تداعی قوی‌تر ایرانی+مثبت
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasDData ? (
                <div dir="ltr" className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.dByCondition} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="condition" tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={axisNum} width={48} />
                      <Tooltip
                        cursor={{ fill: "var(--accent)" }}
                        formatter={(value: number | string) => formatD(Number(value))}
                        labelFormatter={(label: string) => `Condition ${label}`}
                        contentStyle={{
                          direction: "ltr",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          background: "var(--popover)",
                        }}
                      />
                      <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                      <Bar dataKey="meanD" name="میانگین D" fill="var(--chart-1)" radius={4} maxBarSize={72} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 opacity-40" />
                  <p className="text-sm">هنوز جلسه تکمیل‌شده‌ای برای تحلیل وجود ندارد.</p>
                </div>
              )}
              <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>شرط</TableHead>
                      <TableHead className="text-center">n</TableHead>
                      <TableHead className="text-center">میانگین D</TableHead>
                      <TableHead className="text-center">SD</TableHead>
                      <TableHead className="text-center">میانه D</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.dByCondition.map((c) => (
                      <TableRow key={c.condition}>
                        <TableCell className="font-medium">
                          شرط {c.condition === "A" ? "A" : "B"}
                          <span className="block text-xs text-muted-foreground">
                            {c.condition === "A" ? "ایرانی+مثبت اول" : "ایرانی+منفی اول"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{toFa(c.n)}</TableCell>
                        <TableCell className="text-center font-mono" dir="ltr">{formatD(c.meanD)}</TableCell>
                        <TableCell className="text-center font-mono" dir="ltr">{formatD(c.sdD)}</TableCell>
                        <TableCell className="text-center font-mono" dir="ltr">{formatD(c.medianD)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* --------------------------- Quality metrics ------------------------- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                کیفیت داده
              </CardTitle>
              <CardDescription>میانگین در جلسات معتبر (improved-d 2003)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
                <p className="text-xs text-muted-foreground">میانگین نرخ خطا</p>
                <p className="text-2xl font-bold tabular-nums">{pct(data.quality.meanErrorRate)}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
                <p className="text-xs text-muted-foreground">میانگین نرخ پاسخ‌های سریع ({"<"}۳۰۰ms)</p>
                <p className="text-2xl font-bold tabular-nums">{pct(data.quality.meanFastResponseRate)}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-5">
                نرخ خطای بالا یا پاسخ‌های سریع زیاد نشانگر سهل‌انگاری یا عدم دقت شرکت‌کننده است و
                بر اعتبار D اثر می‌گذارد.
              </p>
            </CardContent>
          </Card>

          {/* ------------------------ 2) Sessions over time ---------------------- */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" />
                جلسه‌ها در گذر زمان (۳۰ روز اخیر)
              </CardTitle>
              <CardDescription>
                مجموع جلسات ایجادشده در بازه اخیر: {toFa(totalSessions)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {totalSessions > 0 ? (
                <div dir="ltr" className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.sessionsOverTime} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={dayTick}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        minTickGap={28}
                      />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={axisNum} width={40} />
                      <Tooltip
                        cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }}
                        formatter={(value: number | string) => [`${toFa(Number(value))} جلسه`, "تعداد"]}
                        labelFormatter={(label: string) => label}
                        contentStyle={{
                          direction: "ltr",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          background: "var(--popover)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        name="تعداد جلسات"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <LineChartIcon className="h-8 w-8 opacity-40" />
                  <p className="text-sm">در ۳۰ روز اخیر جلسه‌ای ایجاد نشده است.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ------------------------ 4) Exclusion reasons ----------------------- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FilterX className="h-4 w-4 text-primary" />
                دلایل حذف جلسات
              </CardTitle>
              <CardDescription>جلسات نامعتبر بر اساس معیارهای Greenwald et al. (2003)</CardDescription>
            </CardHeader>
            <CardContent>
              {data.exclusionReasons.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground text-center">
                  <ShieldCheck className="h-8 w-8 opacity-40" />
                  <p className="text-sm">دلیل حذفی ثبت نشده — همه جلسات تحلیل‌شده معتبر هستند.</p>
                </div>
              ) : (
                <ul className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
                  {data.exclusionReasons.map((r) => (
                    <li
                      key={r.reason}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
                    >
                      <span className="text-sm">{exclusionLabel(r.reason)}</span>
                      <Badge variant="secondary" className="tabular-nums shrink-0">
                        {toFa(r.count)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* --------------------------- 3) Block RTs ---------------------------- */}
          <Card className="md:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                زمان واکنش بر حسب بلوک بحرانی (B3/B4/B6/B7)
              </CardTitle>
              <CardDescription>
                میانگین کل پاسخ‌ها در برابر میانگین پاسخ‌های درست — فقط جلسات معتبر
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.blockRt.some((b) => (b.n ?? 0) > 0) ? (
                <>
                  <div dir="ltr" className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.blockRt} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="block" tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => toFa(v)}
                          width={48}
                          label={{ value: "ms", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--accent)" }}
                          formatter={(value: number | string) => formatMs(Number(value))}
                          contentStyle={{
                            direction: "ltr",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            background: "var(--popover)",
                          }}
                        />
                        <Legend
                          formatter={(value: string) => <span style={{ color: "var(--foreground)", fontSize: 12 }}>{value}</span>}
                        />
                        <Bar dataKey="meanRt" name="میانگین همه پاسخ‌ها" fill="var(--chart-1)" radius={4} maxBarSize={48} />
                        <Bar dataKey="meanRtCorrect" name="میانگین پاسخ‌های درست" fill="var(--chart-2)" radius={4} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>بلوک</TableHead>
                          <TableHead className="text-center">میانگین RT</TableHead>
                          <TableHead className="text-center">میانه RT</TableHead>
                          <TableHead className="text-center">میانگین RT درست</TableHead>
                          <TableHead className="text-center">n</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.blockRt.map((b) => (
                          <TableRow key={b.block}>
                            <TableCell className="font-mono text-xs font-semibold" dir="ltr">{b.block}</TableCell>
                            <TableCell className="text-center tabular-nums">{formatMs(b.meanRt)}</TableCell>
                            <TableCell className="text-center tabular-nums">{formatMs(b.medianRt)}</TableCell>
                            <TableCell className="text-center tabular-nums">{formatMs(b.meanRtCorrect)}</TableCell>
                            <TableCell className="text-center tabular-nums">{toFa(b.n)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Timer className="h-8 w-8 opacity-40" />
                  <p className="text-sm">هنوز آزمایش (trial) ثبت‌شده‌ای برای بلوک‌های بحرانی وجود ندارد.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
