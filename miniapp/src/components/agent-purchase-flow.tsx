"use client";

import { useState, useCallback, useEffect } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Zap, CheckCircle, XCircle, Loader2, Clock, CreditCard, ExternalLink, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTelegram } from "@/hooks/use-telegram";
import { useApi, AuthExpiredError } from "@/hooks/use-api";
import { useAnalytics } from "@/hooks/use-analytics";

// TON & USDT receiver address (ZAI company wallet) — EQ format
const ZAI_TON_ADDRESS = "EQBvI0aFLnw2QbZgjMPCLRdtRHxhUyinQudg6sdiohIwg5jL";

interface AgentPurchaseFlowProps {
  agentId: string;
  agentSlug?: string;
  agentName: string;
  agentIcon: string;
  priceMonthly: number; // so'm
  onSuccess: () => void;
  onClose: () => void;
}

type PaymentMethod = "ton" | "click";
type FlowStep =
  | "select_plan"
  | "select_method"
  // TON yo'li
  | "connecting"
  | "confirm"
  | "waiting"
  // Click yo'li
  | "click_pay"          // foydalanuvchi tashqi linkka o'tadi va to'laydi
  | "click_form"         // to'lov ma'lumotlarini yuboradi (ism, telefon, izoh)
  | "click_pending"      // admin tasdig'ini kutmoqda
  // Yakuniy
  | "success"
  | "failed";

const PLAN_OPTIONS = [
  { id: "monthly", label: "1 oy", duration: 30 },
  { id: "weekly", label: "1 hafta", duration: 7 },
];

// Hozirgi kurslar (2026-05-12)
const UZS_PER_USD = 12200;
const TON_PER_USD = 2.35; // 1 TON ≈ $2.35

function somToTON(som: number): string {
  const usd = som / UZS_PER_USD;
  return (usd / TON_PER_USD).toFixed(3);
}

function somToUSD(som: number): string {
  return (som / UZS_PER_USD).toFixed(2);
}

export function AgentPurchaseFlow({
  agentId, agentSlug, agentName, agentIcon, priceMonthly, onSuccess, onClose,
}: AgentPurchaseFlowProps) {
  const [step, setStep] = useState<FlowStep>("select_plan");
  const [plan, setPlan] = useState<"monthly" | "weekly">("monthly");
  const [method, setMethod] = useState<PaymentMethod>("ton");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Click P2P state
  const [clickEnabled, setClickEnabled] = useState<boolean>(true);
  const [clickQuote, setClickQuote] = useState<{
    click_url: string;
    receiver_name: string;
    price_uzs: number;
    instruction_text: string;
    manual_payment_reference: string;
  } | null>(null);
  const [clickUserAgentId, setClickUserAgentId] = useState<string | null>(null);
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [paymentComment, setPaymentComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const { webapp, haptic, hapticSuccess, hapticError, hideMainButton, hideSecondaryButton } = useTelegram();
  const { fetchWithAuth, token } = useApi();
  const { track } = useAnalytics({ token });

  const priceSOm = plan === "weekly" ? Math.round(priceMonthly * 7 / 30) : priceMonthly;
  const priceTON = parseFloat(somToTON(priceSOm));

  // ⚠️ Diqqat: amountNano va ZAI_TON_ADDRESS endi ishlatilmaydi.
  // Backend `/api/payments/ton/quote` endpointi har gal aniq amount va wallet_address
  // qaytaradi. Bu local konstantalar legacy compat va UX preview uchun saqlanadi
  // (confirm sahifada taxminiy narxni ko'rsatish).

  // MainButton/SecondaryButton yashirish — UI ichida o'z tugmalari bor
  useEffect(() => {
    hideMainButton();
    hideSecondaryButton();
    return () => {
      hideMainButton();
      hideSecondaryButton();
    };
  }, [hideMainButton, hideSecondaryButton]);

  // Backend'ga to'lovni tasdiqlash
  // ⚠️ Frontend amount/currency YUBORMAYDI — backend o'zi DB narxidan hisoblaydi.
  const verifyPayment = useCallback(async (hash: string, userAgentId: string) => {
    try {
      const res = await fetchWithAuth(`/api/payments/ton/verify`, {
        method: "POST",
        body: JSON.stringify({
          tx_hash: hash,
          user_agent_id: userAgentId,
          plan_type: plan,
        }),
      });
      if (res.activated) {
        hapticSuccess();
        setStep("success");
        track("purchase_completed", {
          agent_slug: agentSlug,
          plan_type: plan,
          currency: "TON",
        });
        if (pollInterval) clearInterval(pollInterval);
        setTimeout(onSuccess, 2000);
      }
    } catch {
      // Hali tasdiqlanmagan — polling davom etadi
    }
  }, [fetchWithAuth, plan, hapticSuccess, pollInterval, onSuccess, track, agentSlug]);

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

  // Click P2P yoqilganligini bilish
  useEffect(() => {
    if (!token) return;
    fetchWithAuth("/api/payments/click/config")
      .then((cfg: any) => setClickEnabled(!!cfg?.enabled))
      .catch(() => setClickEnabled(false));
  }, [token, fetchWithAuth]);

  // Click P2P: quote olish va purchase request yaratish.
  //
  // Muhim: agar oldindan pending UserAgent mavjud bo'lsa (oldingi xarid urinishi
  // tugamagan), backend 400 "Bu agent uchun so'rov admin tasdig'ini kutmoqda"
  // qaytaradi. Bu holda `click_pending` ga to'g'ridan-to'g'ri o'tish XATO edi —
  // chunki PaymentManual yozuvi yaratilmagan, admin panel uni ko'rmaydi.
  // To'g'ri yo'l: mavjud UserAgent'ni topib, quote olamiz va `click_pay` ga
  // o'tamiz. Foydalanuvchi keyin "To'lov qildim" formani to'ldirib yuboradi —
  // shundagina PaymentManual yaratiladi.
  const startClickFlow = useCallback(async () => {
    haptic("medium");
    setError(null);
    setSubmitting(true);
    try {
      let userAgentId: string | null = null;

      // 1. UserAgent yaratishga urinamiz. Agar duplicate pending bo'lsa — mavjudini topamiz.
      try {
        const purchaseRes = await fetchWithAuth(`/api/agents/${agentId}/purchase`, {
          method: "POST",
          body: JSON.stringify({ plan_type: plan }),
        });
        userAgentId = purchaseRes.user_agent_id;
      } catch (purchaseErr: any) {
        if (purchaseErr instanceof AuthExpiredError) {
          throw purchaseErr;
        }
        const msg = String(purchaseErr?.message || "");
        if (msg.toLowerCase().includes("kutmoqda") || msg.toLowerCase().includes("allaqachon faol")) {
          // Mavjud (pending yoki active) UserAgent'ni my/list orqali topamiz
          const myList: any[] = await fetchWithAuth(`/api/agents/my/list`).catch(() => []);
          const existing = myList.find(
            (ua) => ua.agent_id === agentId && (ua.status === "pending" || ua.status === "active"),
          );
          if (!existing) {
            throw new Error(msg || "Mavjud sotib olish so'rovi topilmadi");
          }
          if (existing.status === "active") {
            // Allaqachon faol — xarid sahifasini umuman ko'rsatish kerak emas, success bering
            setStep("success");
            return;
          }
          userAgentId = existing.id;
        } else {
          throw purchaseErr;
        }
      }

      if (!userAgentId) {
        throw new Error("Sotib olish so'rovi yaratilmadi");
      }
      setClickUserAgentId(userAgentId);

      // 2. Quote — server-side narx, click URL
      const quote = await fetchWithAuth(`/api/payments/click/quote`, {
        method: "POST",
        body: JSON.stringify({ user_agent_id: userAgentId, plan_type: plan }),
      });
      setClickQuote({
        click_url: quote.click_url,
        receiver_name: quote.receiver_name,
        price_uzs: quote.price_uzs,
        instruction_text: quote.instruction_text,
        manual_payment_reference: quote.manual_payment_reference,
      });
      track("purchase_initiated", {
        agent_slug: agentSlug,
        plan_type: plan,
        method: "click_p2p",
      });
      setStep("click_pay");
    } catch (e: any) {
      if (e instanceof AuthExpiredError) {
        setError("Sessiya muddati tugagan. Iltimos mini ilovani qayta oching.");
        setStep("failed");
      } else {
        setError(e?.message || "Click to'lovini boshlashda xatolik");
        setStep("failed");
      }
    } finally {
      setSubmitting(false);
    }
  }, [agentId, plan, fetchWithAuth, haptic, track, agentSlug]);

  const submitClickManual = useCallback(async () => {
    if (!clickUserAgentId) {
      setError("Sotib olish so'rovi topilmadi");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await fetchWithAuth(`/api/payments/click/manual-submit`, {
        method: "POST",
        body: JSON.stringify({
          user_agent_id: clickUserAgentId,
          plan_type: plan,
          payer_name: payerName.trim() || null,
          payer_phone: payerPhone.trim() || null,
          comment: paymentComment.trim() || null,
          screenshot_url: receiptUrl || null,
        }),
      });
      hapticSuccess();
      track("purchase_initiated", {
        agent_slug: agentSlug,
        plan_type: plan,
        method: "click_p2p_submitted",
      });
      setStep("click_pending");
    } catch (e: any) {
      if (e instanceof AuthExpiredError) {
        setError("Sessiya muddati tugagan. Iltimos mini ilovani qayta oching.");
      } else {
        setError(e?.message || "Yuborishda xatolik");
      }
    } finally {
      setSubmitting(false);
    }
  }, [clickUserAgentId, plan, payerName, payerPhone, paymentComment, receiptUrl, fetchWithAuth, hapticSuccess, track, agentSlug]);

  // Chek rasmi yuklash
  const uploadReceipt = useCallback(async (file: File) => {
    setUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // fetchWithAuth JSON header qo'shadi — bu yerda raw fetch kerak
      const token_val = token;
      if (!token_val) throw new Error("Token yo'q");
      const res = await fetch(`${(await import("@/hooks/use-api")).API_BASE}/api/payments/receipt/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token_val}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || "Yuklashda xatolik");
      }
      const data = await res.json();
      setReceiptUrl(data.url);
      haptic("light");
    } catch (e: any) {
      setError(e?.message || "Chek yuklashda xatolik");
    } finally {
      setUploadingReceipt(false);
    }
  }, [token, haptic]);

  // TON tranzaksiya yuborish
  // ⚠️ Amount/wallet/comment — barchasi BACKEND quote'dan olinadi.
  // Frontend hech qanday narxni "haqiqat manbasi" sifatida ishlatmaydi.
  const sendTransaction = useCallback(async () => {
    haptic("heavy");
    setStep("waiting");

    try {
      // 1. Backend'da pending UserAgent yaratamiz
      const purchaseRes = await fetchWithAuth(`/api/agents/${agentId}/purchase`, {
        method: "POST",
        body: JSON.stringify({ plan_type: plan }),
      });
      const userAgentId: string = purchaseRes.user_agent_id;

      // 2. Server-side TON quote — backend o'zi narx hisoblaydi.
      const quote = await fetchWithAuth(`/api/payments/ton/quote`, {
        method: "POST",
        body: JSON.stringify({ user_agent_id: userAgentId, plan_type: plan }),
      });
      // quote: { wallet_address, amount_ton, amount_nano, comment, network, ... }

      // 3. TON Connect orqali tranzaksiya yuborish (quote qiymatlari bilan)
      const { beginCell } = await import("@ton/core");
      const bodyCell = beginCell()
        .storeUint(0, 32)
        .storeStringTail(quote.comment)  // backend tomondan: zai_pay:{ua_id}:{plan}
        .endCell();
      const payloadBoc = bodyCell.toBoc().toString("base64");

      const tx = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600, // 10 daqiqa
        messages: [
          {
            address: quote.wallet_address,             // backend'dan
            amount: String(quote.amount_nano),         // backend'dan
            payload: payloadBoc,
          },
        ],
      });

      const hash = tx.boc;
      setTxHash(hash);

      // 4. Polling: 3 soniyada bir backend'ga tekshiramiz (max 3 daqiqa)
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
      if (err instanceof AuthExpiredError) {
        setStep("failed");
        setError("Sessiya muddati tugagan. Iltimos mini ilovani qayta oching.");
      } else if (err?.message?.includes("USER_REJECTS")) {
        setStep("confirm");
        setError("To'lov bekor qilindi.");
      } else {
        setStep("failed");
        setError(err?.message || "To'lov xatosi");
      }
    }
  }, [haptic, hapticError, fetchWithAuth, agentId, plan, tonConnectUI, verifyPayment]);

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
                      <button
                        key={p.id}
                        onClick={() => { setPlan(p.id as any); haptic("light"); }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-[0.98] ${plan === p.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                      >
                        <div className="text-left">
                          <p className="font-semibold">{p.label}</p>
                          <p className="text-xs text-muted-foreground">{p.duration} kun</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{planPrice.toLocaleString()} so'm</p>
                          <p className="text-xs text-muted-foreground">≈ {somToTON(planPrice)} TON (${somToUSD(planPrice)})</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => { haptic("light"); setStep("select_method"); }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-chart-2 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  Davom etish →
                </button>
              </motion.div>
            )}

            {/* To'lov usulini tanlash */}
            {step === "select_method" && (
              <motion.div key="method" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">To'lov usuli</h2>
                  <p className="text-sm text-muted-foreground">{plan === "monthly" ? "1 oy" : "1 hafta"} · {priceSOm.toLocaleString()} so'm</p>
                </div>

                <div className="space-y-2">
                  {/* TON */}
                  <button
                    onClick={() => { setMethod("ton"); haptic("light"); startPayment(); }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-border bg-card transition-all active:scale-[0.98] hover:border-primary/40"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Wallet size={20} />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-sm">TON / Crypto</p>
                      <p className="text-xs text-muted-foreground">Avtomatik tasdiqlanadi</p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{somToTON(priceSOm)} TON</span>
                  </button>

                  {/* Click P2P */}
                  {clickEnabled && (
                    <button
                      onClick={() => { setMethod("click"); haptic("light"); startClickFlow(); }}
                      disabled={submitting}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-border bg-card transition-all active:scale-[0.98] hover:border-primary/40 disabled:opacity-60"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <CreditCard size={20} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm">Click orqali to'lash</p>
                        <p className="text-xs text-muted-foreground">Admin tasdig'idan keyin faollashadi</p>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{priceSOm.toLocaleString()} so'm</span>
                    </button>
                  )}
                </div>

                <button onClick={() => setStep("select_plan")} className="w-full py-2 text-sm text-muted-foreground">← Orqaga</button>
              </motion.div>
            )}

            {/* CLICK: to'lash sahifasi */}
            {step === "click_pay" && clickQuote && (
              <motion.div key="click_pay" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Click P2P to'lov</h2>
                    <p className="text-xs text-muted-foreground">Qabul qiluvchi: {clickQuote.receiver_name}</p>
                  </div>
                </div>

                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Agent</span>
                      <span className="text-sm font-semibold">{agentName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Tarif</span>
                      <span className="text-sm font-semibold">{plan === "monthly" ? "1 oy" : "1 hafta"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">To'lov kodi</span>
                      <span className="text-xs font-mono">{clickQuote.manual_payment_reference}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold">Jami</span>
                      <span className="text-xl font-bold text-emerald-600">{Math.round(clickQuote.price_uzs).toLocaleString()} so'm</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                  {clickQuote.instruction_text}
                </div>

                <a
                  href={clickQuote.click_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    haptic("medium");
                    // Telegram WebApp'da `<a target=_blank>` ba'zi mijozlarda
                    // ishlamasligi mumkin. openLink mavjud bo'lsa — uni ishlatamiz.
                    if (webapp?.openLink) {
                      e.preventDefault();
                      webapp.openLink(clickQuote.click_url);
                    }
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <ExternalLink size={16} /> Click P2P sahifasiga o'tish
                </a>

                <button
                  onClick={() => { haptic("medium"); setStep("click_form"); }}
                  className="w-full py-3 rounded-2xl border border-emerald-500/40 bg-background text-emerald-700 font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  ✓ To'lov qildim, formani to'ldirish
                </button>

                <button onClick={() => setStep("select_method")} className="w-full py-2 text-sm text-muted-foreground">← Boshqa usul tanlash</button>
              </motion.div>
            )}

            {/* CLICK: forma to'ldirish va yuborish */}
            {step === "click_form" && (
              <motion.div key="click_form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <div>
                  <h2 className="text-lg font-bold">Tekshiruvga yuborish</h2>
                  <p className="text-xs text-muted-foreground">Admin to'lovingizni tekshirib agentni faollashtiradi</p>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Ism familiya (ixtiyoriy)"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                    aria-label="Ism familiya"
                  />
                  <input
                    type="tel"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="Telefon raqam (ixtiyoriy)"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                    aria-label="Telefon"
                  />
                  <textarea
                    value={paymentComment}
                    onChange={(e) => setPaymentComment(e.target.value)}
                    placeholder="To'lov izohi yoki chek raqami (ixtiyoriy)"
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm resize-none"
                    aria-label="Izoh"
                  />

                  {/* Chek rasmi yuklash */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      📷 To'lov cheki (ixtiyoriy)
                    </label>
                    {receiptUrl ? (
                      <div className="flex items-center gap-2 p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                        <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-xs text-emerald-700 truncate flex-1">Chek yuklandi</span>
                        <button
                          type="button"
                          onClick={() => setReceiptUrl(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          O'chirish
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:border-primary/40 transition-colors">
                        {uploadingReceipt ? (
                          <Loader2 size={16} className="animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <CreditCard size={14} className="text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Chek rasmini yuklash</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingReceipt}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadReceipt(f);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  onClick={submitClickManual}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  To'lov qildim, tekshiruvga yuborish
                </button>

                <button onClick={() => setStep("click_pay")} className="w-full py-2 text-sm text-muted-foreground">← Orqaga</button>
              </motion.div>
            )}

            {/* CLICK: kutish */}
            {step === "click_pending" && (
              <motion.div key="click_pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-8 flex flex-col items-center gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock size={40} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Tekshiruvga yuborildi</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    To'lovingiz adminga yuborildi. Tasdiqlangandan keyin agent faollashadi.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
                >
                  Yopish
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
                    {wallet?.account?.address?.slice(0, 6)}...{wallet?.account?.address?.slice(-4)}
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
                      <div className="text-right">
                        <span className="font-bold text-primary">~{somToTON(priceSOm)} TON</span>
                        <p className="text-xs text-muted-foreground">{priceSOm.toLocaleString()} so'm ≈ ${somToUSD(priceSOm)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                  💡 Aniq TON miqdori backend tomonidan hisoblanadi va to'lovda ko'rsatiladi.
                </p>

                {error && <p className="text-xs text-red-500 text-center">{error}</p>}

                <button
                  onClick={sendTransaction}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-chart-2 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
