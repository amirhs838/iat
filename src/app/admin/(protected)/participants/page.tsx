"use client";

// =============================================================================
// /admin/participants — paginated participant registry.
// Columns: anonymous ID (mono), demographics, consent badge, join date,
// session counts. Search by anonymous ID, server-side pagination.
// =============================================================================

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toFa } from "@/lib/format";
import { Users, Search, ChevronRight, ChevronLeft, AlertTriangle, RefreshCw } from "lucide-react";

type ParticipantRow = {
  id: string;
  anonymousId: string;
  age: number | null;
  gender: string | null;
  education: string | null;
  province: string | null;
  consent: boolean;
  consentAt: string | null;
  createdAt: string;
  sessionCount: number;
  completedCount: number;
};

type ParticipantsResponse = {
  items: ParticipantRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 25;

const dateFmt = new Intl.DateTimeFormat("fa-IR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateFa(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return "—";
  }
}

export default function ParticipantsPage() {
  const [data, setData] = useState<ParticipantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedQ) params.set("q", debouncedQ);

      try {
        const res = await fetch(`/api/admin/participants?${params.toString()}`, { signal: ac.signal });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ParticipantsResponse;
        setData(json);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("بارگذاری فهرست شرکت‌کنندگان ناموفق بود.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void run();

    return () => ac.abort();
  }, [page, debouncedQ, reloadTick]);

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];

  const retry = () => {
    setPage(1);
    setReloadTick((t) => t + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            شرکت‌کنندگان
          </h1>
          <p className="text-xs text-muted-foreground">
            فهرست شرکت‌کنندگان با اطلاعات جمعیت‌شناختی و وضعیت رضایت آگاهانه
            {total > 0 ? ` — مجموع: ${toFa(total)} نفر` : ""}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی شناسه ناشناس…"
            className="pr-9"
            aria-label="جستجوی شرکت‌کننده بر اساس شناسه ناشناس"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">ثبت‌نام‌ها</CardTitle>
          <CardDescription>
            {loading
              ? "در حال بارگذاری…"
              : error
                ? "خطا در دریافت داده‌ها"
                : items.length === 0
                  ? "موردی یافت نشد"
                  : `صفحه ${toFa(page)} از ${toFa(totalPages)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={retry} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                تلاش مجدد
              </Button>
            </div>
          ) : (
            <>
              <div className="max-h-[70vh] overflow-y-auto scrollbar-thin rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-[1]">
                    <TableRow>
                      <TableHead>شناسه ناشناس</TableHead>
                      <TableHead className="text-center">سن</TableHead>
                      <TableHead>جنسیت</TableHead>
                      <TableHead>تحصیلات</TableHead>
                      <TableHead>استان</TableHead>
                      <TableHead className="text-center">رضایت</TableHead>
                      <TableHead>تاریخ عضویت</TableHead>
                      <TableHead className="text-center">جلسه‌ها</TableHead>
                      <TableHead className="text-center">تکمیل‌شده</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={`sk-${i}`}>
                            {Array.from({ length: 9 }).map((__, j) => (
                              <TableCell key={`sk-${i}-${j}`}>
                                <Skeleton className="h-4 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      : items.length === 0
                        ? (
                          <TableRow>
                            <TableCell colSpan={9} className="h-40 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Users className="h-8 w-8 opacity-40" />
                                <p className="text-sm">
                                  {debouncedQ
                                    ? `شرکت‌کننده‌ای با شناسه «${debouncedQ}» یافت نشد.`
                                    : "هنوز شرکت‌کننده‌ای ثبت نشده است."}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                        : items.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-mono text-xs font-semibold" dir="ltr">
                                {p.anonymousId}
                              </TableCell>
                              <TableCell className="text-center">
                                {p.age !== null ? toFa(p.age) : "—"}
                              </TableCell>
                              <TableCell>{p.gender ?? "—"}</TableCell>
                              <TableCell>{p.education ?? "—"}</TableCell>
                              <TableCell>{p.province ?? "—"}</TableCell>
                              <TableCell className="text-center">
                                {p.consent ? (
                                  <Badge className="gap-1" title={p.consentAt ? formatDateFa(p.consentAt) : undefined}>
                                    ثبت‌شده
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    ثبت‌نشده
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDateFa(p.createdAt)}
                              </TableCell>
                              <TableCell className="text-center tabular-nums">{toFa(p.sessionCount)}</TableCell>
                              <TableCell className="text-center tabular-nums">{toFa(p.completedCount)}</TableCell>
                            </TableRow>
                          ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {total > 0
                    ? `نمایش ${toFa((page - 1) * pageSize + 1)}–${toFa(Math.min(page * pageSize, total))} از ${toFa(total)} نفر`
                    : "—"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={loading || page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                    قبلی
                  </Button>
                  <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
                    {toFa(page)} / {toFa(totalPages)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={loading || page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    بعدی
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
