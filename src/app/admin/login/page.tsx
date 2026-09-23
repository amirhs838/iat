"use client";

// =============================================================================
// /admin/login — rate-limited credential login (server-side hashing with
// scrypt; session cookie is httpOnly).
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlaskConical, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 429
            ? `تلاش‌های ناموفق بیش از حد. پس از ${Math.ceil((data.retryAfterSec ?? 60) / 60)} دقیقه دوباره تلاش کنید.`
            : res.status === 403
              ? "خطای امنیتی: درخواست رد شد. لطفاً صفحه را دوباره بارگذاری (رفرش) کنید و دوباره تلاش کنید."
              : "نام کاربری یا گذرواژه نادرست است.",
        );
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("خطای شبکه — دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardContent className="p-8 space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold">ورود پژوهشگر</h1>
            <p className="text-xs text-muted-foreground">داشبورد پژوهشی آزمون تداعی ضمنی</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">نام کاربری</Label>
              <Input
                id="username"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">گذرواژه</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "ورود"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
