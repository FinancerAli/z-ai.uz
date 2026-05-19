"use client";

import { useEffect, useState } from "react";
import { Zap, Clock } from "lucide-react";

interface UsageIndicatorProps {
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
  /** Har gal qiymati o'zgarsa, indikator qayta yuklanadi (masalan, task yaratilgandan keyin). */
  refreshKey?: number;
}

interface UsageData {
  plan: string;
  daily_limit: number;
  used_today: number;
  remaining: number;
  trial_expires_at: string | null;
  is_premium: boolean;
}

/**
 * Foydalanuvchining bugungi limit holatini yuqorida ko'rsatuvchi kompakt indikator.
 *
 * - Trial faol: "Bugun: 3/10 ishlatilgan · Trial 2 kun"
 * - Limit 80%+ ishlatilgan bo'lsa amber rangda
 * - Limit tugagan bo'lsa rose rangda + "Sotib olish" CTA emas (CreatePage'dagi 429 banner javob beradi)
 */
export function UsageIndicator({ fetchWithAuth, refreshKey = 0 }: UsageIndicatorProps) {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithAuth("/api/auth/me/usage")
      .then((d: UsageData) => { if (!cancelled) setData(d); })
      .catch(() => { /* sukutda — indikator ko'rinmaydi */ });
    return () => { cancelled = true; };
  }, [fetchWithAuth, refreshKey]);

  if (!data) {
    return (
      <div className="mb-3 h-6 w-32 rounded-md bg-muted/40 animate-pulse" />
    );
  }

  const pct = data.daily_limit > 0 ? Math.min(100, (data.used_today / data.daily_limit) * 100) : 0;
  const isOver = data.remaining <= 0;
  const isWarning = !isOver && pct >= 80;

  // Trial qolgan kunlar
  let trialDays: number | null = null;
  if (data.plan === "trial" && data.trial_expires_at) {
    const ms = new Date(data.trial_expires_at).getTime() - Date.now();
    trialDays = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }

  const colorClass = isOver
    ? "text-rose-600 bg-rose-50 border-rose-200"
    : isWarning
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-muted-foreground bg-muted/30 border-border";

  return (
    <div className={`mb-4 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${colorClass}`}>
      <div className="flex items-center gap-1.5">
        <Zap size={13} aria-hidden="true" />
        <span>
          Bugun: <span className="font-bold">{data.used_today}</span>
          <span className="opacity-60">/{data.daily_limit}</span>
        </span>
        {data.is_premium && (
          <span className="ml-1 text-amber-600">⭐</span>
        )}
      </div>
      {trialDays !== null && (
        <div className="flex items-center gap-1">
          <Clock size={11} aria-hidden="true" />
          <span>{trialDays > 0 ? `Trial: ${trialDays} kun` : "Trial tugagan"}</span>
        </div>
      )}
      {trialDays === null && data.plan !== "trial" && (
        <span className="capitalize">{data.plan}</span>
      )}
    </div>
  );
}
