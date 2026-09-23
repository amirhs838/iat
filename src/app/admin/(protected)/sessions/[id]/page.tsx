"use client";

// =============================================================================
// /admin/sessions/[id] — full session detail: metadata, quality indicators,
// both scoring-algorithm rows, per-block performance and the raw trial table.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Clock, Eye, Flag, Maximize2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  DValue,
  EmptyState,
  ErrorState,
  InfoItem,
  SessionStatusBadge,
  ValidityBadge,
  blockKindLabel,
  categoryLabel,
  conditionLabel,
  fetchAdminJson,
  formatDateTimeFa,
  formatPercentFa,
  parseJsonArray,
} from "@/components/admin/AdminTableHelpers";
import { formatMs, toFa } from "@/lib/format";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// API types (GET /api/admin/sessions/[id])
// -----------------------------------------------------------------------------

interface SessionDetail {
  id: string;
  participantId: string;
  testVersionId: string;
  conditionOrder: string;
  blockOrder: string;
  randomSeed: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  userAgent: string | null;
  browser: string | null;
  browserVersion: string | null;
  operatingSystem: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  deviceType: string | null;
  language: string | null;
  fullscreenExitCount: number;
  fullscreenDenied: boolean;
  visibilityChangeCount: number;
  awayDurationMs: number;
  exclusionReason: string | null;
  qualityFlags: string | null;
  createdAt: string;
  updatedAt: string;
  participant: {
    id: string;
    anonymousId: string;
    age: number | null;
    gender: string | null;
    education: string | null;
    province: string | null;
    consent: boolean;
    consentAt: string | null;
    createdAt: string;
  };
  testVersion: {
    id: string;
    code: string;
    version: string;
    name: string;
    scoringVersion: string;
    blockStructure: string;
  };
}

interface BlockSummary {
  number: number;
  kind: string;
  trialCount: number;
  isCritical: boolean;
  leftLabel?: string;
  rightLabel?: string;
  leftKey?: string;
  rightKey?: string;
}

interface ScoreRow {
  id: string;
  scoringAlgorithm: string;
  scoringVersion: string;
  dScore: number | null;
  normalizedD: number | null;
  d1: number | null;
  d2: number | null;
  b3Mean: number | null;
  b4Mean: number | null;
  b6Mean: number | null;
  b7Mean: number | null;
  pooledSdPractice: number | null;
  pooledSdTest: number | null;
  errorRate: number | null;
  fastResponseRate: number | null;
  valid: boolean;
  exclusionReason: string | null;
  qualityFlags: string | null;
  statsJson: string | null;
  computedAt: string;
}

interface BlockStat {
  blockNumber: number;
  trials: number;
  errors: number;
  meanRt: number | null;
  medianRt: number | null;
  sdRt: number | null;
  meanRtCorrect: number | null;
}

interface TrialRow {
  id: string;
  globalTrialNumber: number;
  blockNumber: number;
  trialNumberInBlock: number;
  stimulusId: string;
  stimulusPath: string;
  stimulusType: string;
  stimulusCategory: string;
  correctKey: string;
  responseKey: string | null;
  correct: boolean;
  rt: number | null;
  correctionRt: number | null;
  errorCount: number;
  timestamp: number;
  flags: string | null;
}

interface DetailResponse {
  session: SessionDetail;
  blocksSummary: BlockSummary[] | null;
  scores: ScoreRow[];
  blockStats: BlockStat[];
  trials: TrialRow[];
}

// -----------------------------------------------------------------------------
// Small presentational helpers (page-local)
// -----------------------------------------------------------------------------

function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn("font-mono text-xs", className)}>
      {children}
    </span>
  );
}

function KeyBadge({ k }: { k: string | null }) {
  if (!k) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className="font-mono">
      {k}
    </Badge>
  );
}

function FlagBadges({ flags }: { flags: string[] }) {
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {flags.map((f) => (
        <Badge key={f} variant="outline" className="font-mono text-[10px]" dir="ltr">
          {f}
        </Badge>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function AdminSessionDetailPage() {
  const params = useParams() as { id?: string | string[] };
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const id = rawId ?? "";

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetchAdminJson<DetailResponse>(`/api/admin/sessions/${encodeURIComponent(id)}`);
      setData(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
      } else if (e instanceof ApiError && e.status === 401) {
        return; // redirecting to login
      } else {
        setError(e instanceof Error ? e.message : "خطای ناشناخته");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------

  if (!id) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">شناسه جلسه نامعتبر است.</p>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/admin/sessions">
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            بازگشت به جلسه‌ها
          </Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-52" aria-hidden="true" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" aria-hidden="true" />
          <Skeleton className="h-72" aria-hidden="true" />
        </div>
        <Skeleton className="h-48" aria-hidden="true" />
        <Skeleton className="h-64" aria-hidden="true" />
        <Skeleton className="h-96" aria-hidden="true" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent>
            <EmptyState message="جلسه موردنظر یافت نشد" />
          </CardContent>
        </Card>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/admin/sessions">
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            بازگشت به جلسه‌ها
          </Link>
        </Button>
      </div>
    );
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={retry} />;
  }

  if (!data) return null;

  // ---------------------------------------------------------------------------
  // Data shaping
  // ---------------------------------------------------------------------------

  const s = data.session;
  const p = s.participant;
  const blockSummaries = new Map<number, BlockSummary>(
    (data.blocksSummary ?? []).map((b) => [b.number, b]),
  );
  const sessionFlags = parseJsonArray(s.qualityFlags);

  const scores = [...data.scores].sort((a, b) =>
    a.scoringAlgorithm === "improved-d-2003" ? -1 : b.scoringAlgorithm === "improved-d-2003" ? 1 : 0,
  );

  const rtMeans = (row: ScoreRow) => [row.b3Mean, row.b4Mean, row.b6Mean, row.b7Mean];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/admin/sessions" aria-label="بازگشت به جلسه‌ها">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            بازگشت
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">
          جلسه <Mono className="text-base">{s.id.slice(0, 8)}…</Mono>
        </h1>
        <SessionStatusBadge status={s.status} />
      </div>

      {/* Info + quality */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">اطلاعات جلسه</CardTitle>
            <CardDescription>فراداده، شرکت‌کننده و محیط آزمایش</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3">
            <InfoItem label="شناسه ناشناس">
              <Mono className="text-sm font-medium">{p.anonymousId}</Mono>
            </InfoItem>
            <InfoItem label="نسخه آزمون">
              <span>
                <Mono>{s.testVersion.code}</Mono>{" "}
                <span className="text-xs text-muted-foreground">v{s.testVersion.version}</span>
              </span>
            </InfoItem>
            <InfoItem label="شرط جابه‌جایی‌سازی">{conditionLabel(s.conditionOrder)}</InfoItem>
            <InfoItem label="جمعیت‌شناسی">
              {[
                p.gender ?? "",
                p.age !== null ? `${toFa(p.age)} سال` : "",
                p.education ?? "",
              ]
                .filter(Boolean)
                .join("، ") || "—"}
            </InfoItem>
            <InfoItem label="رضایت آگاهانه">
              {p.consent ? `ثبت شده${p.consentAt ? ` — ${formatDateTimeFa(p.consentAt)}` : ""}` : "—"}
            </InfoItem>
            <InfoItem label="ساختار بلوک‌ها">
              <Mono>{s.testVersion.blockStructure}</Mono>
            </InfoItem>
            <InfoItem label="شروع">{formatDateTimeFa(s.startedAt)}</InfoItem>
            <InfoItem label="تکمیل">{formatDateTimeFa(s.completedAt)}</InfoItem>
            <InfoItem label="ایجاد / رهاشدن">
              <span className="text-xs">
                {formatDateTimeFa(s.createdAt)}
                {s.abandonedAt ? ` / ${formatDateTimeFa(s.abandonedAt)}` : ""}
              </span>
            </InfoItem>
            <InfoItem label="مرورگر / سیستم‌عامل">
              <span className="text-xs">
                {[s.browser, s.browserVersion].filter(Boolean).join(" ") || "—"}
                {s.operatingSystem ? ` — ${s.operatingSystem}` : ""}
              </span>
            </InfoItem>
            <InfoItem label="نوع دستگاه">
              {s.deviceType ?? "—"}
            </InfoItem>
            <InfoItem label="ابعاد صفحه">
              {s.screenWidth !== null && s.screenHeight !== null ? (
                <span>
                  {toFa(s.screenWidth)} × {toFa(s.screenHeight)}
                </span>
              ) : (
                "—"
              )}
            </InfoItem>
            <div className="col-span-2 space-y-1 md:col-span-3">
              <p className="text-xs text-muted-foreground">
                ترتیب بلوک‌ها / بذر تصادفی / زبان
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <Mono>{s.blockOrder}</Mono>
                <Mono className="text-muted-foreground">seed: {s.randomSeed}</Mono>
                <Mono className="text-muted-foreground">lang: {s.language ?? "—"}</Mono>
              </div>
            </div>
            {s.userAgent ? (
              <div className="col-span-2 space-y-1 md:col-span-3">
                <p className="text-xs text-muted-foreground">User-Agent</p>
                <p dir="ltr" className="break-all font-mono text-[11px] leading-4 text-muted-foreground">
                  {s.userAgent}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">کیفیت اجرا</CardTitle>
            <CardDescription>شاخص‌های دقت داده (بدون دستکاری زمان‌ها)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <Maximize2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  خروج از تمام‌صفحه
                </span>
                <span className="font-semibold">{toFa(s.fullscreenExitCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  تغییر تب / پنجره
                </span>
                <span className="font-semibold">{toFa(s.visibilityChangeCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  مدت غیبت
                </span>
                <span className="font-semibold">{formatMs(s.awayDurationMs)}</span>
              </div>
              {s.fullscreenDenied ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">درخواست تمام‌صفحه رد شد</span>
                  <Badge variant="destructive">بله</Badge>
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                پرچم‌های کیفیت جلسه
              </p>
              <FlagBadges flags={sessionFlags} />
            </div>
            {s.exclusionReason ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">دلیل حذف در سطح جلسه</p>
                <p className="text-sm font-medium text-destructive">{s.exclusionReason}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Scores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">نمرات</CardTitle>
          <CardDescription>
            هر دو الگوریتم امتیازدهی در کنار هم — تحلیل پژوهشی فقط بر «بهبودیافته ۲۰۰۳» تکیه دارد
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scores.length === 0 ? (
            <EmptyState message="برای این جلسه نمره‌ای محاسبه نشده است" />
          ) : (
            <div className="scrollbar-thin overflow-x-auto rounded-md border">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>الگوریتم</TableHead>
                    <TableHead>D رویه‌ای</TableHead>
                    <TableHead>D نرمال‌شده</TableHead>
                    <TableHead>D1 (B6−B3)</TableHead>
                    <TableHead>D2 (B7−B4)</TableHead>
                    <TableHead>B3</TableHead>
                    <TableHead>B4</TableHead>
                    <TableHead>B6</TableHead>
                    <TableHead>B7</TableHead>
                    <TableHead>SD تمرین</TableHead>
                    <TableHead>SD آزمون</TableHead>
                    <TableHead>نرخ خطا</TableHead>
                    <TableHead>پاسخ سریع</TableHead>
                    <TableHead>اعتبار</TableHead>
                    <TableHead>دلیل حذف</TableHead>
                    <TableHead>محاسبه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((row) => {
                    const isReference = row.scoringAlgorithm === "improved-d-2003";
                    return (
                      <TableRow key={row.id} className={cn(isReference && "bg-primary/5")}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Mono className="text-xs font-medium">{row.scoringAlgorithm}</Mono>
                            {isReference ? (
                              <Badge className="border-transparent bg-primary/10 text-primary">
                                مرجع
                              </Badge>
                            ) : (
                              <Badge variant="outline">مرجع/قدیمی</Badge>
                            )}
                          </div>
                          <div className="mt-0.5">
                            <Mono className="text-muted-foreground">{row.scoringVersion}</Mono>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DValue value={row.dScore} className="text-sm" />
                        </TableCell>
                        <TableCell>
                          <DValue
                            value={row.normalizedD}
                            className="text-sm font-semibold text-primary"
                          />
                        </TableCell>
                        <TableCell>
                          <DValue value={row.d1} />
                        </TableCell>
                        <TableCell>
                          <DValue value={row.d2} />
                        </TableCell>
                        {rtMeans(row).map((v, i) => (
                          <TableCell key={i} className="text-xs">
                            {formatMs(v)}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs">
                          <Mono>{row.pooledSdPractice === null ? "—" : toFa(Math.round(row.pooledSdPractice))}</Mono>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Mono>{row.pooledSdTest === null ? "—" : toFa(Math.round(row.pooledSdTest))}</Mono>
                        </TableCell>
                        <TableCell className="text-xs">{formatPercentFa(row.errorRate)}</TableCell>
                        <TableCell className="text-xs">{formatPercentFa(row.fastResponseRate)}</TableCell>
                        <TableCell>
                          <ValidityBadge valid={row.valid} />
                        </TableCell>
                        <TableCell className="max-w-40 text-xs text-muted-foreground">
                          {row.exclusionReason ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTimeFa(row.computedAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">عملکرد بلوک‌ها</CardTitle>
          <CardDescription>
            آمار توصیفی هر بلوک (B1 تا B7) — بلوک‌های بحرانی برای محاسبه D مشخص شده‌اند
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scrollbar-thin overflow-x-auto rounded-md border">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>بلوک</TableHead>
                  <TableHead>نوع وظیفه</TableHead>
                  <TableHead>سمت چپ (E)</TableHead>
                  <TableHead>سمت راست (I)</TableHead>
                  <TableHead>تعداد</TableHead>
                  <TableHead>خطا</TableHead>
                  <TableHead>میانگین RT</TableHead>
                  <TableHead>میانه RT</TableHead>
                  <TableHead>انحراف معیار</TableHead>
                  <TableHead>میانگین RT درست</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.blockStats.map((b) => {
                  const info = blockSummaries.get(b.blockNumber);
                  return (
                    <TableRow key={b.blockNumber}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">B{toFa(b.blockNumber)}</span>
                          {info?.isCritical ? (
                            <Badge className="border-transparent bg-primary/10 text-primary">بحرانی</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{info ? blockKindLabel(info.kind) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {info?.leftLabel ?? "—"} <KeyBadge k={info?.leftKey ?? null} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {info?.rightLabel ?? "—"} <KeyBadge k={info?.rightKey ?? null} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {toFa(b.trials)}
                        {info ? (
                          <span className="text-muted-foreground"> / {toFa(info.trialCount)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {toFa(b.errors)}
                        {b.trials > 0 ? (
                          <span className="text-muted-foreground"> ({formatPercentFa(b.errors / b.trials)})</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">{formatMs(b.meanRt)}</TableCell>
                      <TableCell className="text-xs">{formatMs(b.medianRt)}</TableCell>
                      <TableCell className="text-xs">{formatMs(b.sdRt)}</TableCell>
                      <TableCell className="text-xs">{formatMs(b.meanRtCorrect)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Trials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            آزمون‌ها (داده خام) — {toFa(data.trials.length)} ردیف
          </CardTitle>
          <CardDescription>
            داده‌های ثبت‌شده توسط مرورگر، بدون هیچ تغییری — به ترتیب اجرا
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.trials.length === 0 ? (
            <EmptyState message="هیچ آزمونی برای این جلسه ثبت نشده است" />
          ) : (
            <div className="scrollbar-thin max-h-96 overflow-y-auto rounded-md border">
              <Table className="min-w-[820px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>بلوک</TableHead>
                    <TableHead>محرک</TableHead>
                    <TableHead>دسته محرک</TableHead>
                    <TableHead>کلید درست</TableHead>
                    <TableHead>پاسخ</TableHead>
                    <TableHead>نتیجه</TableHead>
                    <TableHead>RT (ms)</TableHead>
                    <TableHead>پرچم‌ها</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.trials.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{toFa(t.globalTrialNumber)}</TableCell>
                      <TableCell className="text-xs">B{toFa(t.blockNumber)}</TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-2"
                          title={`${t.stimulusId} (${t.stimulusType})`}
                        >
                          {t.stimulusType === "image" ? (
                            <img
                              src={t.stimulusPath}
                              alt={`محرک ${t.stimulusId}`}
                              className="h-8 w-8 rounded border bg-muted/30 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-sm">{t.stimulusPath}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{categoryLabel(t.stimulusCategory)}</TableCell>
                      <TableCell>
                        <KeyBadge k={t.correctKey} />
                      </TableCell>
                      <TableCell>
                        <KeyBadge k={t.responseKey} />
                      </TableCell>
                      <TableCell>
                        {t.correct ? (
                          <Badge className="border-transparent bg-primary/10 text-primary">درست</Badge>
                        ) : (
                          <Badge variant="destructive">غلط</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatMs(t.rt)}</TableCell>
                      <TableCell>
                        <FlagBadges flags={parseJsonArray(t.flags)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
