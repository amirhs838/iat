"use client";

// =============================================================================
// /admin/settings — platform/test-version metadata, session status counts and
// the admin change-password form (client-side validation + server 401/422).
// =============================================================================

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatMs, toFa } from "@/lib/format";
import {
  Settings as SettingsIcon,
  AlertTriangle,
  RefreshCw,
  FlaskConical,
  KeyRound,
  ClipboardList,
  Layers,
  CheckCircle2,
} from "lucide-react";

type Exemplar = { key: string; label: string; n: number; type: string };

type SettingsResponse = {
  admin: string | null;
  currentTestVersion: {
    code: string;
    name: string;
    version: string;
    scoringVersion: string;
    blockStructure: string;
    block5TrialCount: number;
    scoring: {
      errorPenaltyMs: number;
      slowCutoffMs: number;
      fastThresholdMs: number;
      fastMaxProportion: number;
    };
    exemplars: { targets: Exemplar[]; attributes: Exemplar[] };
  };
  testVersions: {
    id: string;
    name: string;
    version: string;
    code: string;
    scoringVersion: string;
    blockStructure: string;
    active: boolean;
    createdAt: string;
  }[];
  sessionCounts: { status: string; count: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: "ایجادشده",
  RUNNING: "در حال اجرا",
  COMPLETED: "تکمیل‌شده",
  ABANDONED: "رهاشده",
  PENDING_SYNC: "در انتظار همگام‌سازی",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const dateFmt = new Intl.DateTimeFormat("fa-IR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDateFa(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return "—";
  }
}

function typeLabel(type: string): string {
  return type === "image" ? "تصویری" : "واژه";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // change-password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formErrors, setFormErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/settings", { signal: ac.signal });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SettingsResponse;
        setData(json);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("بارگذاری تنظیمات ناموفق بود.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void run();

    return () => ac.abort();
  }, [reloadTick]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    const errs: { current?: string; new?: string; confirm?: string } = {};
    if (!currentPassword) errs.current = "گذرواژه فعلی را وارد کنید.";
    if (newPassword.length < 10) errs.new = "گذرواژه جدید باید حداقل ۱۰ نویسه باشد.";
    if (confirmPassword !== newPassword || !confirmPassword)
      errs.confirm = "تکرار گذرواژه با گذرواژه جدید یکسان نیست.";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.status === 401) {
        setFormErrors({ current: "گذرواژه فعلی نادرست است یا نشست منقضی شده است." });
        return;
      }
      if (res.status === 422) {
        setFormErrors({ new: "گذرواژه جدید باید حداقل ۱۰ نویسه باشد." });
        return;
      }
      if (!res.ok) {
        setFormErrors({ confirm: "تغییر گذرواژه ناموفق بود — دوباره تلاش کنید." });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMsg("گذرواژه با موفقیت تغییر کرد.");
      toast({ title: "گذرواژه تغییر کرد", description: "گذرواژه جدید از اجرای بعدی فعال است." });
    } catch {
      setFormErrors({ confirm: "خطای شبکه — دوباره تلاش کنید." });
    } finally {
      setSubmitting(false);
    }
  };

  const ctv = data?.currentTestVersion;
  const totalSessions = (data?.sessionCounts ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            تنظیمات
          </h1>
          <p className="text-xs text-muted-foreground">
            نسخه آزمون، پارامترهای امتیازدهی و مدیریت گذرواژه
            {data?.admin ? ` — کاربر: ${data.admin}` : ""}
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : !data || !ctv ? null : (
        <div className="grid gap-4 items-start lg:grid-cols-2">
          {/* ------------------------- Current test version ------------------------ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                نسخه فعال آزمون
              </CardTitle>
              <CardDescription>{ctv.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[11px] text-muted-foreground">کد آزمون</p>
                  <p className="font-mono text-sm font-semibold" dir="ltr">{ctv.code}</p>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[11px] text-muted-foreground">نسخه آزمون</p>
                  <p className="font-mono text-sm font-semibold" dir="ltr">{ctv.version}</p>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[11px] text-muted-foreground">نسخه امتیازدهی</p>
                  <p className="font-mono text-sm font-semibold" dir="ltr">{ctv.scoringVersion}</p>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[11px] text-muted-foreground">ساختار بلوک‌ها (تعداد آزمایش)</p>
                  <p className="font-mono text-sm font-semibold" dir="ltr">{ctv.blockStructure}</p>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[11px] text-muted-foreground">آزمایش‌های بلوک ۵</p>
                  <p className="text-sm font-semibold tabular-nums">{toFa(ctv.block5TrialCount)}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-semibold">ثابت‌های امتیازدهی (Greenwald et al. 2003)</p>
                <div className="rounded-md border max-h-56 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>پارامتر</TableHead>
                        <TableHead className="text-center">مقدار</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>جریمه خطا (در بلوک‌های آزمایشی)</TableCell>
                        <TableCell className="text-center tabular-nums">{formatMs(ctv.scoring.errorPenaltyMs)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>آستانه حذف پاسخ‌های کند</TableCell>
                        <TableCell className="text-center tabular-nums">{formatMs(ctv.scoring.slowCutoffMs)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>آستانه پاسخ سریع</TableCell>
                        <TableCell className="text-center tabular-nums">{formatMs(ctv.scoring.fastThresholdMs)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>حداکثر نسبت مجاز پاسخ سریع</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {toFa(Math.round(ctv.scoring.fastMaxProportion * 100))}٪
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* --------------------------- Exemplar summary -------------------------- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                خلاصه نمونه‌ها (exemplars)
              </CardTitle>
              <CardDescription>دسته‌بندی محرک‌های نسخه فعال</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-y-auto scrollbar-thin rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-[1]">
                    <TableRow>
                      <TableHead>نقش</TableHead>
                      <TableHead>دسته</TableHead>
                      <TableHead>نوع</TableHead>
                      <TableHead className="text-center">تعداد نمونه</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ctv.exemplars.targets.map((t) => (
                      <TableRow key={t.key}>
                        <TableCell>
                          <Badge variant="secondary">هدف</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {t.label}
                          <span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">{t.key}</span>
                        </TableCell>
                        <TableCell>{typeLabel(t.type)}</TableCell>
                        <TableCell className="text-center tabular-nums">{toFa(t.n)}</TableCell>
                      </TableRow>
                    ))}
                    {ctv.exemplars.attributes.map((a) => (
                      <TableRow key={a.key}>
                        <TableCell>
                          <Badge variant="outline">ویژگی</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {a.label}
                          <span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">{a.key}</span>
                        </TableCell>
                        <TableCell>{typeLabel(a.type)}</TableCell>
                        <TableCell className="text-center tabular-nums">{toFa(a.n)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ----------------------------- Test versions --------------------------- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                تاریخچه نسخه‌های آزمون
              </CardTitle>
              <CardDescription>نسخه‌های ثبت‌شده در پایگاه داده</CardDescription>
            </CardHeader>
            <CardContent>
              {data.testVersions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">نسخه‌ای ثبت نشده است.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto scrollbar-thin rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-[1]">
                      <TableRow>
                        <TableHead>نام</TableHead>
                        <TableHead>کد</TableHead>
                        <TableHead className="text-center">نسخه</TableHead>
                        <TableHead className="text-center">امتیازدهی</TableHead>
                        <TableHead>ساختار</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                        <TableHead className="text-center">تاریخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.testVersions.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.name}</TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">{v.code}</TableCell>
                          <TableCell className="text-center font-mono text-xs" dir="ltr">{v.version}</TableCell>
                          <TableCell className="text-center font-mono text-xs" dir="ltr">{v.scoringVersion}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">{v.blockStructure}</TableCell>
                          <TableCell className="text-center">
                            {v.active ? (
                              <Badge>فعال</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">غیرفعال</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateFa(v.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* -------------------- Session counts + password form ------------------- */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">جلسات بر حسب وضعیت</CardTitle>
                <CardDescription>مجموع: {toFa(totalSessions)} جلسه</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.sessionCounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">هنوز جلسه‌ای ثبت نشده است.</p>
                  ) : (
                    data.sessionCounts.map((c) => (
                      <Badge key={c.status} variant="secondary" className="gap-1.5 px-3 py-1.5 text-xs">
                        {statusLabel(c.status)}
                        <span className="font-bold tabular-nums">{toFa(c.count)}</span>
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  تغییر گذرواژه
                </CardTitle>
                <CardDescription>حداقل ۱۰ نویسه — برای حساب «{data.admin ?? "admin"}»</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void submitPassword(e)} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">گذرواژه فعلی</Label>
                    <Input
                      id="current-password"
                      type="password"
                      dir="ltr"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                    {formErrors.current && <p className="text-xs text-destructive">{formErrors.current}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">گذرواژه جدید</Label>
                    <Input
                      id="new-password"
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    {formErrors.new && <p className="text-xs text-destructive">{formErrors.new}</p>}
                    {newPassword.length > 0 && newPassword.length < 10 && (
                      <p className="text-xs text-muted-foreground">{toFa(newPassword.length)} از ۱۰ نویسه</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">تکرار گذرواژه جدید</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    {formErrors.confirm && <p className="text-xs text-destructive">{formErrors.confirm}</p>}
                  </div>
                  {successMsg && (
                    <p className="flex items-center gap-1.5 text-sm text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      {successMsg}
                    </p>
                  )}
                  <Button type="submit" disabled={submitting} className="gap-2">
                    {submitting ? "در حال ثبت…" : "تغییر گذرواژه"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
