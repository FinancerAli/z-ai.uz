"use client";

import { useEffect, useState } from "react";
import { Clock, RefreshCw, X, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RateLimitBannerProps {
  /** Backend `Retry-After` header'idan kelgan soniyalar */
  retryAfter: number;
  /** Countdown tugagach yoki "Qayta urinish" bosilganda chaqiriladi */
  onRetry?: () => void;
  /** "Yopish" tugmasi bosilganda chaqiriladi */
  onDismiss?: () => void;
  /** Ixtiyoriy ikkilamchi CTA — masalan, "Sotib olish" */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Vaqtni "M:SS" formatida yoki kichik qiymatlar uchun "X soniya" ko'rinishida formatlaydi.
 */
function formatCountdown(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} soniya`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * RateLimitBanner — 429 holati uchun do'stona UI.
 * Countdown timer ko'rsatadi, 0 ga yetganda "Qayta urinish" tugmasi paydo bo'ladi.
 * Component unmount bo'lganda timer tozalanadi.
 */
export function RateLimitBanner({
  retryAfter,
  onRetry,
  onDismiss,
  secondaryAction,
}: RateLimitBannerProps) {
  const [remaining, setRemaining] = useState<number>(Math.max(0, Math.floor(retryAfter)));

  useEffect(() => {
    setRemaining(Math.max(0, Math.floor(retryAfter)));
  }, [retryAfter]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const isReady = remaining <= 0;

  return (
    <Card variant="default" className="relative border-amber-200 bg-amber-50/40">
      {onDismiss && (
        <button
          type="button"
          aria-label="Yopish"
          onClick={onDismiss}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-amber-100 hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}

      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Clock size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground">Biroz kuting</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Daqiqada 5 tadan ko&apos;p so&apos;rov yubora olmaysiz
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center rounded-xl border border-amber-200 bg-white/70 py-3">
          {isReady ? (
            <Badge variant="success" icon={<RefreshCw />}>Tayyor</Badge>
          ) : (
            <Badge variant="warning" icon={<Clock />}>
              {formatCountdown(remaining)}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {isReady ? (
            <Button
              variant="default"
              className="w-full"
              icon={<RefreshCw size={16} />}
              onClick={() => onRetry?.()}
            >
              Qayta urinish
            </Button>
          ) : (
            <Button variant="default" className="w-full" disabled>
              Kutilmoqda...
            </Button>
          )}

          {secondaryAction && (
            <Button
              variant="secondary"
              className="w-full"
              icon={<Sparkles size={16} />}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
