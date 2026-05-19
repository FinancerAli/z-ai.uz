"use client";

/**
 * useAnalytics — fire-and-forget event tracking for ZAI Mini App (E4)
 *
 * Privacy notes:
 *  - DO NOT pass PII (telegram_id, names, raw input/output) into properties.
 *  - Use slugs/IDs/durations/counts/types only.
 *
 * Failures (network, 4xx, 5xx, rate limits) are silently swallowed so the
 * UI is never blocked by analytics.
 */
import { useCallback, useMemo, useRef } from "react";
import { API_BASE } from "@/hooks/use-api";

export const ALLOWED_EVENTS = [
  "agent_viewed",
  "content_generated",
  "purchase_initiated",
  "purchase_completed",
  "share_clicked",
  "tab_switched",
  "app_opened",
  "trial_expired_seen",
  "error_shown",
] as const;

export type AnalyticsEvent = (typeof ALLOWED_EVENTS)[number];

const SESSION_KEY = "zai_analytics_session";

function generateSessionId(): string {
  // RFC 4122 v4 UUID — sessionStorage muddatigacha barqaror
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (eski browser yoki SSR)
  return "s-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadOrCreateSessionId(): string {
  if (typeof window === "undefined") return generateSessionId();
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = generateSessionId();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage bloklangan bo'lishi mumkin (private mode)
    return generateSessionId();
  }
}

interface UseAnalyticsOptions {
  /**
   * JWT (mavjud bo'lsa) — useApi'dan keladi. Anonymous trackingni
   * qo'llab-quvvatlash uchun majburiy emas.
   */
  token?: string | null;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const sessionId = useMemo(() => loadOrCreateSessionId(), []);
  const tokenRef = useRef<string | null>(options.token ?? null);
  tokenRef.current = options.token ?? null;

  const track = useCallback(
    (event: AnalyticsEvent, properties?: Record<string, unknown>) => {
      if (typeof window === "undefined") return;
      // event_name'ni ham frontend tomondan validatsiya qilamiz
      if (!ALLOWED_EVENTS.includes(event)) return;

      const platform =
        (typeof window !== "undefined" &&
          (window as any).Telegram?.WebApp?.platform) ||
        "web";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (tokenRef.current) {
        headers.Authorization = `Bearer ${tokenRef.current}`;
      }

      const body = JSON.stringify({
        event_name: event,
        properties: properties ?? null,
        session_id: sessionId,
        platform,
      });

      // Fire-and-forget: never block UI on analytics
      fetch(`${API_BASE}/api/analytics/track`, {
        method: "POST",
        headers,
        body,
        // keepalive — sahifa unload bo'lsa ham yuborishga harakat qilamiz
        keepalive: true,
      }).catch(() => {
        /* swallow — analytics is best-effort */
      });
    },
    [sessionId]
  );

  return { track, sessionId };
}
