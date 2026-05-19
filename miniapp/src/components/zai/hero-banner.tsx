"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroBannerProps {
  greeting?: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}

/**
 * Hero Banner — Bosh sahifadagi gradient banner.
 * Brand gradient + particles effekti + CTA tugma.
 */
export function HeroBanner({
  greeting = "Xush kelibsiz! 👋",
  title,
  subtitle,
  ctaLabel,
  onCta,
}: HeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-premium">
      {/* Decorative circles */}
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="absolute right-10 -bottom-8 h-20 w-20 rounded-full bg-white/5" />
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03]" />

      {/* Content */}
      <div className="relative z-10">
        <p className="text-sm opacity-90">{greeting}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed opacity-85">{subtitle}</p>
        <Button
          variant="secondary"
          className="mt-5 border-white/20 bg-white/15 text-white hover:bg-white/25"
          icon={<Sparkles size={16} />}
          onClick={onCta}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
