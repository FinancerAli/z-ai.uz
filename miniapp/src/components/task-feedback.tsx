"use client";

import { useState, useCallback } from "react";
import { ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useTelegram } from "@/hooks/use-telegram";

interface TaskFeedbackProps {
  taskId: string;
  onRedo?: () => void;
}

export function TaskFeedback({ taskId, onRedo }: TaskFeedbackProps) {
  const [rating, setRating] = useState<"good" | "bad" | "redo" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { fetchWithAuth } = useApi();
  const { hapticSuccess, hapticError, haptic } = useTelegram();

  const submit = useCallback(async (r: "good" | "bad" | "redo") => {
    if (submitted) return;
    setRating(r);

    if (r === "redo") {
      haptic("medium");
      onRedo?.();
      return;
    }

    r === "good" ? hapticSuccess() : hapticError();

    try {
      await fetchWithAuth(`/api/tasks/${taskId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: r }),
      });
      setSubmitted(true);
    } catch {
      // Silent fail — feedback ixtiyoriy
    }
  }, [submitted, taskId, fetchWithAuth, haptic, hapticSuccess, hapticError, onRedo]);

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
        <span className="text-green-500">✓</span>
        <span>Baholash saqlandi. Rahmat!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
      <span className="text-xs text-muted-foreground mr-1">Natija:</span>
      <button
        className={`feedback-btn good ${rating === "good" ? "active" : ""}`}
        onClick={() => submit("good")}
        aria-label="Yaxshi"
      >
        <ThumbsUp size={12} />
        Yaxshi
      </button>
      <button
        className={`feedback-btn bad ${rating === "bad" ? "active" : ""}`}
        onClick={() => submit("bad")}
        aria-label="Yomon"
      >
        <ThumbsDown size={12} />
        Yomon
      </button>
      {onRedo && (
        <button
          className={`feedback-btn redo ${rating === "redo" ? "active" : ""}`}
          onClick={() => submit("redo")}
          aria-label="Qayta yozish"
        >
          <RotateCcw size={12} />
          Qayta
        </button>
      )}
    </div>
  );
}
