"use client";

import { useState, useCallback, useEffect } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Zap, CheckCircle, XCircle, Loader2, Shield, Clock, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTelegram } from "@/hooks/use-telegram";
import { useApi, API_BASE } from "@/hooks/use-api";

// TON & USDT receiver address (ZAI company wallet) — EQ format
const ZAI_TON_ADDRESS = "EQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL";
// USDT Jetton master address on TON mainnet
const USDT_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX29IO0ChMMQRNHIwEO";

interface AgentPurchaseFlowProps {
  agentId: string;
  agentName: string;
  agentIcon: string;
  priceMonthly: number; // so'm
  onSuccess: () => void;
  onClose: () => void;
}

type FlowStep = "select_plan" | "connecting" | "confirm" | "waiting" | "success" | "failed";

const PLAN_OPTIONS = [
  { id: "monthly", label: "1 oy", duration: 30, multiplier: 1 },
  { id: "weekly", label: "1 hafta", duration: 7, multiplier: 7/30 },
];

// Taxminiy kurs: 1 USD ≈ 12,700 so'm, 1 TON ≈ 5.5 USD (yangilangan)
function somToTON(som: number): string {
  return (som / 12700 / 5.5).toFixed(3);
}

export function AgentPurchaseFlow({
  agentId, agentName, agentIcon, priceMonthly, onSuccess, onClose,
}: AgentPurchaseFlowProps) {
  const [step, setStep] = useState<FlowStep>("select_plan");
  const [plan, setPlan] = useState<"monthly" | "weekly">("monthly");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const { haptic, hapticSuccess, hapticError, showPopup, showMainButton, hideMainButton, setMainButtonLoading } = useTelegram();
  const { fetchWithAuth, token } = useApi();

  const priceSOm = plan === "weekly" ? Math.round(priceMonthly * 7 / 30) : priceMonthly;
  const priceTON = parseFloat(somToTON(priceSOm));

  // Narxni nanoTON ga o'girish
  const amountNano = BigInt(Math.round(priceTON * 1e9)).toString();

  // Backend'ga to'lovni tasdiqlash
  const verifyPayment = useCallback(async (hash: string, userAgentId: string) => {
    try {
      const res = await fetchWithAuth(`/api/payments/ton/verify`, {
        method: "POST",
        body: JSON.stringify({
          tx_hash: hash,
          user_agent_id: userAgentId,
          amount_usdt: priceTON * 5.5,
          currency: "TON",
          plan_type: plan,
        }),
      });
      if (res.activated) {
        hapticSuccess();
        setStep("success");
        if (pollInterval) clearInterval(pollInterval);
        setTimeout(onSuccess, 2000);
      }
    } catch {
      // Hali tasdiqlanmagan — polling davom etadi
    }
  }, [fetchWithAuth, priceTON, plan, hapticSuccess, pollInterval, onSuccess]);

  // To'lovni boshlash
  const startPayment = useCallback(async () => {
    if (!wallet) {
      haptic("medium");
      setStep("connecting");
      tonConnectUI.openModal();
      return;
    }

    setError(null);
    setStep("confirm");
  }, [wallet, haptic, tonConnectUI]);

  // TON / USDT tranzaksiya yuborish
  const sendTransaction = useCallback(async () => {
    haptic("heavy");
    setStep("waiting");

    try {
      // Avval backend'da purchase request yaratamiz
      const purchaseRes = await fetchWithAuth(`/api/agents/${agentId}/purchase`, {
        method: "POST",
        body: JSON.stringify({ plan_type: plan }),
      });
      const userAgentId: string = purchaseRes.user_agent_id;

      // TON Connect orqali tranzaksiya yuborish
      const { beginCell } = await import("@ton/core");
      const bodyCell = beginCell()
        .storeUint(0, 32)
        .storeStringTail(`zai_pay:${userAgentId}`)
        .endCell();
      const payloadBoc = bodyCell.toBoc().toString("base64");

      const tx = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600, // 10 daqiqa
        messages: [
          {
            address: ZAI_TON_ADDRESS,
            amount: amountNano,
            payload: payloadBoc,
          },
        ],
      });

      const hash = tx.boc;
      setTxHash(hash);

      // Polling: 3 soniyada bir backend'ga tekshiramiz (max 3 daqiqa)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (attempts > 60) {
          clearInterval(interval);
          setStep("failed");
          setError("To'lov tasdiqlanmadi (timeout). Iltimos adminga murojaat qiling.");
          return;
        }
        verifyPayment(hash, userAgentId);
      }, 3000);
      setPollInterval(interval);

    } catch (err: any) {
      hapticError();
      if (err?.message?.includes("USER_REJECTS")) {
        setStep("confirm");
        setError("To'lov bekor qilindi.");
      } else {
        setStep("failed");
        setError(err?.message || "To'lov xatosi");
      }
    }
  }, [haptic, hapticError, fetchWithAuth, agentId, plan, tonConnectUI, amountNano, verifyPayment]);

  // Wallet ulanganda avtomatik confirm sahifaga o'tish
  useEffect(() => {
    if (wallet && step === "connecting") {
      setStep("confirm");
    }
  }, [wallet, step]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  // MainButton integration
  useEffect(() => {
    if (step === "select_plan") {
      showMainButton("To'lash", startPayment);
    } else if (step === "confirm") {
      showMainButton("To'lovni tasdiqlash", sendTransaction);
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [step, haptic, startPayment, sendTransaction, showMainButton, hideMainButton]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => step !== "waiting" && onClose()}
      />

      {/* Bottom Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="relative w-full max-w-lg bg-card rounded-t-3xl border border-border/50 pb-safe-tg overflow-hidden"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pb-6 pt-2">
          <AnimatePresence mode="wait">

            {/* Plan tanlash */}
            {step === "select_plan" && (
              <motion.div key="plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                    {agentIcon}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{agentName}</h2>
                    <p className="text-sm text-muted-foreground">Tarif tanlang</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {PLAN_OPTIONS.map((p) => {
                    const planPrice = p.id === "weekly"
                      ? Math.round(priceMonthly * 7 / 30)
                      : priceMonthly;
                    return (
                      <motion.button
                        key={p.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { setPlan(p.id as any); haptic("light"); }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${plan === p.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                      >
                        <div className="text-left">
                          <p className="font-semibold">{p.label}</p>
                          <p className="text-xs text-muted-foreground">{p.duration} kun</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{planPrice.toLocaleString()} so'm</p>
                          <p className="text-xs text-muted-foreground">≈ {somToTON(planPrice)} TON</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                <button
                  onClick={startPayment}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-chart-2 text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Wallet size={18} /> TON orqali to'lash
                </button>
              </motion.div>
            )}

            {/* Hamyon ulanmoqda */}
            {step === "connecting" && (
              <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 size={32} className="text-primary animate-spin" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Hamyon ulanmoqda...</h3>
                  <p className="text-sm text-muted-foreground mt-1">Tonkeeper, MyTonWallet yoki boshqa TON hamyonni tanlang</p>
                </div>
              </motion.div>
            )}

            {/* Tasdiqlash */}
            {step === "confirm" && (
              <motion.div key="confirm" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <p className="text-xs text-emerald-600 font-medium">Hamyon ulangan</p>
                  <p className="text-xs text-muted-foreground ml-auto font-mono">
                    {wallet?.account.address.slice(0, 6)}...{wallet?.account.address.slice(-4)}
                  </p>
                </div>

                <Card className="border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Agent</span>
                      <span className="font-semibold text-sm">{agentName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Tarif</span>
                      <span className="font-semibold text-sm">{plan === "monthly" ? "1 oy" : "1 hafta"}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold">Jami</span>
                      <span className="font-bold text-primary">
                        {somToTON(priceSOm)} TON
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {error && <p className="text-xs text-red-500 text-center">{error}</p>}

                <button
                  onClick={sendTransaction}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-chart-2 text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Zap size={16} /> To'lovni tasdiqlash
                </button>
                <button onClick={() => setStep("select_plan")} className="w-full py-2 text-sm text-muted-foreground">← Orqaga</button>
              </motion.div>
            )}

            {/* Kutish */}
            {step === "waiting" && (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10 flex flex-col items-center gap-5 text-center">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <div className="absolute inset-3 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock size={24} className="text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-base">Blockchain tekshirilyapti...</h3>
                  <p className="text-sm text-muted-foreground mt-1">Tranzaksiya tasdiqlangandan keyin agent avtomatik faollashadi</p>
                  {txHash && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      TX: {txHash.slice(0, 12)}...
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Muvaffaqiyat */}
            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-8 flex flex-col items-center gap-4 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 300, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center"
                >
                  <CheckCircle size={40} className="text-emerald-500" />
                </motion.div>
                <div>
                  <h3 className="font-bold text-xl">Faollashdi! 🎉</h3>
                  <p className="text-sm text-muted-foreground mt-1">{agentName} endi ishlatishga tayyor!</p>
                </div>
              </motion.div>
            )}

            {/* Xato */}
            {step === "failed" && (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8 flex flex-col items-center gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                  <XCircle size={40} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-base">To'lov amalga oshmadi</h3>
                  {error && <p className="text-sm text-muted-foreground mt-1">{error}</p>}
                </div>
                <button
                  onClick={() => setStep("select_plan")}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
                >
                  Qayta urinish
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
