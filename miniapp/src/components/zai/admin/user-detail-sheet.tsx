"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Ban, CheckCircle, Clock, Gift, RotateCcw, Minus, Timer,
  Bot, CreditCard, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { GrantAgentDialog } from "./grant-agent-dialog";

interface UserDetailSheetProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
  onUserUpdated: () => void;
}

interface UserDetail {
  user: {
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    is_admin: boolean;
    is_premium: boolean;
    status: string;
    balance: number;
    language_code: string | null;
    blocked_reason: string | null;
    blocked_at: string | null;
    created_at: string | null;
    last_seen_at: string | null;
  };
  subscription: {
    id: string;
    plan: string;
    status: string;
    monthly_limit: number;
    used_count: number;
    started_at: string | null;
    expires_at: string | null;
  } | null;
  agents: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    plan_type: string;
    expires_at: string | null;
    tasks_used_today: number;
  }>;
  task_stats: {
    total: number;
    today: number;
    failed: number;
  };
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    payment_method: string;
    status: string;
    plan_type: string;
    created_at: string | null;
  }>;
}

export function UserDetailSheet({
  userId, open, onClose, fetchWithAuth, haptic, onUserUpdated,
}: UserDetailSheetProps) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("3");
  const [limitValue, setLimitValue] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [showGrantDialog, setShowGrantDialog] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    fetchWithAuth(`/api/admin/users/${userId}`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, userId, fetchWithAuth]);

  const doAction = async (
    endpoint: string,
    method: string = "POST",
    body?: any,
    successMsg?: string
  ) => {
    setActionLoading(endpoint);
    try {
      await fetchWithAuth(endpoint, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      haptic("medium");
      toast.success(successMsg || "Muvaffaqiyatli!");
      // Reload detail
      const updated = await fetchWithAuth(`/api/admin/users/${userId}`);
      setDetail(updated);
      onUserUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Xatolik yuz berdi");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlock = () => {
    if (!blockReason || blockReason.length < 3) {
      toast.error("Sabab kamida 3 belgi bo'lishi kerak");
      return;
    }
    doAction(
      `/api/admin/users/${userId}/block`,
      "POST",
      { reason: blockReason },
      "Foydalanuvchi bloklandi"
    );
    setBlockReason("");
  };

  const handleUnblock = () => {
    doAction(`/api/admin/users/${userId}/unblock`, "POST", undefined, "Blokdan chiqarildi");
  };

  const handleExtendTrial = () => {
    const days = parseInt(extendDays);
    if (!days || days < 1 || days > 30) {
      toast.error("1-30 kun orasida bo'lishi kerak");
      return;
    }
    doAction(
      `/api/admin/users/${userId}/extend-trial`,
      "POST",
      { days },
      `Trial ${days} kunga uzaytirildi`
    );
  };

  const handleResetTrial = () => {
    doAction(`/api/admin/users/${userId}/reset-trial`, "POST", undefined, "Trial qayta boshlandi");
  };

  const handleSetLimit = () => {
    const limit = parseInt(limitValue);
    if (!limit || limit < 1 || limit > 10000) {
      toast.error("1-10000 orasida bo'lishi kerak");
      return;
    }
    doAction(
      `/api/admin/users/${userId}/set-daily-limit`,
      "POST",
      { limit },
      `Limit ${limit} ga o'zgartirildi`
    );
    setLimitValue("");
  };

  const handleExpireTrial = () => {
    doAction(`/api/admin/users/${userId}/expire-trial`, "POST", undefined, "Trial tugatildi");
  };

  const handleRevokeAgent = (userAgentId: string) => {
    doAction(
      `/api/admin/user-agents/${userAgentId}/revoke`,
      "POST",
      { reason: "Admin tomonidan bekor qilindi" },
      "Agent bekor qilindi"
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle>
              {detail?.user.first_name || "Foydalanuvchi"} {detail?.user.last_name || ""}
            </SheetTitle>
            <SheetDescription>
              {detail?.user.username ? `@${detail.user.username}` : `ID: ${detail?.user.telegram_id}`}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 h-[calc(85vh-80px)]">
            <div className="px-4 pb-6 space-y-4">
              {loading ? (
                <div className="space-y-3 pt-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : detail ? (
                <>
                  {/* Status & Info */}
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <Badge variant={detail.user.status === "blocked" ? "destructive" : "secondary"}>
                      {detail.user.status === "blocked" ? "Bloklangan" : "Faol"}
                    </Badge>
                    {detail.user.is_premium && (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Premium</Badge>
                    )}
                    {detail.user.is_admin && (
                      <Badge variant="outline" className="border-primary/30 text-primary">Admin</Badge>
                    )}
                  </div>

                  {/* Blocked reason */}
                  {detail.user.status === "blocked" && detail.user.blocked_reason && (
                    <Card className="border-rose-500/20 bg-rose-500/5">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-medium text-rose-500">Bloklash sababi</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{detail.user.blocked_reason}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Subscription */}
                  {detail.subscription && (
                    <Card className="border-border/60">
                      <CardContent className="p-3">
                        <p className="text-[11px] font-semibold mb-2">Obuna</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">Reja:</span>{" "}
                            <span className="font-medium">{detail.subscription.plan}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>{" "}
                            <span className="font-medium">{detail.subscription.status}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Limit:</span>{" "}
                            <span className="font-medium">{detail.subscription.monthly_limit}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Ishlatilgan:</span>{" "}
                            <span className="font-medium">{detail.subscription.used_count}</span>
                          </div>
                          {detail.subscription.expires_at && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Tugash:</span>{" "}
                              <span className="font-medium">
                                {new Date(detail.subscription.expires_at).toLocaleDateString("uz-UZ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Task Stats */}
                  <Card className="border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[11px] font-semibold mb-2">Tasklar</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-base font-bold">{detail.task_stats.total}</p>
                          <p className="text-[9px] text-muted-foreground">Jami</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-primary">{detail.task_stats.today}</p>
                          <p className="text-[9px] text-muted-foreground">Bugun</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-rose-500">{detail.task_stats.failed}</p>
                          <p className="text-[9px] text-muted-foreground">Xato</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Agents */}
                  {detail.agents.length > 0 && (
                    <Card className="border-border/60">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-semibold">Agentlar</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-primary"
                            onClick={() => setShowGrantDialog(true)}
                          >
                            <Gift size={12} className="mr-1" />
                            Berish
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {detail.agents.map((a) => (
                            <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                              <div>
                                <p className="text-[11px] font-medium">{a.name}</p>
                                <p className="text-[9px] text-muted-foreground">
                                  {a.plan_type} • {a.tasks_used_today} task bugun
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant={a.status === "active" ? "secondary" : "outline"}
                                  className={`text-[8px] px-1 py-0 ${
                                    a.status === "active" ? "bg-emerald-500/10 text-emerald-500" : ""
                                  }`}
                                >
                                  {a.status}
                                </Badge>
                                {a.status === "active" && (
                                  <button
                                    onClick={() => handleRevokeAgent(a.id)}
                                    className="text-[9px] text-rose-500 hover:underline"
                                  >
                                    Bekor
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Payments */}
                  {detail.payments.length > 0 && (
                    <Card className="border-border/60">
                      <CardContent className="p-3">
                        <p className="text-[11px] font-semibold mb-2">To'lovlar</p>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {detail.payments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
                              <div>
                                <p className="text-[10px] font-medium">
                                  {p.amount.toLocaleString()} {p.currency}
                                </p>
                                <p className="text-[9px] text-muted-foreground">
                                  {p.payment_method} • {p.plan_type}
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge
                                  variant="outline"
                                  className={`text-[8px] px-1 py-0 ${
                                    p.status === "completed"
                                      ? "text-emerald-500 border-emerald-500/20"
                                      : "text-amber-500 border-amber-500/20"
                                  }`}
                                >
                                  {p.status}
                                </Badge>
                                {p.created_at && (
                                  <p className="text-[8px] text-muted-foreground mt-0.5">
                                    {new Date(p.created_at).toLocaleDateString("uz-UZ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold">Amallar</p>

                    {/* Block / Unblock */}
                    {detail.user.status === "blocked" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-9 text-xs"
                        loading={actionLoading === `/api/admin/users/${userId}/unblock`}
                        onClick={handleUnblock}
                        icon={<CheckCircle size={14} />}
                      >
                        Blokdan chiqarish
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          placeholder="Bloklash sababi..."
                          value={blockReason}
                          onChange={(e) => setBlockReason(e.target.value)}
                          className="h-8 text-xs rounded-lg"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="w-full h-9 text-xs"
                          loading={actionLoading === `/api/admin/users/${userId}/block`}
                          onClick={handleBlock}
                          disabled={blockReason.length < 3}
                          icon={<Ban size={14} />}
                        >
                          Bloklash
                        </Button>
                      </div>
                    )}

                    <Separator />

                    {/* Trial Management */}
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      Trial boshqaruvi
                    </p>

                    {/* Extend Trial */}
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Kun"
                        value={extendDays}
                        onChange={(e) => setExtendDays(e.target.value)}
                        className="h-8 text-xs rounded-lg w-20"
                        min={1}
                        max={30}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        loading={actionLoading?.includes("extend-trial")}
                        onClick={handleExtendTrial}
                        icon={<Clock size={12} />}
                      >
                        Uzaytirish
                      </Button>
                    </div>

                    {/* Reset Trial */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      loading={actionLoading?.includes("reset-trial")}
                      onClick={handleResetTrial}
                      icon={<RotateCcw size={12} />}
                    >
                      Trial qayta boshlash (3 kun)
                    </Button>

                    {/* Set Limit */}
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Yangi limit"
                        value={limitValue}
                        onChange={(e) => setLimitValue(e.target.value)}
                        className="h-8 text-xs rounded-lg w-24"
                        min={1}
                        max={10000}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        loading={actionLoading?.includes("set-daily-limit")}
                        onClick={handleSetLimit}
                        icon={<Minus size={12} />}
                      >
                        Limit o'rnatish
                      </Button>
                    </div>

                    {/* Expire Trial */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      loading={actionLoading?.includes("expire-trial")}
                      onClick={handleExpireTrial}
                      icon={<Timer size={12} />}
                    >
                      Trial tugatish
                    </Button>

                    <Separator />

                    {/* Grant Agent */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9 text-xs"
                      onClick={() => setShowGrantDialog(true)}
                      icon={<Gift size={14} />}
                    >
                      Agent berish
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">Ma'lumot topilmadi</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Grant Agent Dialog */}
      {showGrantDialog && detail && (
        <GrantAgentDialog
          open={showGrantDialog}
          onClose={() => setShowGrantDialog(false)}
          userId={userId}
          userName={detail.user.first_name || "Foydalanuvchi"}
          fetchWithAuth={fetchWithAuth}
          haptic={haptic}
          onSuccess={async () => {
            const updated = await fetchWithAuth(`/api/admin/users/${userId}`);
            setDetail(updated);
            onUserUpdated();
          }}
        />
      )}
    </>
  );
}
