"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

interface GrantAgentDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
  onSuccess: () => void;
}

interface AgentOption {
  id: string;
  slug: string;
  name: string;
}

export function GrantAgentDialog({
  open, onClose, userId, userName, fetchWithAuth, haptic, onSuccess,
}: GrantAgentDialogProps) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentSlug, setAgentSlug] = useState("");
  const [planType, setPlanType] = useState("monthly");
  const [customDays, setCustomDays] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    if (!open) return;
    fetchWithAuth("/api/agents")
      .then((data) => {
        setAgents(data || []);
      })
      .catch(console.error)
      .finally(() => setLoadingAgents(false));
  }, [open, fetchWithAuth]);

  const handleGrant = async () => {
    if (!agentSlug) {
      toast.error("Agent tanlang");
      return;
    }
    if (!reason || reason.length < 3) {
      toast.error("Sabab kamida 3 belgi bo'lishi kerak");
      return;
    }
    if (planType === "custom" && (!customDays || parseInt(customDays) < 1)) {
      toast.error("Kunlar sonini kiriting");
      return;
    }

    setLoading(true);
    try {
      const body: any = {
        agent_slug: agentSlug,
        plan_type: planType,
        reason,
      };
      if (planType === "custom") {
        body.duration_days = parseInt(customDays);
      }

      await fetchWithAuth(`/api/admin/users/${userId}/grant-agent`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      haptic("medium");
      toast.success("Agent muvaffaqiyatli berildi!");
      onSuccess();
      onClose();
      // Reset form
      setAgentSlug("");
      setPlanType("monthly");
      setCustomDays("");
      setReason("");
    } catch (err: any) {
      toast.error(err?.message || "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  const planOptions = [
    { value: "daily", label: "1 kun" },
    { value: "weekly", label: "7 kun" },
    { value: "monthly", label: "30 kun" },
    { value: "custom", label: "Maxsus" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Agent berish</DialogTitle>
          <DialogDescription>
            {userName} foydalanuvchiga to'lovsiz agent bering
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Agent Select */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium">Agent</Label>
            {loadingAgents ? (
              <div className="h-8 rounded-lg bg-muted/50 animate-pulse" />
            ) : (
              <Select value={agentSlug} onValueChange={(val) => setAgentSlug(val || "")}>
                <SelectTrigger className="w-full h-9 text-xs">
                  <SelectValue placeholder="Agent tanlang..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Plan Type Radio */}
          <div className="space-y-2">
            <Label className="text-[11px] font-medium">Muddat</Label>
            <RadioGroup value={planType} onValueChange={setPlanType} className="grid grid-cols-2 gap-2">
              {planOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                    planType === opt.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <RadioGroupItem value={opt.value} />
                  <span className="font-medium">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Custom Days Input */}
          {planType === "custom" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium">Kunlar soni</Label>
              <Input
                type="number"
                placeholder="Masalan: 14"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="h-9 text-xs rounded-lg"
                min={1}
                max={365}
              />
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium">Sabab (audit uchun)</Label>
            <Textarea
              placeholder="Masalan: Beta tester, VIP mijoz..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs rounded-lg resize-none h-16"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Bekor qilish
          </Button>
          <Button
            size="sm"
            onClick={handleGrant}
            loading={loading}
            disabled={!agentSlug || reason.length < 3}
            className="text-xs"
          >
            Berish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
