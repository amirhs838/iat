"use client";

// =============================================================================
// StatCard — dashboard metric card (icon, title, value, optional sub text).
// Value formatting (Persian digits, dir, font) is decided by the caller.
// =============================================================================

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  /** Ready-to-render value node (caller applies toFa / dir="ltr" / font-mono). */
  value: React.ReactNode;
  icon?: LucideIcon;
  sub?: string;
  loading?: boolean;
  className?: string;
}

export function StatCard({ title, value, icon: Icon, sub, loading = false, className }: StatCardProps) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-7 w-16" aria-hidden="true" />
          ) : (
            <div className="text-2xl font-bold leading-none tracking-tight">{value}</div>
          )}
          {sub ? (
            loading ? (
              <Skeleton className="h-3.5 w-24" aria-hidden="true" />
            ) : (
              <p className="text-xs text-muted-foreground">{sub}</p>
            )
          ) : null}
        </div>
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
