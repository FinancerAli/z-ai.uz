"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, PenTool, Clock, Copy, Check, ChevronRight,
  Zap, User, Home, RotateCcw, Trash2, FileText, BarChart, 
  FileSearch, Briefcase, GraduationCap, Scissors, Laptop, 
  Stethoscope, ShoppingCart, Utensils, Package, Smile, Lock, History, Search, ArrowRight, ShieldCheck, Wallet, FileEdit
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { BorderBeam } from "@/components/magicui/border-beam";
import { Particles } from "@/components/magicui/particles";
import { useTelegram, cloudSet, cloudGet } from "@/hooks/use-telegram";
import { useApi } from "@/hooks/use-api";
import { TaskFeedback } from "@/components/task-feedback";
import { AgentPurchaseFlow } from "@/components/agent-purchase-flow";

// ======== TYPES ========
type Tab = "home" | "create" | "create_doc" | "create_market" | "history" | "profile" | "admin" | "brand";
type BusinessType = "ielts" | "beauty" | "it_course" | "clinic" | "ecommerce" | "restaurant" | "other";
type Language = "uz" | "ru" | "uz_ru";
type Tone = "friendly" | "formal" | "energetic";

interface ContentResult { content: string; tokens: number; cost: number; }
interface HistoryItem {
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
const HISTORY_KEY = "zai_history";
function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}
function saveHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

// ======== DATA ========
const BUSINESSES: { id: BusinessType; icon: any; label: string }[] = [
  { id: "ielts", icon: GraduationCap, label: "IELTS / Til markazi" },
  { id: "beauty", icon: Scissors, label: "Go'zallik saloni" },
  { id: "it_course", icon: Laptop, label: "IT kurslar" },
  { id: "clinic", icon: Stethoscope, label: "Klinika" },
  { id: "ecommerce", icon: ShoppingCart, label: "Online do'kon" },
  { id: "restaurant", icon: Utensils, label: "Restoran / Kafe" },
  { id: "other", icon: Package, label: "Boshqa" },
];
const LANGS: { id: Language; flag: string; label: string }[] = [
  { id: "uz", flag: "🇺🇿", label: "O'zbekcha" },
  { id: "ru", flag: "🇷🇺", label: "Ruscha" },
  { id: "uz_ru", flag: "🇺🇿🇷🇺", label: "Aralash" },
];
const TONES: { id: Tone; icon: any; label: string }[] = [
  { id: "friendly", icon: Smile, label: "Do'stona" },
  { id: "formal", icon: Briefcase, label: "Rasmiy" },
  { id: "energetic", icon: Zap, label: "Energetik" },
];

const API_BASE = "";

// ======== PAGE TRANSITIONS ========
const pageVariants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

// ======== MAIN ========
export default function ZAIApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [myAgents, setMyAgents] = useState<Array<{ slug: string; name: string; status: string }>>([]);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("trial");
  const { user, haptic, hapticSuccess, hapticSelect, showBack, hideBack } = useTelegram();
  const { isReady, authError, fetchWithAuth, authUser } = useApi();

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
    fetchWithAuth("/api/agents/my/list").then((data: any) => {
      setMyAgents(data || []);
    }).catch(() => {});
    // Trial ma'lumotlarini auth response'dan olish
    if (authUser) {
      setTrialExpiresAt(authUser.trial_expires_at || null);
      setUserPlan(authUser.plan || "trial");
    }
  }, [isReady, authError, fetchWithAuth, authUser]);

  // Hydration guard
  useEffect(() => { setMounted(true); }, []);

  // Load history on mount
  useEffect(() => { setHistory(loadHistory()); }, []);

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

  const switchTab = (t: Tab) => {
    hapticSelect();
    setTab(t);
  };

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
          {tab === "home" && <HomePage key="home" onNav={switchTab} haptic={haptic} postCount={history.length} myAgents={myAgents} trialExpiresAt={trialExpiresAt} userPlan={userPlan} />}
          {tab === "create" && <CreatePage key="create" haptic={haptic} hapticSuccess={hapticSuccess} onSave={addToHistory} fetchWithAuth={fetchWithAuth} />}
          {tab === "create_doc" && <CreateDocPage key="create_doc" haptic={haptic} hapticSuccess={hapticSuccess} fetchWithAuth={fetchWithAuth} onBack={() => switchTab("home")} />}
          {tab === "create_market" && <CreateMarketPage key="create_market" haptic={haptic} hapticSuccess={hapticSuccess} fetchWithAuth={fetchWithAuth} onBack={() => switchTab("home")} />}
          {tab === "history" && <HistoryPage key="history" history={history} onDelete={deleteFromHistory} onClear={clearHistory} haptic={haptic} />}
          {tab === "profile" && <ProfilePage key="profile" user={user} onNav={switchTab} haptic={haptic} myAgents={myAgents} onAgentActivated={() => fetchWithAuth("/api/agents/my/list").then((d: any) => setMyAgents(d || []))} trialExpiresAt={trialExpiresAt} userPlan={userPlan} />}
          {tab === "admin" && <AdminPage key="admin" user={user} onBack={() => switchTab("profile")} fetchWithAuth={fetchWithAuth} haptic={haptic} />}
          {tab === "brand" && <BrandProfilePage key="brand" onBack={() => switchTab("profile")} fetchWithAuth={fetchWithAuth} haptic={haptic} />}
        </AnimatePresence>
      </main>

      {/* Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border">
        <div className="flex justify-around items-center px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-w-lg mx-auto">
          {([
            { id: "home" as Tab, icon: Home, label: "Bosh sahifa" },
            { id: "create" as Tab, icon: PenTool, label: "Yaratish" },
            { id: "history" as Tab, icon: Clock, label: "Tarix" },
            { id: "profile" as Tab, icon: User, label: "Profil" },
          ]).map((item) => (
            <button
              key={item.id}
              onClick={() => switchTab(item.id)}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 ${
                tab === item.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon size={21} strokeWidth={tab === item.id ? 2.5 : 1.8} />
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

// ======== HOME ========
const AGENT_SLUGS: Record<string, string> = {
  create: "smm-content",
  create_market: "market-analysis",
  create_doc: "document-writer",
};

function HomePage({ onNav, haptic, postCount, myAgents, trialExpiresAt, userPlan }: { 
  onNav: (t: Tab) => void; 
  haptic: (t?: "light" | "medium" | "heavy") => void; 
  postCount: number;
  myAgents: Array<{ slug: string; status: string }>;
  trialExpiresAt?: string | null;
  userPlan?: string;
}) {
  // Trial qolgan kunlarni hisoblash
  const trialDaysLeft = (() => {
    if (!trialExpiresAt) return 0;
    const expires = new Date(trialExpiresAt);
    const now = new Date();
    const diff = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  })();

  const isTrialActive = userPlan === "trial" && trialDaysLeft > 0;

  const hasAgent = (tabId: string) => {
    // Trial davomida barcha agentlarga ruxsat
    if (isTrialActive) return true;
    const slug = AGENT_SLUGS[tabId];
    if (!slug) return true;
    return myAgents.some((a) => a.slug === slug && a.status === "active");
  };

  const handleNav = (tabId: Tab) => {
    if (!hasAgent(tabId)) {
      haptic("medium");
      // Profil sahifasiga (do'konga) yo'naltirish
      onNav("profile");
      return;
    }
    haptic("light");
    onNav(tabId);
  };
  return (
    <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="space-y-5">
      {/* Hero Banner */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary via-primary/90 to-chart-2 text-white shadow-xl">
        <Particles className="opacity-30" quantity={20} color="rgba(255,255,255,0.6)" />
        <CardContent className="relative z-10 p-6">
          <p className="text-sm opacity-90 mb-1">Xush kelibsiz! 👋</p>
          <h2 className="text-xl font-bold mb-2">Kontent yaratishni boshlang</h2>
          <p className="text-[13px] opacity-85 mb-5 leading-relaxed">
            AI yordamida professional postlar — 3 ta variant, 10 soniyada
          </p>
          <ShimmerButton
            background="rgba(255,255,255,0.18)"
            shimmerColor="rgba(255,255,255,0.4)"
            className="text-sm border border-white/25"
            onClick={() => { haptic("medium"); onNav("create"); }}
          >
            <Sparkles size={16} /> Kontent yaratish
          </ShimmerButton>
        </CardContent>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute right-10 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
              {postCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Yaratilgan postlar</p>
          </CardContent>
        </Card>
        <Card className={`border-border/60 ${trialDaysLeft <= 1 && isTrialActive ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
          <CardContent className="p-4">
            <div className={`text-2xl font-bold ${trialDaysLeft <= 1 && isTrialActive ? "text-amber-500" : "text-foreground"}`}>
              {isTrialActive ? trialDaysLeft : "—"}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {isTrialActive ? "Qolgan kun (sinov)" : userPlan === "trial" ? "Sinov tugagan" : "Obuna faol"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trial expired banner */}
      {userPlan === "trial" && trialDaysLeft === 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-sm font-semibold text-amber-600">⏰ Sinov muddati tugadi</p>
            <p className="text-xs text-muted-foreground">Agentlarni sotib oling va davom eting</p>
            <Button
              size="sm"
              className="bg-primary text-white text-xs"
              onClick={() => { haptic("medium"); onNav("profile"); }}
            >
              Agent do'koniga o'tish
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Tezkor harakatlar</h3>
        <div className="space-y-2.5">
          {[
            { icon: FileEdit, title: "Post yaratish", sub: "SMM va caption", tab: "create" as Tab },
            { icon: BarChart, title: "Biznes Tahlil", sub: "SWOT, Raqobatchilar", tab: "create_market" as Tab, lock: !hasAgent("create_market") },
            { icon: ShieldCheck, title: "Hujjat Tahlili", sub: "Risk va tarjima", tab: "create_doc" as Tab, lock: !hasAgent("create_doc") },
          ].map((item: any) => (
            <motion.div key={item.title} whileTap={{ scale: 0.98 }}>
              <Card
                className={`relative overflow-hidden transition-all duration-300 ${
                  item.lock 
                    ? "cursor-pointer opacity-80 border-dashed bg-muted/30" 
                    : "cursor-pointer hover:border-primary/40 shadow-sm border-border"
                }`}
                onClick={() => handleNav(item.tab)}
              >
                {!item.lock && <BorderBeam size={80} duration={12} delay={Math.random() * 5} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--chart-2))" />}
                <CardContent className="flex items-center gap-4 p-4 relative z-10">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${item.lock ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    <item.icon size={22} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold truncate text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
                  </div>
                  {item.lock ? (
                    <div className="flex items-center gap-1.5 bg-secondary px-2.5 py-1.5 rounded-xl border border-border/50 shrink-0">
                      <Lock size={12} className="text-muted-foreground" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Xarid</span>
                    </div>
                  ) : (
                    <ChevronRight size={18} className="text-muted-foreground shrink-0" />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}


// ======== CREATE DOC ========
function CreateDocPage({ haptic, hapticSuccess, fetchWithAuth, onBack }: any) {
  const [text, setText] = useState("");
  const [outputType, setOutputType] = useState("Xulosa");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runAgent = async () => {
    if (!text.trim()) return;
    setLoading(true); setResult(null); haptic("heavy");
    try {
      const data = await fetchWithAuth("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          agent_slug: "document-writer",
          input_text: text,
          context_data: { document_text: text, output_type: outputType, language: "O'zbek", extra_instruction: "" }
        }),
      });
      setResult(data.output_text || "Hech qanday natija qaytmadi");
      hapticSuccess();
    } catch (e: any) {
      setResult("⚠️ Xatolik yoki ushbu agent sizda faol emas.\n\n" + (e.message || ""));
    } finally { setLoading(false); }
  };

  return (
    <motion.div {...pageVariants} className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
         <Button variant="ghost" size="icon" onClick={onBack}><ChevronRight className="rotate-180" /></Button>
         <div>
           <h2 className="text-lg font-bold">Hujjat Tahlili</h2>
           <p className="text-xs text-muted-foreground">Matn yoki shartnomani tekshiring</p>
         </div>
      </div>
      
      {!result && !loading && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Tahlil turi</label>
            <div className="flex gap-2">
               {["Xulosa", "Risk tahlili", "Tarjima"].map((t) => (
                 <button key={t} onClick={() => {setOutputType(t); haptic("light");}} className={`px-3 py-1.5 rounded-lg border text-sm transition ${outputType===t ? "bg-primary text-white" : "bg-card text-foreground"}`}>
                   {t}
                 </button>
               ))}
            </div>
          </div>
          <Textarea placeholder="Hujjat matnini shu yerga joylang..." rows={8} value={text} onChange={(e)=>setText(e.target.value)} />
          <ShimmerButton className="w-full text-sm" onClick={runAgent} disabled={!text.trim()}>Tahlil qilish</ShimmerButton>
        </div>
      )}

      {loading && (
        <div className="py-20 text-center space-y-3">
           <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
           <p className="font-bold">Hujjat o'qilmoqda...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
           <Card><CardContent className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{result}</CardContent></Card>
           <Button className="w-full" variant="outline" onClick={() => setResult(null)}>Yangi tahlil</Button>
        </div>
      )}
    </motion.div>
  );
}

// ======== CREATE MARKET ========
function CreateMarketPage({ haptic, hapticSuccess, fetchWithAuth, onBack }: any) {
  const [biz, setBiz] = useState("");
  const [industry, setIndustry] = useState("");
  const [type, setType] = useState("SWOT");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runAgent = async () => {
    if (!biz.trim()) return;
    setLoading(true); setResult(null); haptic("heavy");
    try {
      const data = await fetchWithAuth("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          agent_slug: "market-analysis",
          input_text: biz,
          context_data: { business_name: biz, industry: industry, analysis_type: type, target_market: "O'zbekiston", goal: "" }
        }),
      });
      setResult(data.output_text || "Hech qanday natija qaytmadi");
      hapticSuccess();
    } catch (e: any) {
      setResult("⚠️ Xatolik yoki ushbu agent sizda faol emas.\n\n" + (e.message || ""));
    } finally { setLoading(false); }
  };

  return (
    <motion.div {...pageVariants} className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
         <Button variant="ghost" size="icon" onClick={onBack}><ChevronRight className="rotate-180" /></Button>
         <div>
           <h2 className="text-lg font-bold">Biznes Tahlil</h2>
           <p className="text-xs text-muted-foreground">Bozor va raqobatchilarni tahlil qiling</p>
         </div>
      </div>
      
      {!result && !loading && (
        <div className="space-y-4">
          <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Biznes nomi (Masalan: Evos)" value={biz} onChange={e=>setBiz(e.target.value)} />
          <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Soha (Masalan: Fast Food)" value={industry} onChange={e=>setIndustry(e.target.value)} />
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Tahlil turi</label>
            <div className="flex flex-wrap gap-2">
               {["SWOT", "Target audience", "Raqobatchi tahlili"].map((t) => (
                 <button key={t} onClick={() => {setType(t); haptic("light");}} className={`px-3 py-1.5 rounded-lg border text-sm transition ${type===t ? "bg-primary text-white" : "bg-card text-foreground"}`}>
                   {t}
                 </button>
               ))}
            </div>
          </div>
          <ShimmerButton className="w-full text-sm" onClick={runAgent} disabled={!biz.trim()}>Tahlilni boshlash</ShimmerButton>
        </div>
      )}

      {loading && (
        <div className="py-20 text-center space-y-3">
           <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
           <p className="font-bold">Bozor o'rganilmoqda...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
           <Card><CardContent className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{result}</CardContent></Card>
           <Button className="w-full" variant="outline" onClick={() => setResult(null)}>Yangi tahlil</Button>
        </div>
      )}
    </motion.div>
  );
}

// ======== CREATE ========

function CreatePage({ haptic, hapticSuccess, onSave, fetchWithAuth }: { haptic: (t?: "light" | "medium" | "heavy") => void; hapticSuccess: () => void; onSave: (item: HistoryItem) => void; fetchWithAuth: any }) {
  const [step, setStep] = useState(1);
  const [biz, setBiz] = useState<BusinessType | null>(null);
  const [lang, setLang] = useState<Language>("uz");
  const [tone, setTone] = useState<Tone>("friendly");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // CloudStorage: Draft'ni avto-tiklash
  useEffect(() => {
    cloudGet("zai_draft_topic").then((val) => {
      if (val) setTopic(val);
    });
  }, []);

  // CloudStorage: Topic yozilganda avto-saqlash
  const handleTopicChange = useCallback((val: string) => {
    setTopic(val);
    cloudSet("zai_draft_topic", val);
  }, []);

  const { showMainButton, hideMainButton, setMainButtonLoading, isTelegram } = useTelegram();

  const generate = useCallback(async () => {
    if (!topic.trim() || !biz) return;
    setLoading(true);
    setMainButtonLoading(true);
    setResult(null);
    try {
      const data = await fetchWithAuth("/api/content/generate", {
        method: "POST",
        body: JSON.stringify({ topic: topic.trim(), business_type: biz, language: lang, tone, platform: "telegram" }),
      });
      setResult(data);
      setTaskId(data.task_id ?? null);
      setStep(4);
      hapticSuccess();
      cloudSet("zai_draft_topic", "");
      onSave({
        id: data.task_id ?? Date.now().toString(),
        topic: topic.trim(),
        business_type: biz,
        language: lang,
        tone,
        content: data.content,
        tokens: data.tokens,
        cost: data.cost,
        created_at: new Date().toISOString(),
      });
    } catch {
      setResult({
        content: "⚠️ Backend bilan bog'lanishda xatolik.\n\nBackend ishlayotganini tekshiring.",
        tokens: 0, cost: 0,
      });
      setStep(4);
    } finally { 
      setLoading(false); 
      setMainButtonLoading(false);
      hideMainButton();
    }
  }, [topic, biz, lang, tone, fetchWithAuth, hapticSuccess, onSave, setMainButtonLoading, hideMainButton]);

  const handleStep2Next = useCallback(() => { haptic("medium"); setStep(3); }, [haptic]);

  useEffect(() => {
    if (step === 2) {
      showMainButton("Davom etish", handleStep2Next);
    } else if (step === 3 && topic.length >= 3 && !loading) {
      showMainButton("✨ Yaratish", generate, "#7c3aed");
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [step, topic, loading, generate, handleStep2Next, showMainButton, hideMainButton]);

  const copyText = (text: string, i: number) => {
    navigator.clipboard.writeText(text);
    setCopied(i);
    haptic("light");
    setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setStep(1); setBiz(null); setLang("uz"); setTone("friendly"); setTopic(""); setResult(null); setTaskId(null);
    cloudSet("zai_draft_topic", "");
  };

  const parseVariants = (c: string): string[] => {
    const parts = c.split(/📌\s*Variant\s*\d+[:\s]*/i).filter(Boolean);
    return parts.length >= 2 ? parts.slice(0, 3) : [c];
  };

  return (
    <motion.div {...pageVariants}>
      {/* Progress */}
      <div className="flex gap-1.5 mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${s <= step ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Business */}
        {step === 1 && (
          <motion.div key="s1" {...pageVariants} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Biznes turingiz</h2>
              <p className="text-sm text-muted-foreground">Qaysi soha uchun kontent yaratamiz?</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {BUSINESSES.map((b) => (
                <motion.button
                  key={b.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setBiz(b.id); haptic("light"); setTimeout(() => setStep(2), 150); }}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all duration-200 ${
                    biz === b.id
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                      : "bg-card border-border hover:border-primary/40 text-foreground"
                  }`}
                >
                  <b.icon size={16} /> {b.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 2: Language + Tone (Drawer) */}
        {step === 2 && (
          <motion.div key="s2" {...pageVariants} className="space-y-5">
            <div>
              <h2 className="text-lg font-bold">Til va uslub</h2>
              <p className="text-sm text-muted-foreground">Qaysi tilda va qanday tonda yozamiz?</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Til</p>
              <div className="flex gap-2">
                {LANGS.map((l) => (
                  <motion.button
                    key={l.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setLang(l.id); haptic("light"); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      lang === l.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                    }`}
                  >
                    <span>{l.flag}</span> {l.label}
                  </motion.button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Uslub</p>
              <div className="flex gap-2">
                {TONES.map((t) => (
                  <motion.button
                    key={t.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setTone(t.id); haptic("light"); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      tone === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                    }`}
                  >
                    <t.icon size={16} /> {t.label}
                  </motion.button>
                ))}
              </div>
            </div>
            {!isTelegram && (
              <ShimmerButton className="w-full text-sm" onClick={handleStep2Next}>
                Davom etish →
              </ShimmerButton>
            )}
            <Button variant="ghost" className="w-full" onClick={() => setStep(1)}>← Orqaga</Button>
          </motion.div>
        )}

        {/* Step 3: Topic */}
        {step === 3 && !loading && (
          <motion.div key="s3" {...pageVariants} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Post mavzusi</h2>
              <p className="text-sm text-muted-foreground">Qancha aniq yozsangiz — natija shuncha yaxshi.</p>
            </div>
            <Textarea
              placeholder='Masalan: "Yangi guruhga qabul, 30% chegirma"'
              rows={4}
              value={topic}
              onChange={(e) => handleTopicChange(e.target.value)}
              className="resize-none text-[15px]"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {["Yangi guruhga qabul", "Chegirma aksiyasi", "Mijoz natijasi", "Bepul sinov darsi"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setTopic(s); haptic("light"); }}
                  className="px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground hover:border-primary/40 transition"
                >
                  {s}
                </button>
              ))}
            </div>
            {!isTelegram && (
              <ShimmerButton
                className="w-full text-sm"
                onClick={() => { haptic("heavy"); generate(); }}
                disabled={!topic.trim()}
              >
                <Sparkles size={16} /> Yaratish
              </ShimmerButton>
            )}
            <Button variant="ghost" className="w-full" onClick={() => setStep(2)}>← Orqaga</Button>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-5"
          >
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center shadow-xl shadow-primary/30">
                <Sparkles size={28} className="text-white animate-pulse" />
              </div>
              <Particles className="!absolute -inset-10" quantity={15} color="oklch(0.49 0.27 270)" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-base">ZAI ishlamoqda...</p>
              <p className="text-sm text-muted-foreground mt-1">3 ta kuchli variant tayyorlanmoqda</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-primary"
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 4: Results */}
        {step === 4 && result && !loading && (
          <motion.div key="s4" {...pageVariants} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Tayyor! ✨</h2>
                <p className="text-xs text-muted-foreground">
                  {result.tokens > 0 ? `${result.tokens} token · $${result.cost.toFixed(4)}` : "Postlar tayyorlandi"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw size={13} /> Yangi
              </Button>
            </div>

            {parseVariants(result.content).map((variant, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
              >
                <Card className="relative overflow-hidden">
                  <BorderBeam duration={8 + i * 4} delay={i * 2} size={150} />
                  <CardContent className="p-4 space-y-3">
                    <Badge className="bg-gradient-to-r from-primary to-chart-2 text-white border-0 gap-1">
                      <Zap size={11} /> Variant {i + 1}
                    </Badge>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{variant.trim()}</p>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => copyText(variant.trim(), i)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        copied === i
                          ? "bg-emerald-500 text-white"
                          : "bg-accent text-primary hover:bg-primary hover:text-primary-foreground"
                      }`}
                    >
                      {copied === i ? <><Check size={13} /> Nusxalandi!</> : <><Copy size={13} /> Nusxalash</>}
                    </motion.button>
                    {/* Feedback tugmalari — faqat birinchi variant uchun */}
                    {i === 0 && taskId && (
                      <TaskFeedback taskId={taskId} onRedo={() => { haptic("medium"); generate(); }} />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            <ShimmerButton className="w-full text-sm" onClick={() => { haptic("medium"); generate(); }}>
              🔄 Yana yaratish (shu mavzu)
            </ShimmerButton>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ======== HISTORY ========
function HistoryPage({ history, onDelete, onClear, haptic }: {
  history: HistoryItem[];
  onDelete: (id: string) => void;
  onClear: () => void;
  haptic: (t?: "light" | "medium" | "heavy") => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    haptic("light");
    setTimeout(() => setCopied(null), 2000);
  };

  const BizIcon = (type: string) => BUSINESSES.find((b) => b.id === type)?.icon || Package;
  const bizLabel = (type: string) => BUSINESSES.find((b) => b.id === type)?.label || type;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Hozir";
    if (mins < 60) return `${mins} daqiqa oldin`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} soat oldin`;
    return d.toLocaleDateString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (history.length === 0) {
    return (
      <motion.div {...pageVariants}>
        <h2 className="text-lg font-bold mb-1">Kontent tarixi</h2>
        <p className="text-sm text-muted-foreground mb-6">Avval yaratilgan postlar shu yerda ko&apos;rinadi</p>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-muted-foreground mb-4 opacity-50"><History size={48} strokeWidth={1} /></div>
            <p className="font-semibold mb-1">Hali kontent yo&apos;q</p>
            <p className="text-sm text-muted-foreground">Birinchi postingizni yarating</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div {...pageVariants} className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Kontent tarixi</h2>
          <p className="text-xs text-muted-foreground">{history.length} ta post yaratilgan</p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={onClear}>
          <Trash2 size={13} className="mr-1" /> Tozalash
        </Button>
      </div>

      {history.map((item) => {
        const isExpanded = expandedId === item.id;
        const preview = item.content.slice(0, 120).replace(/\n/g, " ");

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            layout
          >
            <Card
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => { setExpandedId(isExpanded ? null : item.id); haptic("light"); }}
            >
              <CardContent className="p-3.5 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {(() => { const Icon = BizIcon(item.business_type); return <Icon size={20} />; })()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.topic}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {bizLabel(item.business_type)} · {formatDate(item.created_at)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                </div>

                {/* Preview or Full Content */}
                <AnimatePresence>
                  {isExpanded ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 border-t border-border">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => { e.stopPropagation(); copyText(item.content, item.id); }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              copied === item.id
                                ? "bg-emerald-500 text-white"
                                : "bg-accent text-primary hover:bg-primary hover:text-primary-foreground"
                            }`}
                          >
                            {copied === item.id ? <><Check size={13} /> Nusxalandi!</> : <><Copy size={13} /> Nusxalash</>}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-destructive hover:bg-destructive hover:text-white transition-all"
                          >
                            <Trash2 size={13} /> O&apos;chirish
                          </motion.button>
                          {item.tokens > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-auto">
                              {item.tokens} token
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <p className="text-xs text-muted-foreground line-clamp-2">{preview}...</p>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ======== ADMIN PAGE ========
function AdminPage({ user, onBack, fetchWithAuth, haptic }: { user: any; onBack: () => void; fetchWithAuth: any; haptic: any }) {
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [pendingPurchases, setPendingPurchases] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<"overview" | "users" | "tasks">("overview");
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, tasksData, pendingData, usersData] = await Promise.all([
          fetchWithAuth("/api/admin/stats"),
          fetchWithAuth("/api/admin/tasks?limit=50"),
          fetchWithAuth("/api/agents/admin/purchases/pending"),
          fetchWithAuth("/api/admin/users?limit=50"),
        ]);
        if (statsData) setStats(statsData);
        if (tasksData) setTasks(tasksData);
        if (pendingData) setPendingPurchases(pendingData);
        if (usersData) setUsers(usersData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [fetchWithAuth]);

  const handleApprove = async (uaId: string) => {
    if (!confirm("Tasdiqlaysizmi?")) return;
    try {
      await fetchWithAuth(`/api/agents/admin/purchases/${uaId}/approve`, { method: "POST" });
      setPendingPurchases(prev => prev.filter(p => p.user_agent_id !== uaId));
      haptic("medium");
    } catch (e) {
      alert("Xatolik yuz berdi");
    }
  };

  const handleReject = async (uaId: string) => {
    if (!confirm("Rad etasizmi?")) return;
    try {
      await fetchWithAuth(`/api/agents/admin/purchases/${uaId}/reject`, { method: "POST" });
      setPendingPurchases(prev => prev.filter(p => p.user_agent_id !== uaId));
      haptic("medium");
    } catch (e) {
      alert("Xatolik yuz berdi");
    }
  };

  return (
    <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => { haptic("light"); onBack(); }}>
          <ChevronRight className="w-4 h-4 rotate-180" />
        </Button>
        <h2 className="text-lg font-bold">ZAI Admin Panel</h2>
      </div>

      {loading ? (
        <div className="text-center py-10 space-y-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 animate-pulse mx-auto" />
          <p className="text-xs text-muted-foreground">Yuklanmoqda...</p>
        </div>
      ) : (
        <>
          {/* Section tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              { id: "overview" as const, label: "Umumiy" },
              { id: "users" as const, label: `Foydalanuvchilar (${stats?.total_users || 0})` },
              { id: "tasks" as const, label: "Topshiriqlar" },
            ]).map(s => (
              <button
                key={s.id}
                onClick={() => { setActiveSection(s.id); haptic("light"); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeSection === s.id ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {activeSection === "overview" && (
          <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border/60 bg-gradient-to-br from-background to-primary/5">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Foydalanuvchilar</p>
                <p className="text-xl font-bold">{stats?.total_users || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-gradient-to-br from-background to-primary/5">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Topshiriqlar (Bugun)</p>
                <p className="text-xl font-bold">{stats?.today_tasks || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-gradient-to-br from-background to-emerald-500/5">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Sinov (faol)</p>
                <p className="text-xl font-bold text-emerald-500">{stats?.trial_users || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-gradient-to-br from-background to-amber-500/5">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Sinov tugagan</p>
                <p className="text-xl font-bold text-amber-500">{stats?.expired_trials || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-gradient-to-br from-background to-primary/5">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Xarajat (AI)</p>
                <p className="text-xl font-bold text-emerald-500">${stats?.cost?.toFixed(3) || "0.000"}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-gradient-to-br from-background to-primary/5">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Tokenlar</p>
                <p className="text-xl font-bold">{(stats?.tokens_used || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {pendingPurchases.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-6 mb-2 text-amber-500">Kutilayotgan Xaridlar</h3>
              <div className="space-y-2">
                {pendingPurchases.map(p => (
                  <Card key={p.user_agent_id} className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[12px] font-bold">{p.agent_name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.username ? `@${p.username}` : p.telegram_id}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-background text-amber-500 border-amber-500/20">{p.plan_type}</Badge>
                      </div>
                      <div className="flex justify-between gap-2 mt-3 pt-2 border-t border-amber-500/10">
                        <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => handleReject(p.user_agent_id)}>
                          Rad etish
                        </Button>
                        <Button size="sm" className="h-7 text-[10px] flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleApprove(p.user_agent_id)}>
                          Tasdiqlash
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
          </>
          )}

          {activeSection === "tasks" && (
          <>
          <h3 className="text-sm font-semibold mt-2 mb-2">So'nggi Topshiriqlar</h3>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Hozircha topshiriqlar yo'q</p>
            ) : (
              tasks.map(task => (
                <Card key={task.id} className="border-border/50">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-background">{task.agent_slug}</Badge>
                        <p className="text-[11px] font-semibold">{task.username ? `@${task.username}` : task.telegram_id}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium border ${task.status === "completed" || task.status === "done" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : task.status === "failed" ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}>
                        {task.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{task.input_text}</p>
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-border/30 text-[10px] text-muted-foreground font-medium">
                      <span>{new Date(task.created_at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{task.tokens_used} tkn • ${task.cost?.toFixed(4)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          </>
          )}

          {activeSection === "users" && (
          <>
          <h3 className="text-sm font-semibold mt-2 mb-2">Foydalanuvchilar</h3>
          <div className="space-y-2">
            {users.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Foydalanuvchilar topilmadi</p>
            ) : (
              users.map(u => (
                <Card key={u.id} className="border-border/50">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <p className="text-[12px] font-bold">{u.first_name || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{u.username ? `@${u.username}` : u.telegram_id}</p>
                      </div>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                        u.plan === "trial" && u.status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                        u.status === "expired" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        "bg-background"
                      }`}>
                        {u.plan === "trial" && u.status === "active" ? "Trial faol" : u.status === "expired" ? "Tugagan" : u.plan}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                      <span>{u.tasks_count} task</span>
                      {u.trial_expires_at && (
                        <span>Tugash: {new Date(u.trial_expires_at).toLocaleDateString("uz-UZ")}</span>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            await fetchWithAuth(`/api/admin/users/${u.id}/extend-trial?days=3`, { method: "POST" });
                            haptic("medium");
                            // Reload users
                            const data = await fetchWithAuth("/api/admin/users?limit=50");
                            if (data) setUsers(data);
                          } catch (e) { console.error(e); }
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium"
                      >
                        +3 kun
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          </>
          )}
        </>
      )}
    </motion.div>
  );
}

// ======== BRAND PROFILE ========
function BrandProfilePage({ onBack, fetchWithAuth, haptic }: { onBack: () => void; fetchWithAuth: any; haptic: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>({
    business_name: "",
    industry: "",
    target_audience: "",
    products_services: "",
    brand_tone: "Kasbiy",
    main_cta: ""
  });

  useEffect(() => {
    fetchWithAuth("/api/brand-profile").then((data: any) => {
      if (data) setProfile(data);
    }).finally(() => setLoading(false));
  }, [fetchWithAuth]);

  const handleSave = async () => {
    if (!profile.business_name || !profile.industry || !profile.target_audience || !profile.products_services || !profile.main_cta) {
      alert("Iltimos, barcha majburiy maydonlarni to'ldiring");
      return;
    }
    setSaving(true);
    try {
      await fetchWithAuth("/api/brand-profile", {
        method: "POST",
        body: JSON.stringify(profile)
      });
      haptic("medium");
      onBack();
    } catch (e) {
      alert("Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="space-y-4 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full bg-secondary/50" onClick={() => { haptic("light"); onBack(); }}>
          <ChevronRight className="w-4 h-4 rotate-180" />
        </Button>
        <h2 className="text-lg font-bold">Mening Brendim</h2>
      </div>

      {loading ? (
        <div className="text-center py-10"><div className="w-8 h-8 rounded-full bg-primary/20 animate-pulse mx-auto" /></div>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground mb-4">
              Brendingiz haqidagi ma'lumotlarni kiriting. Bu ma'lumotlar AI agentingizga siz uchun mukammal moslashtirilgan kontent yaratishda yordam beradi.
            </p>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground">Biznes nomi <span className="text-rose-500">*</span></label>
              <input className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" placeholder="Masalan: Evos" value={profile.business_name || ""} onChange={e => setProfile({...profile, business_name: e.target.value})} />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground">Soha (Industriya) <span className="text-rose-500">*</span></label>
              <input className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" placeholder="Masalan: Fast Food" value={profile.industry || ""} onChange={e => setProfile({...profile, industry: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground">Maqsadli Auditoriya <span className="text-rose-500">*</span></label>
              <Textarea className="w-full text-sm p-2.5 rounded-xl border border-border bg-background resize-none h-16" placeholder="Kimlarga sotasiz? Yosh, qiziqishlari..." value={profile.target_audience || ""} onChange={e => setProfile({...profile, target_audience: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground">Mahsulot yoki Xizmatlar <span className="text-rose-500">*</span></label>
              <Textarea className="w-full text-sm p-2.5 rounded-xl border border-border bg-background resize-none h-16" placeholder="Nimalar sotasiz?" value={profile.products_services || ""} onChange={e => setProfile({...profile, products_services: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground">Asosiy Harakat (CTA) <span className="text-rose-500">*</span></label>
              <input className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" placeholder="Masalan: Hozir buyurtma bering" value={profile.main_cta || ""} onChange={e => setProfile({...profile, main_cta: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground">Brend ohangi (Tone)</label>
              <select className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" value={profile.brand_tone || "Kasbiy"} onChange={e => setProfile({...profile, brand_tone: e.target.value})}>
                <option value="Do'stona">Do'stona (Friendly)</option>
                <option value="Kasbiy">Kasbiy (Formal)</option>
                <option value="Energetik">Energetik (Energetic)</option>
                <option value="Hazilomuz">Hazilomuz (Humorous)</option>
              </select>
            </div>

            <Button className="w-full mt-4 h-11 bg-primary hover:bg-primary/90 text-white rounded-xl" onClick={handleSave} disabled={saving}>
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

// ======== PROFILE ========
function ProfilePage({ user, onNav, haptic, myAgents, onAgentActivated, trialExpiresAt, userPlan }: { 
  user?: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string }; 
  onNav?: (t: Tab) => void; 
  haptic: any;
  myAgents?: Array<{ slug: string; name: string; status: string }>;
  onAgentActivated?: () => void;
  trialExpiresAt?: string | null;
  userPlan?: string;
}) {
  const name = user ? `${user.first_name} ${user.last_name || ""}`.trim() : "Foydalanuvchi";
  const initial = name.charAt(0).toUpperCase();
  const [purchasingAgent, setPurchasingAgent] = useState<{ id: string; name: string; icon: any; price: number } | null>(null);
  const { fetchWithAuth } = useApi();
  const { hapticSuccess } = useTelegram();
  const [storeAgents, setStoreAgents] = useState<Array<{ id: string; slug: string; name: string; icon: string; price_monthly: number; description: string }>>([]);

  // Trial qolgan kunlarni hisoblash
  const trialDaysLeft = (() => {
    if (!trialExpiresAt) return 0;
    const expires = new Date(trialExpiresAt);
    const now = new Date();
    const diff = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  })();
  const isTrialActive = userPlan === "trial" && trialDaysLeft > 0;

  // Agent store'dan agentlarni yuklash
  useEffect(() => {
    fetchWithAuth("/api/agents").then((data) => {
      setStoreAgents(data || []);
    }).catch(() => {});
  }, [fetchWithAuth]);

  const getAgentStatus = (slug: string) => {
    return myAgents?.find((a) => a.slug === slug)?.status || null;
  };

  // Badge text
  const badgeText = isTrialActive
    ? `🕐 Sinov: ${trialDaysLeft} kun qoldi`
    : userPlan === "trial"
    ? "⏰ Sinov tugagan"
    : myAgents && myAgents.length > 0
    ? "✅ Obuna faol"
    : "🆓 Bepul sinov";

  const badgeClass = isTrialActive
    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
    : userPlan === "trial" && trialDaysLeft === 0
    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
    : "";

  return (
    <motion.div {...pageVariants} className="space-y-4">
      <h2 className="text-lg font-bold mb-1">Profilim</h2>

      {/* Profile card */}
      <Card>
        <CardContent className="flex flex-col items-center py-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-2xl font-bold text-white mb-3 shadow-lg shadow-primary/20">
            {initial}
          </div>
          <p className="font-bold text-base">{name}</p>
          {user?.username && <p className="text-xs text-muted-foreground">@{user.username}</p>}
          <Badge variant="secondary" className={`mt-2 text-[11px] ${badgeClass}`}>{badgeText}</Badge>
          
          {/* ADMIN BUTTON */}
          {(user?.id === 963810115 || user?.id === 1866763435) && (
            <Button variant="outline" size="sm" className="mt-4 w-full text-xs font-semibold border-primary/40 text-primary bg-primary/5" onClick={() => { haptic?.("medium"); onNav?.("admin"); }}>
              <Sparkles className="w-3 h-3 mr-1.5" /> Admin Panel
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Brand Profile Button */}
      <Card className="border-border/60 hover:bg-secondary/10 transition-colors cursor-pointer" onClick={() => { haptic?.("medium"); onNav?.("brand"); }}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Mening Brendim</h3>
              <p className="text-[11px] text-muted-foreground">AI uchun biznes ma'lumotlari</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </CardContent>
      </Card>

      {/* Agent Store */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Agent Do'koni</h3>
        <div className="space-y-2.5">
          {storeAgents.length === 0 ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 skeleton rounded-2xl" />
              ))}
            </div>
          ) : storeAgents.map((agent) => {
            const status = getAgentStatus(agent.slug);
            const isActive = status === "active";
            const isPending = status === "pending";

            // Matche titles and icons to Quick Actions
            let displayInfo = { title: agent.name, sub: agent.description?.slice(0, 50) + "...", icon: <Package size={22} strokeWidth={2} /> };
            if (agent.slug === "smm-content") displayInfo = { title: "SMM Kontent Agent", sub: "Telegram, Instagram va reklama matnlari...", icon: <FileEdit size={22} strokeWidth={2} /> };
            if (agent.slug === "market-analysis") displayInfo = { title: "Market/Biznes Tahlil Agent", sub: "SWOT, target audience, raqobatchilar...", icon: <BarChart size={22} strokeWidth={2} /> };
            if (agent.slug === "document-writer") displayInfo = { title: "Hujjat Tahlil Agent", sub: "Matn va hujjatlarni tahlil qiladi, xulosa...", icon: <ShieldCheck size={22} strokeWidth={2} /> };

            return (
              <motion.div key={agent.id} whileTap={{ scale: 0.98 }}>
                <Card className={`relative overflow-hidden transition-all duration-300 ${isActive ? "border-emerald-500/40 bg-emerald-500/5 shadow-sm shadow-emerald-500/10" : "border-border hover:border-primary/40 bg-card shadow-sm"}`}>
                  {!isActive && !isPending && <BorderBeam size={80} duration={12} delay={Math.random() * 5} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--chart-2))" />}
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-sm">
                      {displayInfo.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold truncate text-foreground">{displayInfo.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{displayInfo.sub}</p>
                      <p className="text-xs font-bold text-primary mt-1">{agent.price_monthly?.toLocaleString()} so&apos;m/oy</p>
                    </div>
                    {isActive ? (
                      <Badge className="text-[10px] bg-emerald-500 text-white border-0 shrink-0">Faol</Badge>
                    ) : isPending ? (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Kutilmoqda</Badge>
                    ) : (
                      <ShimmerButton
                        className="h-8 px-3"
                        shimmerSize="0.05em"
                        background="hsl(var(--primary))"
                        onClick={() => {
                          haptic("medium");
                          setPurchasingAgent({ id: agent.id, name: displayInfo.title, icon: displayInfo.icon, price: agent.price_monthly });
                        }}
                      >
                        <span className="text-[11px] font-bold flex items-center whitespace-nowrap text-white z-10 relative">
                          <ShoppingCart size={13} className="mr-1.5" /> Xarid
                        </span>
                      </ShimmerButton>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* AgentPurchaseFlow modal */}
      <AnimatePresence>
        {purchasingAgent && (
          <AgentPurchaseFlow
            agentId={purchasingAgent.id}
            agentName={purchasingAgent.name}
            agentIcon={purchasingAgent.icon}
            priceMonthly={purchasingAgent.price}
            onSuccess={() => {
              setPurchasingAgent(null);
              hapticSuccess();
              onAgentActivated?.();
              // Ro'yxatni yangilash
              fetchWithAuth("/api/agents/my/list").then((d: any) => {
                // ProfilePage ichida o'z stateni ham yangilaymiz
                // (parent'dan myAgents kelayotganligi sababli onAgentActivated yetarli)
              }).catch(() => {});
            }}
            onClose={() => setPurchasingAgent(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
