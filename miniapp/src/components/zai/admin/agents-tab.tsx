"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Bot, Settings, DollarSign, Save } from "lucide-react";
import { toast } from "sonner";

interface AgentsTabProps {
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
}

interface AgentItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  is_featured: boolean;
  price_daily: number;
  price_weekly: number;
  price_monthly: number;
  daily_limit: number;
  sort_order: number;
}

export function AgentsTab({ fetchWithAuth, haptic }: AgentsTabProps) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [pricingForm, setPricingForm] = useState({
    price_daily: "",
    price_weekly: "",
    price_monthly: "",
  });
  const [settingsForm, setSettingsForm] = useState({
    is_active: true,
    is_featured: false,
    daily_limit: "",
    sort_order: "",
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await fetchWithAuth("/api/agents");
      setAgents(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (agent: AgentItem) => {
    setEditingAgent(agent);
    setPricingForm({
      price_daily: String(agent.price_daily || 0),
      price_weekly: String(agent.price_weekly || 0),
      price_monthly: String(agent.price_monthly || 0),
    });
    setSettingsForm({
      is_active: agent.is_active,
      is_featured: agent.is_featured,
      daily_limit: String(agent.daily_limit || 50),
      sort_order: String(agent.sort_order || 0),
    });
    haptic("light");
  };

  const savePricing = async () => {
    if (!editingAgent) return;
    setSavingPricing(true);
    try {
      await fetchWithAuth(`/api/admin/agents/${editingAgent.slug}/pricing`, {
        method: "PUT",
        body: JSON.stringify({
          price_daily: parseInt(pricingForm.price_daily) || 0,
          price_weekly: parseInt(pricingForm.price_weekly) || 0,
          price_monthly: parseInt(pricingForm.price_monthly) || 0,
        }),
      });
      haptic("medium");
      toast.success("Narxlar saqlandi");
      loadAgents();
    } catch (err: any) {
      toast.error(err?.message || "Xatolik");
    } finally {
      setSavingPricing(false);
    }
  };

  const saveSettings = async () => {
    if (!editingAgent) return;
    setSavingSettings(true);
    try {
      await fetchWithAuth(`/api/admin/agents/${editingAgent.slug}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          is_active: settingsForm.is_active,
          is_featured: settingsForm.is_featured,
          daily_limit: parseInt(settingsForm.daily_limit) || 50,
          sort_order: parseInt(settingsForm.sort_order) || 0,
        }),
      });
      haptic("medium");
      toast.success("Sozlamalar saqlandi");
      loadAgents();
    } catch (err: any) {
      toast.error(err?.message || "Xatolik");
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground font-medium">
        {agents.length} ta agent
      </p>

      {/* Agent List */}
      <div className="space-y-2">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            interactive
            className="cursor-pointer"
            onClick={() => openEdit(agent)}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground">{agent.slug}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {!agent.is_active && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 text-rose-500 border-rose-500/20">
                      O'chiq
                    </Badge>
                  )}
                  {agent.is_featured && (
                    <Badge className="text-[8px] px-1 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
                      Featured
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                <span>{(agent.price_daily || 0).toLocaleString()} / kun</span>
                <span>{(agent.price_weekly || 0).toLocaleString()} / hafta</span>
                <span>{(agent.price_monthly || 0).toLocaleString()} / oy</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAgent} onOpenChange={(o) => { if (!o) setEditingAgent(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot size={16} />
              {editingAgent?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* Pricing */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-muted-foreground" />
                <p className="text-[11px] font-semibold">Narxlar (UZS)</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px]">Kunlik</Label>
                  <Input
                    type="number"
                    value={pricingForm.price_daily}
                    onChange={(e) => setPricingForm({ ...pricingForm, price_daily: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px]">Haftalik</Label>
                  <Input
                    type="number"
                    value={pricingForm.price_weekly}
                    onChange={(e) => setPricingForm({ ...pricingForm, price_weekly: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px]">Oylik</Label>
                  <Input
                    type="number"
                    value={pricingForm.price_monthly}
                    onChange={(e) => setPricingForm({ ...pricingForm, price_monthly: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={savePricing}
                loading={savingPricing}
                icon={<Save size={12} />}
              >
                Narxlarni saqlash
              </Button>
            </div>

            <Separator />

            {/* Settings */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings size={14} className="text-muted-foreground" />
                <p className="text-[11px] font-semibold">Sozlamalar</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px]">Faol</span>
                  <button
                    type="button"
                    aria-label="Faol holatni o'zgartirish"
                    aria-pressed={settingsForm.is_active}
                    onClick={() => setSettingsForm({ ...settingsForm, is_active: !settingsForm.is_active })}
                    className={`w-10 h-5 rounded-full transition-all ${
                      settingsForm.is_active ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      settingsForm.is_active ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px]">Featured</span>
                  <button
                    type="button"
                    aria-label="Featured holatni o'zgartirish"
                    aria-pressed={settingsForm.is_featured}
                    onClick={() => setSettingsForm({ ...settingsForm, is_featured: !settingsForm.is_featured })}
                    className={`w-10 h-5 rounded-full transition-all ${
                      settingsForm.is_featured ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      settingsForm.is_featured ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[9px]">Kunlik limit</Label>
                    <Input
                      type="number"
                      value={settingsForm.daily_limit}
                      onChange={(e) => setSettingsForm({ ...settingsForm, daily_limit: e.target.value })}
                      className="h-8 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px]">Tartib</Label>
                    <Input
                      type="number"
                      value={settingsForm.sort_order}
                      onChange={(e) => setSettingsForm({ ...settingsForm, sort_order: e.target.value })}
                      className="h-8 text-xs rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={saveSettings}
                loading={savingSettings}
                icon={<Save size={12} />}
              >
                Sozlamalarni saqlash
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditingAgent(null)} className="text-xs">
              Yopish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
