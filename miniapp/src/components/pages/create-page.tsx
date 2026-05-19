"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Copy, Check, RotateCcw, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { GenerationProgress } from "@/components/zai/generation-progress";
import { BorderBeam } from "@/components/magicui/border-beam";
import { useTelegram, cloudSet, cloudGet } from "@/hooks/use-telegram";
import { RateLimitError } from "@/hooks/use-api";
import { useAnalytics } from "@/hooks/use-analytics";
import { TaskFeedback } from "@/components/task-feedback";
import { RateLimitBanner } from "@/components/zai/rate-limit-banner";
import { UsageIndicator } from "@/components/zai/usage-indicator";
import {
  BUSINESSES,
  LANGS,
  TONES,
  pageVariants,
  type BusinessType,
  type ContentResult,
  type HistoryItem,
  type Language,
  type Tone,
} from "@/lib/page-types";

interface CreatePageProps {
  haptic: (t?: "light" | "medium" | "heavy") => void;
  hapticSuccess: () => void;
  onSave: (item: HistoryItem) => void;
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
}

export function CreatePage({ haptic, hapticSuccess, onSave, fetchWithAuth }: CreatePageProps) {
  const [step, setStep] = useState(1);
  const [biz, setBiz] = useState<BusinessType | null>(null);
  const [lang, setLang] = useState<Language>("uz");
  const [tone, setTone] = useState<Tone>("friendly");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ retryAfter: number } | null>(null);
  const { track } = useAnalytics();

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
    setRateLimitInfo(null);
    const startedAt = Date.now();
    try {
      // /api/tasks endpoint — subscription/trial tekshiruvi bilan
      const data = await fetchWithAuth("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          agent_slug: "smm-content",
          input_text: topic.trim(),
          context_data: { business_type: biz, language: lang, tone, platform: "telegram" },
        }),
      });
      // TaskOut formatidan ContentResult formatiga o'girish
      const content = data.output_text || data.content || "";
      const taskResult: ContentResult = {
        content,
        tokens: data.tokens_used ?? data.tokens ?? 0,
        cost: data.cost ?? 0,
      };
      setResult(taskResult);
      setTaskId(data.id ?? data.task_id ?? null);
      setStep(4);
      hapticSuccess();
      cloudSet("zai_draft_topic", "");
      // Analytics: muvaffaqiyatli generatsiya — PII yo'q, faqat metadata
      track("content_generated", {
        agent_slug: "smm-content",
        duration_ms: Date.now() - startedAt,
        tokens: taskResult.tokens,
        business_type: biz,
      });
      onSave({
        id: data.id ?? data.task_id ?? Date.now().toString(),
        topic: topic.trim(),
        business_type: biz,
        language: lang,
        tone,
        content,
        tokens: taskResult.tokens,
        cost: taskResult.cost,
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      if (e instanceof RateLimitError) {
        setRateLimitInfo({ retryAfter: e.retryAfter });
        setStep(4);
        track("error_shown", { agent_slug: "smm-content", kind: "rate_limit" });
        return;
      }
      const msg = e?.message || "";
      const isLimit = msg.includes("429") || msg.toLowerCase().includes("limit");
      setResult({
        content: isLimit
          ? "⏰ Kunlik limit tugadi.\n\nSinov davrida kuniga 10 ta kontent yaratish mumkin.\nErtaga qayta urinib ko'ring yoki agentni sotib oling."
          : "⚠️ Xatolik yuz berdi.\n\nQayta urinib ko'ring.",
        tokens: 0, cost: 0,
      });
      setStep(4);
      track("error_shown", {
        agent_slug: "smm-content",
        kind: isLimit ? "daily_limit" : "generic",
      });
    } finally {
      setLoading(false);
      setMainButtonLoading(false);
      hideMainButton();
    }
  }, [topic, biz, lang, tone, fetchWithAuth, hapticSuccess, onSave, setMainButtonLoading, hideMainButton, track]);

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
    setRateLimitInfo(null);
    cloudSet("zai_draft_topic", "");
  };

  const parseVariants = (c: string): string[] => {
    // Yangi format: ## Variant N — Nom
    const sections = c.split(/(?=##\s*Variant\s+\d+)/i).filter(Boolean);
    if (sections.length >= 2) {
      return sections.slice(0, 3).map(s =>
        s.replace(/##\s*Variant\s+\d+[—\-]?\s*/i, "").trim()
      );
    }
    // Eski format fallback: 📌 Variant N
    const parts = c.split(/📌\s*Variant\s*\d+[:\s]*/i).filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 3);
    // Hech biri ishlamasa — butun matn bitta variant
    return [c];
  };

  return (
    <motion.div {...pageVariants}>
      {/* Limit indicator — yuqorida foydalanuvchi qancha task ishlatganini ko'rsatadi */}
      <UsageIndicator fetchWithAuth={fetchWithAuth} refreshKey={result?.tokens ? 1 : 0} />

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
              <Button className="w-full" onClick={handleStep2Next}>
                Davom etish →
              </Button>
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
              aria-label="Post mavzusi"
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
              <Button
                className="w-full"
                onClick={() => { haptic("heavy"); generate(); }}
                disabled={!topic.trim()}
                icon={<Sparkles size={16} />}
              >
                Yaratish
              </Button>
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
          >
            <GenerationProgress />
          </motion.div>
        )}

        {/* Step 4: Rate limit banner (429 holati) */}
        {step === 4 && rateLimitInfo && !loading && (
          <motion.div key="s4-rate" {...pageVariants} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">So&apos;rovlar chegarasi</h2>
              <p className="text-xs text-muted-foreground">Bir oz vaqt o&apos;tgach qayta urinib ko&apos;ring</p>
            </div>
            <RateLimitBanner
              retryAfter={rateLimitInfo.retryAfter}
              onRetry={() => {
                haptic("medium");
                setRateLimitInfo(null);
                generate();
              }}
              onDismiss={() => {
                setRateLimitInfo(null);
                reset();
              }}
            />
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

            <Button variant="secondary" className="w-full" onClick={() => { haptic("medium"); generate(); }}>
              🔄 Yana yaratish (shu mavzu)
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default CreatePage;
