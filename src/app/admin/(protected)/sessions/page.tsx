"use client";

// =============================================================================
// /admin/sessions — paginated session list with status/condition/validity
// filters, anonymous-ID search and dataset export (CSV / JSON).
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Eye, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ConditionBadge,
  DValue,
  EmptyState,
  ErrorState,
  SessionStatusBadge,
  TablePagination,
  TableSkeletonRows,
  ValidityBadge,
  fetchAdminJson,
  formatDateTimeFa,
  formatPercentFa,
} from "@/components/admin/AdminTableHelpers";
import { toFa } from "@/lib/format";

// -----------------------------------------------------------------------------
// API types (GET /api/admin/sessions)
// -----------------------------------------------------------------------------

interface SessionListItem {
  id: string;
  status: string;
  conditionOrder: string;
  blockOrder: string;
  randomSeed: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  fullscreenExitCount: number;
  visibilityChangeCount: number;
  exclusionReason: string | null;
  testVersion: { id: string; code: string; version: string };
  participant: { id: string; anonymousId: string; age: number | null; gender: string | null };
  score: {
    normalizedD: number | null;
    dScore: number | null;
    valid: boolean;
    errorRate: number | null;
    fastResponseRate: number | null;
  } | null;
  _count: { trials: number };
}

interface SessionsResponse {
  items: SessionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;
const COLUMN_COUNT = 11;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "COMPLETED", label: "تکمیل شده" },
  { value: "RUNNING", label: "در حال اجرا" },
  { value: "ABANDONED", label: "رهاشده" },
  { value: "INVALID", label: "نامعتبر" },
  { value: "PENDING_SYNC", label: "در انتظار همگام‌سازی" },
  { value: "CREATED", label: "ایجاد شده" },
];

const EXPORT_DATASETS: { value: string; label: string }[] = [
  { value: "participants", label: "شرکت‌کنندگان" },
  { value: "sessions", label: "جلسه‌ها" },
  { value: "trials", label: "داده خام آزمون‌ها" },
  { value: "scores", label: "نمرات" },
  { value: "full", label: "بسته کامل پژوهش" },
];

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function AdminSessionsPage() {
  const [status, setStatus] = useState("all");
  const [conditionOrder, setConditionOrder] = useState("all");
  const [validity, setValidity] = useState("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounced search (anonymous ID / session ID).
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      if (status !== "all") p.set("status", status);
      if (conditionOrder !== "all") p.set("conditionOrder", conditionOrder);
      if (validity !== "all") p.set("validity", validity);
      if (q) p.set("q", q);
      const res = await fetchAdminJson<SessionsResponse>(`/api/admin/sessions?${p.toString()}`);
      setData(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // redirecting to login
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [page, status, conditionOrder, validity, q]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const applyFilter = (apply: (v: string) => void) => (v: string) => {
    apply(v);
    setPage(1);
  };

  const exportUrl = (dataset: string, format: "csv" | "json") => {
    const p = new URLSearchParams({ format });
    if (conditionOrder !== "all") p.set("conditionOrder", conditionOrder);
    if (validity !== "all") p.set("validity", validity);
    return `/api/admin/export/${dataset}?${p.toString()}`;
  };

  const items = data?.items ?? [];
  const showEmpty = !loading && !error && items.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">جلسه‌ها</h1>
        <p className="text-sm text-muted-foreground">
          فهرست کامل جلسات آزمون همراه با وضعیت، شرط جابه‌جایی‌سازی و نمره D
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">فیلتر و جست‌وجو</CardTitle>
          <CardDescription>نتایج به‌صورت زنده به‌روزرسانی می‌شوند</CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  خروجی داده
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>قالب CSV</DropdownMenuLabel>
                {EXPORT_DATASETS.map((d) => (
                  <DropdownMenuItem key={`csv-${d.value}`} asChild>
                    <a href={exportUrl(d.value, "csv")} download>
                      {d.label}
                    </a>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>قالب JSON</DropdownMenuLabel>
                {EXPORT_DATASETS.map((d) => (
                  <DropdownMenuItem key={`json-${d.value}`} asChild>
                    <a href={exportUrl(d.value, "json")} download>
                      {d.label}
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>وضعیت</Label>
            <Select value={status} onValueChange={applyFilter(setStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ترتیب شرط</Label>
            <Select value={conditionOrder} onValueChange={applyFilter(setConditionOrder)}>
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
            <Select value={validity} onValueChange={applyFilter(setValidity)}>
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
            <Label htmlFor="session-search">جست‌وجو</Label>
            <div className="relative">
              <Search
                className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="session-search"
                type="search"
                dir="ltr"
                placeholder="P-XXXXXXX / session id"
                className="pe-8"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {error && !loading ? (
            <ErrorState message={error} onRetry={retry} />
          ) : (
            <>
              <div className="scrollbar-thin max-h-[70vh] overflow-y-auto rounded-md border">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>شرکت‌کننده</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead>شرط</TableHead>
                      <TableHead>نسخه آزمون</TableHead>
                      <TableHead>D نرمال‌شده</TableHead>
                      <TableHead>اعتبار</TableHead>
                      <TableHead>نرخ خطا</TableHead>
                      <TableHead>آزمون‌ها</TableHead>
                      <TableHead>دستگاه</TableHead>
                      <TableHead>تاریخ تکمیل</TableHead>
                      <TableHead>
                        <span className="sr-only">عملیات</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeletonRows rows={8} cols={COLUMN_COUNT} />
                    ) : showEmpty ? (
                      <TableRow>
                        <TableCell colSpan={COLUMN_COUNT}>
                          <EmptyState message="جلسه‌ای با این فیلترها یافت نشد" />
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div dir="ltr" className="font-mono text-xs font-medium">
                              {s.participant.anonymousId}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {s.participant.age !== null || s.participant.gender
                                ? [
                                    s.participant.gender ?? "",
                                    s.participant.age !== null ? `${toFa(s.participant.age)} سال` : "",
                                  ]
                                    .filter(Boolean)
                                    .join("، ")
                                : "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <SessionStatusBadge status={s.status} />
                          </TableCell>
                          <TableCell>
                            <ConditionBadge order={s.conditionOrder} />
                          </TableCell>
                          <TableCell>
                            <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                              {s.testVersion.code} v{s.testVersion.version}
                            </span>
                          </TableCell>
                          <TableCell>
                            <DValue value={s.score?.normalizedD ?? null} className="text-sm" />
                          </TableCell>
                          <TableCell>
                            {s.score ? (
                              <ValidityBadge valid={s.score.valid} />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">{formatPercentFa(s.score?.errorRate ?? null)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {toFa(s._count.trials)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {[s.deviceType, s.browser].filter(Boolean).join(" — ") || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">{formatDateTimeFa(s.completedAt)}</span>
                          </TableCell>
                          <TableCell>
                            <Button asChild variant="ghost" size="sm" className="gap-1.5">
                              <Link href={`/admin/sessions/${s.id}`}>
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                جزئیات
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {data ? (
                <div className="mt-4">
                  <TablePagination
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
                    onPageChange={setPage}
                    disabled={loading}
                  />
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
