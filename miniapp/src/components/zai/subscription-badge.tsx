"use client";

import { Clock, Check, AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SubscriptionBadgeProps {
  plan: "trial" | "active" | "expired" | "premium" | "none" | "free_beta";
  daysLeft?: number;
  compact?: boolean;
}

/**
 * Subscription holati badge'i — Profil va boshqa joylarda ishlatiladi.
 * Plan va qolgan kunlarga qarab turli ko'rinish.
 */
export function SubscriptionBadge({ plan, daysLeft, compact }: SubscriptionBadgeProps) {
  if (plan === "premium") {
    return (
      <Badge variant="premium" icon={<Sparkles size={12} />}>
        Premium
      </Badge>
    );
  }

  if (plan === "active") {
    return (
      <Badge variant="success" icon={<Check size={12} />}>
        Obuna faol
      </Badge>
    );
  }

  if (plan === "trial") {
    const critical = (daysLeft ?? 0) <= 1;
    return (
      <Badge
        variant={critical ? "warning" : "info"}
        icon={<Clock size={12} />}
      >
        {compact
          ? `${daysLeft ?? 0}k`
          : daysLeft && daysLeft > 0
          ? `Sinov: ${daysLeft} kun`
          : "Sinov tugagan"}
      </Badge>
    );
  }

  if (plan === "expired") {
    return (
      <Badge variant="destructive" icon={<AlertTriangle size={12} />}>
        Sinov tugagan
      </Badge>
    );
  }

  // "none" yoki "free_beta"
  return (
    <Badge variant="secondary" icon={<Clock size={12} />}>
      Bepul
    </Badge>
  );
}
