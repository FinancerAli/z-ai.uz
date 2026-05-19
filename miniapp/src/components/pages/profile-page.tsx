"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useTelegram } from "@/hooks/use-telegram";
import { useAnalytics } from "@/hooks/use-analytics";
import { AgentCard, type AgentStatus } from "@/components/zai/agent-card";
import { SubscriptionBadge } from "@/components/zai/subscription-badge";
import { AgentPurchaseFlow } from "@/components/agent-purchase-flow";
import { getAgentMeta as getAgentMetaFn } from "@/lib/agents";
import { getTrialDaysLeft } from "@/lib/format";
import { pageVariants, type Tab } from "@/lib/page-types";

interface StoreAgent {
  id: string;
  slug: string;
  name: string;
  icon: string;
  price_monthly: number;
  description: string;
}

interface ProfilePageProps {
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  onNav?: (t: Tab) => void;
  haptic: (t?: "light" | "medium" | "heavy") => void;
  myAgents?: Array<{ slug: string; name: string; status: string }>;
  onAgentActivated?: () => void;
  trialExpiresAt?: string | null;
  userPlan?: string;
  /** Auth+agents yuklanganmi — false bo'lsa "trial expired" ko'rinmaydi */
  accessReady?: boolean;
}

export function ProfilePage({
  user,
  onNav,
  haptic,
  myAgents,
  onAgentActivated,
  trialExpiresAt,
  userPlan,
  accessReady,
}: ProfilePageProps) {
  const name = user ? `${user.first_name} ${user.last_name || ""}`.trim() : "Foydalanuvchi";
  const initial = name.charAt(0).toUpperCase();
  const [purchasingAgent, setPurchasingAgent] = useState<{ id: string; name: string; icon: any; price: number; slug: string } | null>(null);
  const { fetchWithAuth, token } = useApi();
  const { hapticSuccess } = useTelegram();
  const [storeAgents, setStoreAgents] = useState<StoreAgent[]>([]);
  const { track } = useAnalytics({ token });
  // Sessiya davomida bir agent uchun bir martagina agent_viewed yuboramiz
  const viewedAgentsRef = useRef<Set<string>>(new Set());

  // Trial qolgan kunlarni hisoblash
  const trialDaysLeft = getTrialDaysLeft(trialExpiresAt);
  const isTrialActive = userPlan === "trial" && trialDaysLeft > 0;

  // Agent store'dan agentlarni yuklash
  useEffect(() => {
    fetchWithAuth("/api/agents").then((data: StoreAgent[] | null) => {
      setStoreAgents(data || []);
    }).catch(() => {});
  }, [fetchWithAuth]);

  // Analytics: agent_viewed — har agentni ko'rinishida bir marta
  useEffect(() => {
    if (!storeAgents.length) return;
    for (const a of storeAgents) {
      if (viewedAgentsRef.current.has(a.slug)) continue;
      viewedAgentsRef.current.add(a.slug);
      track("agent_viewed", { agent_slug: a.slug });
    }
  }, [storeAgents, track]);

  const getAgentStatus = (slug: string): AgentStatus => {
    // Status priority: active > pending > trial > available
    // Active obuna HECH QACHON "Sinov" yoki "Xarid" ko'rsatmasligi kerak.
    const ua = myAgents?.find((a) => a.slug === slug);
    if (ua?.status === "active") return "active";
    if (ua?.status === "pending") return "pending";
    if (isTrialActive) return "trial";
    if (!accessReady) return "trial";  // loading: optimistik
    return "available";
  };

  // Subscription plan uchun badge
  const subPlan = !accessReady
    ? "trial"  // initial loading: optimistik "trial" — flicker bo'lmasin
    : isTrialActive
    ? "trial"
    : userPlan === "trial" && trialDaysLeft === 0
    ? "expired"
    : myAgents && myAgents.some(a => a.status === "active")
    ? "active"
    : "none";

  return (
    <motion.div {...pageVariants} className="space-y-4">
      <h2 className="text-xl font-bold">Profilim</h2>

      {/* Profile card */}
      <Card variant="elevated" className="p-5">
        <div className="flex flex-col items-center">
          <div className="h-16 w-16 rounded-full bg-brand-gradient flex items-center justify-center text-2xl font-bold text-white shadow-premium">
            {initial}
          </div>
          <p className="mt-3 text-base font-bold">{name}</p>
          {user?.username && (
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          )}
          <div className="mt-2">
            <SubscriptionBadge plan={subPlan as any} daysLeft={trialDaysLeft} />
          </div>

          {/* ADMIN BUTTON */}
          {(user?.id === 963810115 || user?.id === 1866763435) && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              icon={<Sparkles size={14} />}
              onClick={() => { haptic?.("medium"); onNav?.("admin"); }}
            >
              Admin Panel
            </Button>
          )}
        </div>
      </Card>

      {/* Brand Profile Button */}
      <Card interactive onClick={() => { haptic?.("medium"); onNav?.("brand"); }} className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Mening Brendim</p>
            <p className="text-xs text-muted-foreground">AI uchun biznes ma'lumotlari</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>
      </Card>

      {/* Agent Store */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Agent Do'koni</h3>
        <div className="space-y-2.5">
          {storeAgents.length === 0 ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[72px] skeleton rounded-2xl" />
              ))}
            </div>
          ) : storeAgents.map((agent) => {
            const agentMeta = getAgentMetaFn(agent.slug);
            const status = getAgentStatus(agent.slug);

            return (
              <AgentCard
                key={agent.id}
                agent={agentMeta}
                status={status}
                priceMonthly={agent.price_monthly}
                showPrice={status !== "active"}
                onUse={
                  (status === "active" || status === "trial")
                    ? () => { haptic("light"); onNav?.(agentMeta.route as Tab); }
                    : undefined
                }
                onBuy={
                  (status === "available" || status === "locked")
                    ? () => {
                        haptic("medium");
                        track("purchase_initiated", {
                          agent_slug: agent.slug,
                          plan_type: "monthly",
                        });
                        setPurchasingAgent({
                          id: agent.id,
                          name: agentMeta.name,
                          icon: "🤖",  // AgentPurchaseFlow string kutadi
                          price: agent.price_monthly,
                          slug: agent.slug,
                        });
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      {/* AgentPurchaseFlow modal */}
      <AnimatePresence>
        {purchasingAgent && (
          <AgentPurchaseFlow
            agentId={purchasingAgent.id}
            agentSlug={purchasingAgent.slug}
            agentName={purchasingAgent.name}
            agentIcon={purchasingAgent.icon}
            priceMonthly={purchasingAgent.price}
            onSuccess={() => {
              setPurchasingAgent(null);
              hapticSuccess();
              onAgentActivated?.();
            }}
            onClose={() => setPurchasingAgent(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default ProfilePage;
