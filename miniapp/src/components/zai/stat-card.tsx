"use client";

import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon?: LucideIcon;
  value: string | number;
  label: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    text: string;
  };
  accent?: "default" | "primary" | "warning" | "success";
  className?: string;
}

/**
 * Stat Card — Raqamli statistika ko'rsatish.
 * Home sahifasida "Yaratilgan postlar", "Qolgan kun" va h.k.
 */
export function StatCard({
  icon: Icon,
  value,
  label,
  trend,
  accent = "default",
  className,
}: StatCardProps) {
  const accentStyles = {
    default: "text-foreground",
    primary: "text-brand-gradient",
    warning: "text-amber-600",
    success: "text-emerald-600",
  };

  const trendColors = {
    up: "text-emerald-600",
    down: "text-red-500",
    neutral: "text-muted-foreground",
  };

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className={cn("text-2xl font-bold", accentStyles[accent])}>
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", trendColors[trend.direction])}>
              {trend.direction === "up" && "↑ "}
              {trend.direction === "down" && "↓ "}
              {trend.text}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={18} strokeWidth={2} />
          </div>
        )}
      </div>
    </Card>
  );
}
