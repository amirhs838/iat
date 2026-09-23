"use client";

// =============================================================================
// AdminTableHelpers — small shared building blocks for the admin pages:
// auth-aware fetch, status/validity/condition badges, Persian date formatting,
// D-score display, table pagination, empty/error states, skeleton rows.
// =============================================================================

import { ChevronLeft, ChevronRight, Inbox, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { toFa } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Auth-aware JSON fetch — 401 redirects to the admin login page.
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchAdminJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("خطای شبکه — اتصال به سرور برقرار نشد.", 0);
  }
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new ApiError("نشست منقضی شده — در حال انتقال به صفحه ورود…", 401);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `خطای سرور (کد ${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Badges — session status, score validity, counterbalancing condition.
// ---------------------------------------------------------------------------

export const SESSION_STATUS_LABELS: Record<string, string> = {
  CREATED: "ایجاد شده",
  RUNNING: "در حال اجرا",
  COMPLETED: "تکمیل شده",
  ABANDONED: "رهاشده",
  INVALID: "نامعتبر",
  PENDING_SYNC: "در انتظار همگام‌سازی",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  CREATED: "border-transparent bg-muted text-muted-foreground",
  RUNNING: "border-transparent bg-secondary text-secondary-foreground",
  COMPLETED: "border-transparent bg-primary/10 text-primary",
  ABANDONED: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function SessionStatusBadge({ status }: { status: string }) {
  const label = SESSION_STATUS_LABELS[status] ?? status;
  if (status === "INVALID") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (status === "PENDING_SYNC") {
    return <Badge variant="outline">{label}</Badge>;
  }
  return <Badge className={STATUS_BADGE_CLASS[status] ?? ""}>{label}</Badge>;
}

export function ValidityBadge({ valid }: { valid: boolean }) {
  return valid ? (
    <Badge className="border-transparent bg-primary/10 text-primary">معتبر</Badge>
  ) : (
    <Badge variant="destructive">نامعتبر</Badge>
  );
}

export function conditionLabel(order: string): string {
  return order === "B" ? "شرط B: ایرانی+منفی در بلوک ۳-۴" : "شرط A: ایرانی+مثبت در بلوک ۳-۴";
}

export function ConditionBadge({ order }: { order: string }) {
  return (
    <Badge variant="outline" className="font-normal" title={conditionLabel(order)}>
      شرط {order === "B" ? "B" : "A"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Category / block-kind labels (Persian display of config keys).
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, string> = {
  iranian: "ایرانی",
  afghan: "افغان",
  positive: "مثبت",
  negative: "منفی",
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export const BLOCK_KIND_LABELS: Record<string, string> = {
  "target-discrimination": "طبقه‌بندی هدف",
  "attribute-discrimination": "طبقه‌بندی صفت",
  combined: "ترکیبی",
  "target-discrimination-reversed": "طبقه‌بندی هدف (معکوس)",
  "combined-reversed": "ترکیبی (معکوس)",
};

export function blockKindLabel(kind: string): string {
  return BLOCK_KIND_LABELS[kind] ?? kind;
}

// ---------------------------------------------------------------------------
// Formatting — dates (Persian calendar) and D-scores (scientific, LTR).
// ---------------------------------------------------------------------------

const dateTimeFmt = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
const dateFmt = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" });

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTimeFa(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}

export function formatDateFa(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

/** D-scores: 3 decimals, LTR, monospace (scientific presentation). */
export function DValue({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <span dir="ltr" className={cn("font-mono text-xs", className)}>
      {value === null || value === undefined ? "—" : value.toFixed(3)}
    </span>
  );
}

/** Proportion (0..1) → percentage with Persian digits, e.g. "۱۲.۵٪". */
export function formatPercentFa(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${toFa((rate * 100).toFixed(1))}٪`;
}

// ---------------------------------------------------------------------------
// Pagination controls (RTL: «قبلی» on the right, «بعدی» on the left).
// ---------------------------------------------------------------------------

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        مجموع {toFa(total)} رکورد — صفحه {toFa(page)} از {toFa(totalPages)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          قبلی
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          بعدی
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / error / loading states.
// ---------------------------------------------------------------------------

export function EmptyState({ message = "داده‌ای موجود نیست" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="gap-2" onClick={onRetry}>
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
        تلاش دوباره
      </Button>
    </div>
  );
}

/** Placeholder rows rendered inside a <TableBody> while loading. */
export function TableSkeletonRows({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-5 w-full" aria-hidden="true" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Key–value item for detail pages.
// ---------------------------------------------------------------------------

export function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

/** Safely parse a JSON array column (qualityFlags / flags). */
export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
