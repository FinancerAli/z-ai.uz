"use client";

/**
 * Bundle Size Targets (Requirement E5):
 *   - First Load JS  < 200 KB gzipped  ✓
 *
 * Measured after Task 26 code-splitting (Next 16 / Turbopack):
 *   - Initial JS  : 555 KB raw / ~167 KB gzipped  (root chunks + polyfill)
 *   - Lazy chunks : create / history / profile / admin / brand pages are
 *     dynamically imported and only fetched when the user navigates to
 *     that tab. Largest lazy chunk (admin tabs) ~108 KB gz.
 *
 * To inspect the report: `npm run analyze` (forces webpack build so
 * @next/bundle-analyzer can hook in — Turbopack analyzer is not yet
 * compatible with bundle-analyzer as of Next 16.2).
 */

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { PenTool, Clock, Home, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTelegram, cloudSet, cloudGet } from "@/hooks/use-telegram";
import { useApi } from "@/hooks/use-api";
import { useStartParam } from "@/hooks/use-start-param";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useAnalytics } from "@/hooks/use-analytics";
import { HomePage } from "@/components/pages/home-page";
import { PageSkeleton } from "@/components/pages/page-skeleton";
import { OfflineBanner } from "@/components/zai";
import { getTrialDaysLeft } from "@/lib/format";
import {
  AGENT_SLUGS,
  loadHistory,
  saveHistory,
  type HistoryItem,
  type Tab,
} from "@/lib/page-types";

// Code-split the non-default routes — they are only loaded when the user
// navigates to them, dramatically reducing First Load JS for the home tab.
const CreatePage = dynamic(
  () => import("@/components/pages/create-page").then((m) => m.CreatePage),
  { loading: () => <PageSkeleton /> },
);
const CreateDocPage = dynamic(
  () => import("@/components/pages/create-doc-page").then((m) => m.CreateDocPage),
  { loading: () => <PageSkeleton /> },
);
const CreateMarketPage = dynamic(
  () => import("@/components/pages/create-market-page").then((m) => m.CreateMarketPage),
  { loading: () => <PageSkeleton /> },
);
const HistoryPage = dynamic(
  () => import("@/components/pages/history-page").then((m) => m.HistoryPage),
  { loading: () => <PageSkeleton /> },
);
const ProfilePage = dynamic(
  () => import("@/components/pages/profile-page").then((m) => m.ProfilePage),
  { loading: () => <PageSkeleton /> },
);
const AdminPage = dynamic(
  () => import("@/components/pages/admin-page").then((m) => m.AdminPage),
  { loading: () => <PageSkeleton /> },
);
const BrandProfilePage = dynamic(
  () => import("@/components/pages/brand-profile-page").then((m) => m.BrandProfilePage),
  { loading: () => <PageSkeleton /> },
);

// ======== MAIN ========
export default function ZAIApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [myAgents, setMyAgents] = useState<Array<{ slug: string; name: string; status: string }>>([]);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("trial");
  // accessReady: auth + agents ham yuklanganidan keyin true bo'ladi.
  // Bu flag false bo'lganda home/profile sahifalari "Sinov tugagan" /
  // "Obuna faol" kabi yakuniy holatlarni KO'RSATMAYDI — skeleton/yuklanmoqda
  // ko'rinadi. Aks holda flicker bo'ladi (init: trial→nothing→sinov→active...).
  const [accessReady, setAccessReady] = useState(false);
  const { user, haptic, hapticSuccess, hapticSelect, showBack, hideBack } = useTelegram();
  const { isReady, authError, fetchWithAuth, authUser, token, refreshAuthUser } = useApi();
  const isOnline = useOnlineStatus();
  const { track } = useAnalytics({ token });

  // Tab BackButton boshqaruvi
  useEffect(() => {
    const handleBack = () => {
      if (tab === "admin" || tab === "brand") switchTab("profile");
      else switchTab("home");
    };

    if (tab === "home") {
      hideBack(handleBack);
    } else {
      showBack(handleBack);
    }
    return () => hideBack(handleBack);
  }, [tab, showBack, hideBack]);

  // Foydalanuvchi agentlarini yuklash (subscription gate uchun)
  useEffect(() => {
    if (!isReady || authError) return;

    // Avval auth response'dan trial ma'lumotlarini set qilamiz
    if (authUser) {
      setTrialExpiresAt(authUser.trial_expires_at || null);
      setUserPlan(authUser.plan || "trial");
    }

    fetchWithAuth("/api/agents/my/list").then((data: any) => {
      // API javobida maydon nomi "agent_slug" — frontendda "slug" sifatida ishlatamiz.
      // Shuningdek agent_name ham normalize qilamiz.
      const agents = (data || []).map((ua: any) => ({
        ...ua,
        slug: ua.agent_slug || ua.slug || "",
        name: ua.agent_name || ua.name || "",
      }));
      if (process.env.NODE_ENV !== "production") {
        console.log("[ZAI] /api/agents/my/list normalized:", agents.map((a: any) => ({ slug: a.slug, status: a.status, agent_id: a.agent_id })));
      }
      setMyAgents(agents);
      // Agar subscription yo'q (plan="none") lekin aktiv agent bor bo'lsa,
      // foydalanuvchi haqiqatda aktiv — uni "active" plan deb hisoblaymiz.
      // Bu admin grant orqali agent berilgan foydalanuvchilar uchun muhim.
      if ((!authUser?.plan || authUser.plan === "none") && agents.some((a: any) => a.status === "active")) {
        setUserPlan("active");
      }
      // accessReady: faqat agentlar ham yuklangandan keyin true bo'ladi.
      // authUser bo'lmasa ham flag'ni true qilamiz (timeout fallback) — UI
      // skeletoni cheksiz qolmasligi uchun.
      setAccessReady(true);
    }).catch(() => {
      // Tarmoq xatosi yoki 401: oxirgi holatda ham flag'ni true qilamiz
      // — aks holda foydalanuvchi UI cheksiz "yuklanmoqda" da qoladi.
      setAccessReady(true);
    });
  }, [isReady, authError, fetchWithAuth, authUser]);

  // Hydration guard
  useEffect(() => { setMounted(true); }, []);

  // Load history on mount
  useEffect(() => { setHistory(loadHistory()); }, []);

  // Tab visibility refresh — user Mini App'ga qaytganida (boshqa app'dan keyin yoki
  // background'dan) myAgents va plan'ni qayta yuklaymiz. Bu admin grant qilingan
  // agent'larni tezroq ko'rsatish uchun (real-time push o'rniga).
  useEffect(() => {
    if (!isReady || authError) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // myAgents va authUser ni qayta yuklash
      fetchWithAuth("/api/agents/my/list").then((d: any) => {
        const agents = (d || []).map((ua: any) => ({
          ...ua,
          slug: ua.agent_slug || ua.slug || "",
          name: ua.agent_name || ua.name || "",
        }));
        setMyAgents(agents);
      }).catch(() => {});
      refreshAuthUser();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isReady, authError, fetchWithAuth, refreshAuthUser]);

  // Analytics: app_opened — bir martagina session boshida (auth tayyor bo'lganda)
  const appOpenedSentRef = useRef(false);
  useEffect(() => {
    if (!isReady || authError) return;
    if (appOpenedSentRef.current) return;
    appOpenedSentRef.current = true;
    track("app_opened", { plan: authUser?.plan ?? "unknown" });
  }, [isReady, authError, authUser, track]);

  // requestWriteAccess — Notification kanali
  useEffect(() => {
    if (!isReady || authError) return;
    cloudGet("write_access_asked").then((asked) => {
      const wa = (window as any).Telegram?.WebApp;
      if (!asked && wa?.requestWriteAccess) {
        setTimeout(() => {
          wa.requestWriteAccess((granted: boolean) => {
            cloudSet("write_access_asked", "1");
            if (granted) {
              fetchWithAuth("/api/notifications/enable", { method: "POST" }).catch(() => {});
            }
          });
        }, 3000);
      }
    });
  }, [isReady, authError, fetchWithAuth]);

  const addToHistory = (item: HistoryItem) => {
    const updated = [item, ...history].slice(0, 50); // Max 50 items
    setHistory(updated);
    saveHistory(updated);
  };

  const deleteFromHistory = (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
    haptic("medium");
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    haptic("heavy");
  };

  const handleHistoryLoaded = (items: HistoryItem[]) => {
    setHistory(items);
    saveHistory(items);
  };

  const switchTab = (t: Tab) => {
    hapticSelect();

    // Agent gating: agar foydalanuvchi yaratish tab'lariga kirishga urinsa,
    // tegishli agent yo'q va trial faol emas bo'lsa — Profil sahifasiga yo'naltiramiz.
    // ⚠️ accessReady false bo'lsa — gating yo'q (data hali to'liq yuklanmagan,
    // foydalanuvchini xato joyga yuborib qo'ymaslik kerak).
    const slug = AGENT_SLUGS[t];
    if (slug && accessReady) {
      const trialDaysLeft = getTrialDaysLeft(trialExpiresAt);
      const isTrialActive = userPlan === "trial" && trialDaysLeft > 0;
      const hasActive = myAgents.some((a) => a.slug === slug && a.status === "active");
      if (!isTrialActive && !hasActive) {
        // Bot xaridiga yo'naltiramiz
        haptic("medium");
        setTab("profile");
        track("tab_switched", { tab: "profile", redirected_from: t });
        return;
      }
    }

    setTab(t);
    track("tab_switched", { tab: t });
  };

  // Deep-link: start_param handling
  const SLUG_TO_TAB: Record<string, Tab> = {
    "smm-content": "create",
    "market-analysis": "create_market",
    "document-writer": "create_doc",
  };

  useStartParam({
    onAgent: (slug) => {
      const target = SLUG_TO_TAB[slug];
      if (target) switchTab(target);
    },
    onReferral: (userId) => {
      // Fire-and-forget — no UI feedback needed
      fetchWithAuth("/api/referral/track", {
        method: "POST",
        body: JSON.stringify({ referrer_id: userId }),
      }).catch(() => {});
    },
    onTrialExtend: () => {
      switchTab("profile");
    },
  });

  // SSR/hydration va Loading state
  if (!mounted || !isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-white font-extrabold text-lg shadow-lg mx-auto mb-3 animate-pulse">Z</div>
          <p className="text-sm text-muted-foreground animate-pulse">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  // Auth fail fallback
  if (authError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto shadow-sm">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-lg font-bold">Avtorizatsiya xatosi</h2>
          <p className="text-sm text-muted-foreground">
            Ilovaga faqat Telegram bot orqali kirish mumkin. Iltimos, @ZAIgentbot orqali kiring.
          </p>
          <a href="https://t.me/ZAIgentbot" className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-white font-semibold text-sm mt-4">
            Botga o'tish
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Offline banner — render only when offline, slides down from top */}
      <OfflineBanner isOnline={isOnline} />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-white font-extrabold text-sm shadow-lg">
          Z
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight">ZAI</h1>
          <p className="text-[11px] text-muted-foreground">AI Marketing Agent</p>
        </div>
        {user && (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {user.first_name}
          </Badge>
        )}
      </header>

      {/* Content */}
      <main className="px-4 pt-4 pb-safe max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          {tab === "home" && <HomePage key="home" onNav={switchTab} haptic={haptic} postCount={history.length} myAgents={myAgents} trialExpiresAt={trialExpiresAt} userPlan={userPlan} accessReady={accessReady} />}
          {tab === "create" && <CreatePage key="create" haptic={haptic} hapticSuccess={hapticSuccess} onSave={addToHistory} fetchWithAuth={fetchWithAuth} />}
          {tab === "create_doc" && <CreateDocPage key="create_doc" haptic={haptic} hapticSuccess={hapticSuccess} fetchWithAuth={fetchWithAuth} onBack={() => switchTab("home")} />}
          {tab === "create_market" && <CreateMarketPage key="create_market" haptic={haptic} hapticSuccess={hapticSuccess} fetchWithAuth={fetchWithAuth} onBack={() => switchTab("home")} />}
          {tab === "history" && <HistoryPage key="history" history={history} onDelete={deleteFromHistory} onClear={clearHistory} haptic={haptic} fetchWithAuth={fetchWithAuth} onHistoryLoaded={handleHistoryLoaded} authUserId={authUser?.id?.toString()} />}
          {tab === "profile" && <ProfilePage key="profile" user={user} onNav={switchTab} haptic={haptic} myAgents={myAgents} accessReady={accessReady} onAgentActivated={() => {
            // Agent grant/purchase keyin to'liq sinxronlash:
            // 1. myAgents qaytadan yuklash
            // 2. authUser (plan, daily_limit) ham yangilash
            fetchWithAuth("/api/agents/my/list").then((d: any) => {
              const agents = (d || []).map((ua: any) => ({
                ...ua,
                slug: ua.agent_slug || ua.slug || "",
                name: ua.agent_name || ua.name || "",
              }));
              setMyAgents(agents);
            });
            refreshAuthUser();
          }} trialExpiresAt={trialExpiresAt} userPlan={userPlan} />}
          {tab === "admin" && <AdminPage key="admin" user={user} onBack={() => switchTab("profile")} fetchWithAuth={fetchWithAuth} haptic={haptic} />}
          {tab === "brand" && <BrandProfilePage key="brand" onBack={() => switchTab("profile")} fetchWithAuth={fetchWithAuth} haptic={haptic} />}
        </AnimatePresence>
      </main>

      {/* Tab Bar */}
      <nav aria-label="Asosiy navigatsiya" className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border">
        <div className="flex justify-around items-center px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-w-lg mx-auto">
          {([
            { id: "home" as Tab, icon: Home, label: "Bosh sahifa" },
            { id: "create" as Tab, icon: PenTool, label: "Yaratish" },
            { id: "history" as Tab, icon: Clock, label: "Tarix" },
            { id: "profile" as Tab, icon: User, label: "Profil" },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => switchTab(item.id)}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 ${
                tab === item.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon size={21} strokeWidth={tab === item.id ? 2.5 : 1.8} aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {tab === item.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
