"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Check,
  ChevronRight,
  Trash2,
  Package,
  History,
  Share2,
  UserPlus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/hooks/use-telegram";
import { EmptyState } from "@/components/zai/empty-state";
import { getAgentMeta as getAgentMetaFn } from "@/lib/agents";
import { BUSINESSES, pageVariants, type HistoryItem } from "@/lib/page-types";

// Backend TaskOut → HistoryItem mapping
interface BackendTaskOut {
  id: string;
  agent_name: string;
  agent_icon: string;
  input_text: string;
  output_text: string | null;
  status: string;
  created_at: string;
}

function mapBackendTask(task: BackendTaskOut): HistoryItem {
  return {
    id: task.id,
    topic: task.input_text || "",
    business_type: "other",
    language: "uz",
    tone: "friendly",
    content: task.output_text || "",
    tokens: 0,
    cost: 0,
    created_at: task.created_at,
  };
}

interface HistoryPageProps {
  history: HistoryItem[];
  onDelete: (id: string) => void;
  onClear: () => void;
  haptic: (t?: "light" | "medium" | "heavy") => void;
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
  onHistoryLoaded: (items: HistoryItem[]) => void;
  authUserId?: string;
}

export function HistoryPage({
  history,
  onDelete,
  onClear,
  haptic,
  fetchWithAuth,
  onHistoryLoaded,
  authUserId,
}: HistoryPageProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const { webapp } = useTelegram();

  // Fetch history from backend on mount, merge with localStorage
  useEffect(() => {
    let cancelled = false;
    async function fetchBackendHistory() {
      try {
        const data: BackendTaskOut[] = await fetchWithAuth("/api/tasks/history?limit=50");
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          // Backend is source of truth: map to HistoryItem
          const backendItems = data.map(mapBackendTask);
          // Merge: backend items first, then any localStorage-only items not in backend
          const backendIds = new Set(backendItems.map((i) => i.id));
          const localOnly = history.filter((i) => !backendIds.has(i.id));
          const merged = [...backendItems, ...localOnly].slice(0, 50);
          onHistoryLoaded(merged);
        }
      } catch {
        // Silently fall back to localStorage data already in state
      } finally {
        if (!cancelled) setLoadingBackend(false);
      }
    }
    fetchBackendHistory();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWithAuth]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    haptic("light");
    setTimeout(() => setCopied(null), 2000);
  };

  const BizIcon = (type: string) => BUSINESSES.find((b) => b.id === type)?.icon || Package;
  const bizLabel = (type: string) => BUSINESSES.find((b) => b.id === type)?.label || type;

  // Get accent colors from agent meta based on business_type
  const getAccent = (type: string) => {
    const slug = type === "other" ? "smm-content" : type;
    const meta = getAgentMetaFn(slug);
    return meta.accent;
  };

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

  // Filter chips config
  const FILTER_CHIPS: { id: string | null; label: string }[] = [
    { id: null, label: "Barcha" },
    { id: "smm", label: "SMM" },
    { id: "market-analysis", label: "Tahlil" },
    { id: "document-writer", label: "Hujjat" },
  ];

  // Filter logic: match by business_type or agent slug
  const filteredHistory = filter
    ? history.filter((item) => {
        if (filter === "smm") {
          // SMM includes all business types except market-analysis and document-writer
          return item.business_type !== "market-analysis" && item.business_type !== "document-writer";
        }
        return item.business_type === filter;
      })
    : history;

  // Loading skeleton while fetching from backend
  if (loadingBackend) {
    return (
      <motion.div {...pageVariants} className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Kontent tarixi</h2>
          <p className="text-xs text-muted-foreground">Yuklanmoqda...</p>
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-3.5 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-2/3" />
                  <div className="h-2.5 bg-muted rounded w-1/3" />
                </div>
              </div>
              <div className="h-2.5 bg-muted rounded w-full" />
              <div className="h-2.5 bg-muted rounded w-4/5" />
            </CardContent>
          </Card>
        ))}
      </motion.div>
    );
  }

  if (history.length === 0) {
    return (
      <motion.div {...pageVariants}>
        <h2 className="text-lg font-bold mb-1">Kontent tarixi</h2>
        <p className="text-sm text-muted-foreground mb-6">Avval yaratilgan postlar shu yerda ko&apos;rinadi</p>
        <EmptyState
          icon={History}
          title="Hali kontent yo'q"
          description="Birinchi postingizni yarating — AI 10 soniyada 3 ta variant tayyorlaydi"
        />
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
        <div className="flex items-center gap-2">
          {webapp?.openTelegramLink && authUserId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                haptic("light");
                webapp.openTelegramLink(`https://t.me/ZAIgentbot?startapp=ref_${authUserId}`);
              }}
            >
              <UserPlus size={13} /> Do&apos;stga tavsiya
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={onClear}>
            <Trash2 size={13} className="mr-1" /> Tozalash
          </Button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id ?? "all"}
            onClick={() => { setFilter(chip.id); haptic("light"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filter === chip.id
                ? "bg-primary text-white"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filteredHistory.map((item) => {
        const isExpanded = expandedId === item.id;
        const preview = item.content.slice(0, 120).replace(/\n/g, " ");
        const accent = getAccent(item.business_type);

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
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.bg} ${accent.text}`}>
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
                          {webapp?.shareToStory && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                haptic("light");
                                webapp.shareToStory(
                                  "https://zai.ustaitech.uz/share-card.png",
                                  item.topic ? { text: item.topic.slice(0, 200) } : undefined
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                            >
                              <Share2 size={13} /> Story
                            </motion.button>
                          )}
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

export default HistoryPage;
