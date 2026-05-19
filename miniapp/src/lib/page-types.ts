// Shared types, constants and helpers used across the mini-app pages.
// Extracted from src/app/page.tsx so individual page components can be
// code-split without re-declaring shared shapes.

import {
  Briefcase,
  GraduationCap,
  Scissors,
  Laptop,
  Stethoscope,
  ShoppingCart,
  Utensils,
  Package,
  Smile,
  Zap,
  Dumbbell,
  Building2,
  Car,
  Truck,
  type LucideIcon,
} from "lucide-react";

// ======== TYPES ========
export type Tab =
  | "home"
  | "create"
  | "create_doc"
  | "create_market"
  | "history"
  | "profile"
  | "admin"
  | "brand";

export type BusinessType =
  | "ielts"
  | "beauty"
  | "it_course"
  | "clinic"
  | "ecommerce"
  | "restaurant"
  | "fitness"
  | "real_estate"
  | "taxi"
  | "delivery"
  | "other";

export type Language = "uz" | "ru" | "uz_ru";
export type Tone = "friendly" | "formal" | "energetic";

export interface ContentResult {
  content: string;
  tokens: number;
  cost: number;
}

export interface HistoryItem {
  id: string;
  topic: string;
  business_type: string;
  language: string;
  tone: string;
  content: string;
  tokens: number;
  cost: number;
  created_at: string;
}

// ======== LOCAL STORAGE HELPERS ========
export const HISTORY_KEY = "zai_history";

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

// ======== DATA ========
export const BUSINESSES: { id: BusinessType; icon: LucideIcon; label: string }[] = [
  { id: "ielts", icon: GraduationCap, label: "IELTS / Til markazi" },
  { id: "beauty", icon: Scissors, label: "Go'zallik saloni" },
  { id: "it_course", icon: Laptop, label: "IT kurslar" },
  { id: "clinic", icon: Stethoscope, label: "Klinika" },
  { id: "ecommerce", icon: ShoppingCart, label: "Online do'kon" },
  { id: "restaurant", icon: Utensils, label: "Restoran / Kafe" },
  { id: "fitness", icon: Dumbbell, label: "Fitness / Sport zali" },
  { id: "real_estate", icon: Building2, label: "Ko'chmas mulk" },
  { id: "taxi", icon: Car, label: "Taxi xizmati" },
  { id: "delivery", icon: Truck, label: "Yetkazib berish" },
  { id: "other", icon: Package, label: "Boshqa" },
];

export const LANGS: { id: Language; flag: string; label: string }[] = [
  { id: "uz", flag: "🇺🇿", label: "O'zbekcha" },
  { id: "ru", flag: "🇷🇺", label: "Ruscha" },
  { id: "uz_ru", flag: "🇺🇿🇷🇺", label: "Aralash" },
];

export const TONES: { id: Tone; icon: LucideIcon; label: string }[] = [
  { id: "friendly", icon: Smile, label: "Do'stona" },
  { id: "formal", icon: Briefcase, label: "Rasmiy" },
  { id: "energetic", icon: Zap, label: "Energetik" },
];

// ======== AGENT SLUG <-> TAB MAPPING ========
export const AGENT_SLUGS: Record<string, string> = {
  create: "smm-content",
  create_market: "market-analysis",
  create_doc: "document-writer",
};

// ======== PAGE TRANSITIONS ========
export const pageVariants = {
  initial: { opacity: 1, y: 0 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};
