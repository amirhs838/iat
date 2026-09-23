"use client";

// =============================================================================
// /admin — Research dashboard: metric cards + D / RT / error-rate distributions
// with date, condition, validity and test-version filters.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Gauge,
  Percent,
  ShieldCheck,
  ShieldX,
  Timer,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  ErrorState,
  fetchAdminJson,
} from "@/components/admin/AdminTableHelpers";
import { StatCard } from "@/components/admin/StatCard";
import { formatMs, toFa } from "@/lib/format";

// -----------------------------------------------------------------------------
// API types (GET /api/admin/stats, GET /api/admin/settings)
// -----------------------------------------------------------------------------

interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

interface StatsResponse {
  cards: {
    totalParticipants: number;
    completedSessions: number;
    validSessions: number;
    invalidSessions: number;
    meanD: number | null;
    medianRt: number | null;
    completionRate: number | null;
  };
  charts: {
    dHistogram: HistogramBin[];
    rtHistogram: HistogramBin[];
    errorRateHistogram: HistogramBin[];
  };
}

interface TestVersionOption {
  id: string;
  code: string;
  version: string;
  active: boolean;
}

// -----------------------------------------------------------------------------
// Histogram card (bars only; wrapped in LTR for chart-internal layout safety)
// -----------------------------------------------------------------------------

function HistogramCard({
  title,
  description,
  bins,
  color,
  tickFormatter,
  withZeroLine = false,
}: {
  title: string;
  description?: string;
  bins: HistogramBin[];
  color: string;
  tickFormatter?: (value: number) => string;
  withZeroLine?: boolean;
}) {
  const hasData = bins.some((b) => b.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState message="با فیلترهای فعلی داده‌ای برای نمایش وجود ندارد" />
        ) : (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bins} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="start"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  minTickGap={24}
                  tickFormatter={(value: number) =>
                    tickFormatter ? tickFormatter(Number(value)) : String(value)
                  }
                />
                <YAxis
                  allowDecimals={false}
                  width={36}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.6 }}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                  formatter={(value) => [toFa(Number(value)), "تعداد"]}
                  labelFormatter={(_, payload) => {
                    const bin = payload?.[0]?.payload as HistogramBin | undefined;
                    return bin ? `بازه ${bin.start} تا ${bin.end}` : "";
                  }}
                />
                <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                {withZeroLine && bins.some((b) => b.start === 0) ? (
                  <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

const EMPTY_FILTERS = {
  from: "",
  to: "",
  conditionOrder: "all",
  validity: "all",
  testVersionId: "all",
} as const;

export default function AdminDashboardPage() {
  const [from, setFrom] = useState<string>(EMPTY_FILTERS.from);
  const [to, setTo] = useState<string>(EMPTY_FILTERS.to);
  const [conditionOrder, setConditionOrder] = useState<string>(EMPTY_FILTERS.conditionOrder);
  const [validity, setValidity] = useState<string>(EMPTY_FILTERS.validity);
  const [testVersionId, setTestVersionId] = useState<string>(EMPTY_FILTERS.testVersionId);

  const [versions, setVersions] = useState<TestVersionOption[]>([]);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const filtersActive =
    from !== "" || to !== "" || conditionOrder !== "all" || validity !== "all" || testVersionId !== "all";

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", `${from}T00:00:00.000`);
    if (to) p.set("to", `${to}T23:59:59.999`);
    if (conditionOrder !== "all") p.set("conditionOrder", conditionOrder);
    if (validity !== "all") p.set("validity", validity);
    if (testVersionId !== "all") p.set("testVersionId", testVersionId);
    return p.toString();
  }, [from, to, conditionOrder, validity, testVersionId]);

  // Test versions for the version filter (single fetch).
  useEffect(() => {
    let cancelled = false;
    fetchAdminJson<{ testVersions: TestVersionOption[] }>("/api/admin/settings")
      .then((res) => {
        if (!cancelled) setVersions(res.testVersions);
      })
      .catch(() => {
        /* version filter stays empty; dashboard data still loads */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = queryString ? `?${queryString}` : "";
      const res = await fetchAdminJson<StatsResponse>(`/api/admin/stats${qs}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadStats();
  }, [loadStats, reloadKey]);

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const resetFilters = useCallback(() => {
    setFrom(EMPTY_FILTERS.from);
    setTo(EMPTY_FILTERS.to);
    setConditionOrder(EMPTY_FILTERS.conditionOrder);
    setValidity(EMPTY_FILTERS.validity);
    setTestVersionId(EMPTY_FILTERS.testVersionId);
  }, []);

  const cards = data?.cards;
  const charts = data?.charts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">داشبورد پژوهش</h1>
        <p className="text-sm text-muted-foreground">
          نمای کلی جلسه‌ها، نمرات D و توزیع‌های زمان پاسخ — بر اساس الگوریتم بهبودیافته گرینوالد و همکاران (۲۰۰۳)
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4 pt-0">
          <div className="flex items-center justify-between gap-2 pt-6">
            <h2 className="text-sm font-semibold">فیلترها</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              disabled={!filtersActive}
              className="text-xs"
            >
              حذف فیلترها
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="filter-from">از تاریخ</Label>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-to">تا تاریخ</Label>
              <Input
                id="filter-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ترتیب شرط</Label>
              <Select value={conditionOrder} onValueChange={setConditionOrder}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه شرط‌ها</SelectItem>
                  <SelectItem value="A">شرط A</SelectItem>
                  <SelectItem value="B">شرط B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>اعتبار</Label>
              <Select value={validity} onValueChange={setValidity}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="valid">معتبر</SelectItem>
                  <SelectItem value="invalid">نامعتبر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نسخه آزمون</Label>
              <Select value={testVersionId} onValueChange={setTestVersionId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه نسخه‌ها</SelectItem>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span dir="ltr">
                        {v.code} — v{v.version}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && !loading ? (
        <Card>
          <CardContent className="pt-0">
            <ErrorState message={error} onRetry={retry} />
          </CardContent>
        </Card>
      ) : null}

      {/* Metric cards */}
      {error && !loading ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="شرکت‌کنندگان"
            value={cards ? toFa(cards.totalParticipants) : ""}
            icon={Users}
            sub="کل شرکت‌کنندگان ثبت‌شده"
            loading={loading}
          />
          <StatCard
            title="جلسات تکمیل‌شده"
            value={cards ? toFa(cards.completedSessions) : ""}
            icon={CheckCircle2}
            sub="با فیلترهای فعلی"
            loading={loading}
          />
          <StatCard
            title="جلسات معتبر"
            value={cards ? toFa(cards.validSessions) : ""}
            icon={ShieldCheck}
            sub="بر اساس معیارهای حذف ۲۰۰۳"
            loading={loading}
          />
          <StatCard
            title="جلسات نامعتبر"
            value={cards ? toFa(cards.invalidSessions) : ""}
            icon={ShieldX}
            sub="نرخ خطا یا پاسخ‌های سریع بیش از حد"
            loading={loading}
          />
          <StatCard
            title="میانگین D نرمال‌شده"
            value={
              cards ? (
                <span dir="ltr" className="font-mono">
                  {cards.meanD === null ? "—" : cards.meanD.toFixed(3)}
                </span>
              ) : (
                ""
              )
            }
            icon={Gauge}
            sub="مثبت = تداعی قوی‌تر ایرانی+مثبت"
            loading={loading}
          />
          <StatCard
            title="میانه زمان پاسخ"
            value={cards ? (cards.medianRt === null ? "—" : formatMs(cards.medianRt)) : ""}
            icon={Timer}
            sub="میلی‌ثانیه — پاسخ‌های درست جلسات معتبر"
            loading={loading}
          />
          <StatCard
            title="نرخ تکمیل"
            value={
              cards ? (
                cards.completionRate === null ? (
                  "—"
                ) : (
                  `${toFa(Math.round(cards.completionRate * 100))}٪`
                )
              ) : (
                ""
              )
            }
            icon={Percent}
            sub="تکمیل‌شده ÷ (تکمیل‌شده + رهاشده)"
            loading={loading}
          />
        </div>
      )}

      {/* Charts */}
      {error && !loading ? null : (
        <div className="space-y-4">
          {loading && !charts ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-40" aria-hidden="true" />
                    <Skeleton className="h-3.5 w-56" aria-hidden="true" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[260px] w-full" aria-hidden="true" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : charts ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <HistogramCard
                title="توزیع نمره D نرمال‌شده"
                description="جلسات معتبر؛ مثبت = تداعی قوی‌تر ایرانی+مثبت"
                bins={charts.dHistogram}
                color="var(--chart-1)"
                withZeroLine
              />
              <HistogramCard
                title="توزیع زمان پاسخ"
                description="پاسخ‌های درست جلسات معتبر (۲۰۰ تا ۲۰۰۰ میلی‌ثانیه)"
                bins={charts.rtHistogram}
                color="var(--chart-2)"
                tickFormatter={(v) => String(Math.round(v))}
              />
              <HistogramCard
                title="توزیع نرخ خطا"
                description="جلسات معتبر؛ نسبت پاسخ‌های نادرست اولیه"
                bins={charts.errorRateHistogram}
                color="var(--chart-3)"
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
