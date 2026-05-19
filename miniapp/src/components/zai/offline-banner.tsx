"use client";

import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw } from "lucide-react";

interface OfflineBannerProps {
  /** Hozirgi online holati. `false` bo'lsa — banner ko'rsatiladi. */
  isOnline: boolean;
  /**
   * "Qayta urinish" tugmasi bosilganda chaqiriladigan ixtiyoriy callback.
   * Berilmagan bo'lsa — `window.location.reload()` chaqiriladi.
   */
  onRetry?: () => void;
}

/**
 * OfflineBanner — internet uzilganda ko'rinadigan kichik banner.
 *
 * - Faqat `!isOnline` paytida render bo'ladi
 * - Yuqoridan slide-down animatsiya (framer-motion)
 * - Amber/warning theme
 * - Auto-dismiss: online bo'lgach o'zi yopiladi
 * - z-index 40 — kontentdan yuqori, lekin modal/dialogdan past
 */
export function OfflineBanner({ isOnline, onRetry }: OfflineBannerProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-[env(safe-area-inset-top,0px)] left-0 right-0 z-40 flex items-center justify-between gap-3 bg-amber-500/95 px-4 py-2 text-white backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <WifiOff size={16} aria-hidden="true" />
            <span>Internet yo&apos;q · Ulanish kutilmoqda...</span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold transition-colors hover:bg-white/30"
            aria-label="Qayta urinish"
          >
            <RefreshCw size={12} aria-hidden="true" /> Qayta urinish
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
