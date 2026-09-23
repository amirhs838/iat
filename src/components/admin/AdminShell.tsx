"use client";

// =============================================================================
// AdminShell — RTL sidebar (right side), top header, logout.
// Professional, minimal research-dashboard chrome.
// =============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  BarChart3,
  Images,
  Settings,
  LogOut,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "داشبورد", icon: LayoutDashboard, exact: true },
  { href: "/admin/sessions", label: "جلسه‌ها", icon: ListChecks },
  { href: "/admin/participants", label: "شرکت‌کنندگان", icon: Users },
  { href: "/admin/analytics", label: "تحلیل‌ها", icon: BarChart3 },
  { href: "/admin/stimuli", label: "محرک‌ها", icon: Images },
  { href: "/admin/settings", label: "تنظیمات", icon: Settings },
];

export function AdminShell({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen flex flex-row-reverse" dir="rtl">
      {/* Sidebar — physical right side in RTL */}
      <aside className="w-56 shrink-0 border-l bg-sidebar hidden md:flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b">
          <FlaskConical className="h-5 w-5 text-primary" />
          <span className="font-bold">داشبورد IAT</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-2">
          <div className="text-xs text-muted-foreground px-1">کاربر: {username}</div>
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 md:px-6 gap-3 bg-card sticky top-0 z-10">
          <span className="font-semibold">IAT Research Dashboard</span>
          <nav className="md:hidden flex-1 overflow-x-auto flex gap-1 -mx-1 px-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Button variant="outline" size="sm" className="md:hidden mr-auto gap-1.5" onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
