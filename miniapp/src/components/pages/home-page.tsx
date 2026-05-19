"use client";

import { motion } from "framer-motion";
import { Clock, FileEdit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HeroBanner } from "@/components/zai/hero-banner";
import { StatCard } from "@/components/zai/stat-card";
import { AgentCard } from "@/components/zai/agent-card";
import { getAgentMeta as getAgentMetaFn } from "@/lib/agents";
import { getTrialDaysLeft } from "@/lib/format";
import { AGENT_SLUGS, type Tab } from "@/lib/page-types";

interface HomePageProps {
  onNav: (t: Tab) => void;
  haptic: (t?: "light" | "medium" | "heavy") => void;
  postCount: number;
  myAgents: Array<{ slug: string; status: string }>;
  trialExpiresAt?: string | null;
  userPlan?: string;
  /** True bo'lsa kirish holatini ko'rsatamiz; false bo'lsa skeleton/yuklanmoqda */
  accessReady?: boolean;
}

export function HomePage({ onNav, haptic, postCount, myAgents, trialExpiresAt, userPlan, accessReady }: HomePageProps) {
  const trialDaysLeft = getTrialDaysLeft(trialExpiresAt);
  const isTrialActive = userPlan === "trial" && trialDaysLeft > 0;
  // Trial tugagan, lekin user agent xarid qilgan bo'lsa — banner kerak emas
  const hasActiveAgents = (myAgents || []).some((a: any) => a.status === "active");

  const hasAgent = (tabId: string) => {
    // Status priority: active > pending > trial
    const slug = AGENT_SLUGS[tabId];
    if (!slug) return true;
    const ua = myAgents.find((a) => a.slug === slug);
    if (ua?.status === "active") return true;
    if (isTrialActive) return true;
    return false;
  };

  const handleNav = (tabId: Tab) => {
    // accessReady bo'lmaguncha hech qaysi yo'naltirish ishlamaydi (haptic faqat)
    if (!accessReady) {
      haptic("light");
      return;
    }
    if (!hasAgent(tabId)) {
      haptic("medium");
      onNav("profile");
      return;
    }
    haptic("light");
    onNav(tabId);
  };

  return (
    <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="space-y-5">
      {/* Hero Banner */}
      <HeroBanner
        title="Kontent yaratishni boshlang"
        subtitle="AI yordamida professional postlar — 3 ta variant, 10 soniyada"
        ctaLabel="Kontent yaratish"
        onCta={() => { haptic("medium"); onNav("create"); }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={FileEdit}
          value={postCount}
          label="Yaratilgan postlar"
          accent="primary"
        />
        <StatCard
          icon={Clock}
          value={
            !accessReady
              ? "…"
              : isTrialActive
              ? trialDaysLeft
              : hasActiveAgents
              ? "✓"
              : "—"
          }
          label={
            !accessReady
              ? "Yuklanmoqda…"
              : isTrialActive
              ? "Qolgan kun (sinov)"
              : hasActiveAgents
              ? "Obuna faol"
              : userPlan === "trial"
              ? "Sinov tugagan"
              : "Obuna yo'q"
          }
          accent={accessReady && trialDaysLeft <= 1 && isTrialActive ? "warning" : "default"}
        />
      </div>

      {/* Trial expired banner — faqat accessReady VA trial tugagan VA agent xarid qilmagan bo'lsa */}
      {accessReady && userPlan === "trial" && trialDaysLeft === 0 && !hasActiveAgents && (
        <Card variant="highlighted" className="p-4 text-center space-y-2 border-amber-200 bg-amber-50/50">
          <p className="text-sm font-semibold text-amber-700">⏰ Sinov muddati tugadi</p>
          <p className="text-xs text-muted-foreground">Agentlarni sotib oling va davom eting</p>
          <Button
            size="sm"
            onClick={() => { haptic("medium"); onNav("profile"); }}
          >
            Agent do'koniga o'tish
          </Button>
        </Card>
      )}

      {/* Quick Actions — AgentCard compact */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Tezkor harakatlar</h3>
        <div className="space-y-2.5">
          {([
            { slug: "smm-content", tab: "create" as Tab },
            { slug: "market-analysis", tab: "create_market" as Tab },
            { slug: "document-writer", tab: "create_doc" as Tab },
          ]).map(({ slug, tab }) => {
            const agentMeta = getAgentMetaFn(slug);
            // Status priority: active > pending > trial > locked
            const ua = myAgents.find((a) => a.slug === slug);
            let cardStatus: "active" | "trial" | "locked" | "pending" = "locked";
            if (!accessReady) {
              cardStatus = "active";  // loading: optimistik
            } else if (ua?.status === "active") {
              cardStatus = "active";
            } else if (ua?.status === "pending") {
              cardStatus = "pending";
            } else if (isTrialActive) {
              cardStatus = "trial";
            }
            const locked = accessReady && cardStatus === "locked";
            return (
              <AgentCard
                key={slug}
                agent={agentMeta}
                status={cardStatus}
                compact
                showPrice={false}
                onClick={() => handleNav(tab)}
                onBuy={locked ? () => { haptic("medium"); onNav("profile"); } : undefined}
              />
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export default HomePage;
