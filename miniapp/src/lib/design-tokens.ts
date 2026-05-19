/**
 * ZAI Design Tokens — Yagona Manba
 *
 * Barcha typography, spacing, shadow, icon o'lchamlari shu yerda.
 * Arbitrary Tailwind qiymatlar (text-[10px], text-[11px]) TAQIQLANADI.
 * Faqat shu shkaladan foydalaning.
 */

// ============================================================
//  TYPOGRAPHY — Tailwind class xulosasi
// ============================================================
export const TEXT = {
  /** 12px — metadata, timestamp, badge */
  xs: "text-xs leading-4",
  /** 14px — body, description */
  sm: "text-sm leading-5",
  /** 16px — input, primary content */
  base: "text-base leading-6",
  /** 18px — section heading */
  lg: "text-lg leading-7 font-semibold",
  /** 20px — page heading */
  xl: "text-xl leading-7 font-bold",
  /** 24px — hero numbers, stat values */
  "2xl": "text-2xl leading-8 font-bold",
  /** 30px — landing, hero title */
  "3xl": "text-3xl leading-9 font-extrabold",
} as const;

// ============================================================
//  SPACING — Section gaps
// ============================================================
export const GAP = {
  /** 8px — tight spacing */
  tight: "space-y-2",
  /** 12px — base spacing */
  base: "space-y-3",
  /** 16px — relaxed spacing */
  relaxed: "space-y-4",
  /** 24px — loose spacing (between sections) */
  loose: "space-y-6",
} as const;

// ============================================================
//  SHADOWS — 3 daraja
// ============================================================
export const SHADOW = {
  /** Oddiy karta — minimal shadow */
  card: "shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)]",
  /** Ko'tarilgan karta — hover, selected */
  elevated: "shadow-[0_4px_12px_rgba(16,24,40,0.08),0_2px_4px_rgba(16,24,40,0.04)]",
  /** Premium — brand gradient shadow */
  premium: "shadow-[0_8px_24px_-4px_rgba(108,59,255,0.25),0_4px_8px_-2px_rgba(108,59,255,0.12)]",
} as const;

// ============================================================
//  ICON SIZES — 4 ta standart
// ============================================================
export const ICON = {
  /** 14px — badge ichida, kichik indikator */
  sm: 14,
  /** 16px — inline text, button icon */
  base: 16,
  /** 20px — card icon, list item */
  md: 20,
  /** 24px — page header, hero */
  lg: 24,
} as const;

// ============================================================
//  BRAND GRADIENT — Bitta manba
// ============================================================
export const GRADIENT = {
  /** Background gradient (Hero, Avatar, Primary CTA) */
  brand: "bg-gradient-to-br from-[#6C3BFF] via-[#7B4FFF] to-[#8B5CF6]",
  /** Text gradient (stat numbers, headings) */
  brandText: "bg-gradient-to-r from-[#6C3BFF] to-[#8B5CF6] bg-clip-text text-transparent",
  /** Subtle background (card highlight) */
  brandSubtle: "bg-gradient-to-br from-[#6C3BFF]/5 to-[#8B5CF6]/5",
} as const;

// ============================================================
//  BORDER RADIUS — Standart shkala
// ============================================================
export const RADIUS = {
  /** 8px — small elements (badge, chip) */
  sm: "rounded-lg",
  /** 12px — buttons, inputs */
  md: "rounded-xl",
  /** 16px — cards */
  lg: "rounded-2xl",
  /** 24px — modals, hero */
  xl: "rounded-3xl",
} as const;

// ============================================================
//  ANIMATION — Tap feedback
// ============================================================
export const PRESS = {
  /** Standard tap scale */
  scale: { whileTap: { scale: 0.98 } },
  /** Subtle tap */
  subtle: { whileTap: { scale: 0.99 } },
} as const;
