"use client";

import { useState, useEffect } from "react";

/**
 * useOnlineStatus — qurilmaning internetga ulanish holatini kuzatadi.
 *
 * SSR xavfsizligi uchun dastlabki qiymat har doim `true` (online) — render
 * paytida `navigator` mavjud emasligi sababli. Mount bo'lgandan so'ng
 * `useEffect` ichida haqiqiy holat o'qiladi va `online`/`offline` window
 * eventlariga subscribe qilinadi. Component unmount bo'lganda listenerlar
 * tozalanadi.
 *
 * @returns true — online; false — offline
 */
export function useOnlineStatus(): boolean {
  // SSR-safe initial state — assume online during render, correct after mount
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // After mount, sync from navigator.onLine
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
