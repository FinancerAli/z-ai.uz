"use client";
import { useEffect, useRef } from "react";
import { useTelegram } from "@/hooks/use-telegram";

interface UseStartParamOptions {
  onAgent: (slug: string) => void;
  onReferral: (userId: string) => void;
  onTrialExtend: () => void;
}

/**
 * Reads `startParam` from Telegram WebApp initDataUnsafe and dispatches
 * to the appropriate handler exactly once on mount.
 *
 * Supported patterns:
 *   agent_<slug>     → onAgent(slug)
 *   ref_<userId>     → onReferral(userId)
 *   trial_extend     → onTrialExtend()
 */
export function useStartParam({
  onAgent,
  onReferral,
  onTrialExtend,
}: UseStartParamOptions): void {
  const { startParam } = useTelegram();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (!startParam) return;

    handled.current = true;

    if (startParam.startsWith("agent_")) {
      const slug = startParam.slice("agent_".length);
      onAgent(slug);
    } else if (startParam.startsWith("ref_")) {
      const userId = startParam.slice("ref_".length);
      onReferral(userId);
    } else if (startParam === "trial_extend") {
      onTrialExtend();
    }
    // Unknown patterns are silently ignored
  }, [startParam, onAgent, onReferral, onTrialExtend]);
}
