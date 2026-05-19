"use client";

import { useEffect, useState } from "react";
import { Sparkles, Brain, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Brain, label: "Mavzuni o'rganayapman...", duration: 3000 },
  { icon: Wand2, label: "Variantlar yozayapman...", duration: 5000 },
  { icon: Sparkles, label: "Yakunlayapman...", duration: 2000 },
];

interface GenerationProgressProps {
  className?: string;
}

/**
 * Generation Progress — AI kontent yaratayotganda ko'rsatiladigan animatsiyali loader.
 * 3 bosqich: O'rganish → Yozish → Yakunlash
 */
export function GenerationProgress({ className }: GenerationProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStep(1), STEPS[0].duration);
    const timer2 = setTimeout(() => setCurrentStep(2), STEPS[0].duration + STEPS[1].duration);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const CurrentIcon = STEPS[currentStep].icon;

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 gap-6", className)}>
      {/* Animated icon */}
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient shadow-premium">
          <CurrentIcon size={28} className="text-white animate-pulse" />
        </div>
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-20 animate-ping" />
      </div>

      {/* Text */}
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">
          {STEPS[currentStep].label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          3 ta kuchli variant tayyorlanmoqda
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500",
              i <= currentStep ? "w-6 bg-primary" : "w-1.5 bg-border"
            )}
          />
        ))}
      </div>
    </div>
  );
}
