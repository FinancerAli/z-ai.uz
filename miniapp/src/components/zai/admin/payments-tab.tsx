"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, CreditCard, Clock, RefreshCw, MessageSquare, Phone, User } from "lucide-react";
import { toast } from "sonner";

interface PaymentsTabProps {
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
}

interface ManualPayment {
  id: string;
  user_id: string;
  user_telegram_id: number | null;
  user_first_name: string | null;
  user_username: string | null;
  user_agent_id: string | null;
  agent_id: string | null;
  agent_slug: string | null;
  agent_name: string | null;
  plan: string;
  payment_method: string;
  status: string;
  expected_amount: number | null;
  submitted_amount: number | null;
  amount: number;
  payer_name: string | null;
  payer_phone: string | null;
  comment: string | null;
  receipt_text: string | null;
  screenshot_url: string | null;
  admin_note: string | null;
  created_at: string | null;
  confirmed_at: string | null;
}

type StatusFilter = "pending" | "approved" | "rejected" | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "pending", label: "Kutilmoqda" },
  { value: "approved", label: "Tasdiqlangan" },
  { value: "rejected", label: "Rad etilgan" },
  { value: "all", label: "Barchasi" },
];

export function PaymentsTab({ fetchWithAuth, haptic }: PaymentsTabProps) {
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "50");
      const data = await fetchWithAuth(`/api/payments/admin/manual?${params.toString()}`);
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, statusFilter]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const approve = async (id: string) => {
    setActionLoading(id);
    try {
      await fetchWithAuth(`/api/payments/admin/manual/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      haptic("medium");
      toast.success("To'lov tasdiqlandi va agent faollashtirildi");
      loadPayments();
    } catch (err: any) {
      toast.error(err?.message || "Tasdiqlashda xatolik");
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Rad etish sababi (ixtiyoriy):") || "";
    setActionLoading(id);
    try {
      await fetchWithAuth(`/api/payments/admin/manual/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      haptic("medium");
      toast.success("To'lov rad etildi");
      loadPayments();
    } catch (err: any) {
      toast.error(err?.message || "Rad etishda xatolik");
    } finally {
      setActionLoading(null);
    }
  };

  const cancelAllPending = async (userId: string, userName: string) => {
    const reason = window.prompt(`${userName} uchun barcha pending to'lovlarni bekor qilish. Sabab:`) || "";
    if (!reason && !window.confirm("Sabab kiritilmadi. Davom etasizmi?")) return;
    setActionLoading("cancel-all-" + userId);
    try {
      await fetchWithAuth(`/api/payments/admin/manual/cancel-all-pending`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, reason }),
      });
      haptic("medium");
      toast.success("Barcha pending to'lovlar bekor qilindi");
      loadPayments();
    } catch (err: any) {
      toast.error(err?.message || "Bekor qilishda xatolik");
    } finally {
      setActionLoading(null);
    }
  };

  const approveToAgent = async (paymentId: string) => {
    const agentId = window.prompt("Boshqa agent ID'sini kiriting:");
    if (!agentId?.trim()) return;
    setActionLoading(paymentId);
    try {
      await fetchWithAuth(`/api/payments/admin/manual/${paymentId}/approve-to-agent`, {
        method: "POST",
        body: JSON.stringify({ target_agent_id: agentId.trim() }),
      });
      haptic("medium");
      toast.success("To'lov boshqa agentga tasdiqlandi");
      loadPayments();
    } catch (err: any) {
      toast.error(err?.message || "Tasdiqlashda xatolik");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">Kutmoqda</Badge>;
    if (status === "approved") return <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Tasdiqlangan</Badge>;
    if (status === "rejected") return <Badge className="text-[9px] px-1.5 py-0 bg-rose-500/10 text-rose-600 border-rose-500/20">Rad etilgan</Badge>;
    return <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{status}</Badge>;
  };

  const methodLabel = (m: string) => {
    if (m === "click_p2p") return "Click P2P";
    if (m === "tonconnect") return "TON";
    return m;
  };

  return (
    <div className="space-y-3">
      {/* Filters + refresh */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); haptic("light"); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                statusFilter === f.value
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Yangilash"
          className="w-8 h-8"
          onClick={() => { haptic("light"); loadPayments(); }}
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground font-medium">
        {payments.length} ta to'lov
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10">
          <CreditCard size={24} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">To'lovlar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <Card key={p.id} className="border-border/60">
              <CardContent className="p-3 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] font-bold">{p.user_first_name || "—"}</p>
                      {p.user_username && (
                        <span className="text-[10px] text-muted-foreground">@{p.user_username}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ID: {p.user_telegram_id ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {statusBadge(p.status)}
                    <Badge variant="outline" className="text-[8px] px-1 py-0">
                      {methodLabel(p.payment_method)}
                    </Badge>
                  </div>
                </div>

                {/* Agent + plan + amount */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold">{p.agent_name || "—"}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="capitalize">{p.plan}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-bold text-emerald-600">
                    {(p.expected_amount || p.amount || 0).toLocaleString()} so'm
                  </span>
                  {p.submitted_amount != null && p.submitted_amount !== p.expected_amount && (
                    <span className="text-[10px] text-amber-600">
                      (yuborilgan: {p.submitted_amount.toLocaleString()})
                    </span>
                  )}
                </div>

                {/* Optional metadata */}
                {(p.payer_name || p.payer_phone || p.comment || p.screenshot_url) && (
                  <div className="flex flex-col gap-0.5 pt-1.5 border-t border-border/30 text-[10px] text-muted-foreground">
                    {p.payer_name && (
                      <span className="flex items-center gap-1"><User size={10} />{p.payer_name}</span>
                    )}
                    {p.payer_phone && (
                      <span className="flex items-center gap-1"><Phone size={10} />{p.payer_phone}</span>
                    )}
                    {p.comment && (
                      <span className="flex items-start gap-1">
                        <MessageSquare size={10} className="mt-0.5 shrink-0" />
                        <span className="break-words">{p.comment}</span>
                      </span>
                    )}
                    {p.screenshot_url && (
                      <a
                        href={p.screenshot_url.startsWith("http") ? p.screenshot_url : `https://apizai.ustaitech.uz${p.screenshot_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        📷 Chek rasmini ko'rish
                      </a>
                    )}
                  </div>
                )}

                {/* Footer: created + actions */}
                <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock size={10} />{formatDate(p.created_at)}
                  </span>
                  {p.status === "pending" ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] text-rose-600 hover:bg-rose-500/10"
                        onClick={() => reject(p.id)}
                        loading={actionLoading === p.id}
                        icon={<XCircle size={12} />}
                      >
                        Rad etish
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => approve(p.id)}
                        loading={actionLoading === p.id}
                        icon={<CheckCircle size={12} />}
                      >
                        Tasdiqlash
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] text-blue-600 hover:bg-blue-500/10"
                        onClick={() => approveToAgent(p.id)}
                        loading={actionLoading === p.id}
                      >
                        Boshqa agentga
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] text-amber-600 hover:bg-amber-500/10"
                        onClick={() => cancelAllPending(p.user_id, p.user_first_name || "User")}
                        loading={actionLoading === "cancel-all-" + p.user_id}
                      >
                        Hammasini bekor
                      </Button>
                    </div>
                  ) : (
                    p.admin_note && (
                      <span className="text-[10px] text-muted-foreground italic">
                        {p.admin_note.slice(0, 60)}
                      </span>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
