/**
 * ZAI Agent Metadata — Markazlashtirilgan mapping
 *
 * Har agent uchun: icon, accent rang, route, description.
 * Home, Profile, History sahifalarida bir xil ko'rinish uchun.
 */
import { FileEdit, BarChart, ShieldCheck, type LucideIcon } from "lucide-react";

export interface AgentMeta {
  slug: string;
  name: string;
  shortName: string;
  icon: LucideIcon;
  accent: {
    /** Icon background class */
    bg: string;
    /** Icon text color class */
    text: string;
    /** Card hover border class */
    border: string;
    /** Subtle card background */
    cardBg: string;
  };
  /** Tab route name */
  route: string;
  description: string;
}

export const AGENTS: Record<string, AgentMeta> = {
  "smm-content": {
    slug: "smm-content",
    name: "SMM Kontent Agent",
    shortName: "Post yaratish",
    icon: FileEdit,
    accent: {
      bg: "bg-violet-100",
      text: "text-violet-600",
      border: "border-violet-200 hover:border-violet-400",
      cardBg: "bg-violet-50/50",
    },
    route: "create",
    description: "Telegram, Instagram va reklama matnlari",
  },
  "market-analysis": {
    slug: "market-analysis",
    name: "Biznes Tahlil Agent",
    shortName: "Biznes Tahlil",
    icon: BarChart,
    accent: {
      bg: "bg-blue-100",
      text: "text-blue-600",
      border: "border-blue-200 hover:border-blue-400",
      cardBg: "bg-blue-50/50",
    },
    route: "create_market",
    description: "SWOT, raqobatchilar, target audience",
  },
  "document-writer": {
    slug: "document-writer",
    name: "Hujjat Tahlil Agent",
    shortName: "Hujjat Tahlili",
    icon: ShieldCheck,
    accent: {
      bg: "bg-emerald-100",
      text: "text-emerald-600",
      border: "border-emerald-200 hover:border-emerald-400",
      cardBg: "bg-emerald-50/50",
    },
    route: "create_doc",
    description: "Matn va hujjatlar tahlili, xulosa, tarjima",
  },
};

/**
 * Slug bo'yicha agent meta olish.
 * Topilmasa default (smm-content) qaytaradi.
 */
export function getAgentMeta(slug: string): AgentMeta {
  return AGENTS[slug] ?? AGENTS["smm-content"];
}

/**
 * Barcha agentlar ro'yxati (array sifatida)
 */
export function getAllAgents(): AgentMeta[] {
  return Object.values(AGENTS);
}

/**
 * Route (tab) nomidan agent slug olish
 */
export const ROUTE_TO_SLUG: Record<string, string> = {
  create: "smm-content",
  create_market: "market-analysis",
  create_doc: "document-writer",
};

/**
 * Slug'dan route (tab) nomini olish
 */
export const SLUG_TO_ROUTE: Record<string, string> = {
  "smm-content": "create",
  "market-analysis": "create_market",
  "document-writer": "create_doc",
};
