"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Zap, TrendingUp, Bot, Crown, Activity } from "lucide-react";

interface DashboardTabProps {
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
}

interface DashboardData {
  users: {
    total: number;
    active_today: number;
    new_this_week: number;
    new_this_month: number;
    premium_count: number;
  };
  tasks: {
    total: number;
    today: number;
    this_week: number;
    failed_rate: number;
  };
  revenue: {
    total: number;
    this_month: number;
    by_method: Record<string, number>;
  };
  agents: {
    most_used: Array<{ slug: string; name: string; task_count: number }>;
  };
}

export function DashboardTab({ fetchWithAuth, haptic }: DashboardTabProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth("/api/admin/analytics/dashboard")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchWithAuth]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-muted-foreground">Ma'lumotlarni yuklashda xatolik</p>
      </div>
    );
  }

  const metrics = [
    {
      label: "Jami foydalanuvchilar",
      value: data.users.total.toLocaleString(),
      icon: <Users size={16} />,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Bugun faol",
      value: data.users.active_today.toLocaleString(),
      icon: <Activity size={16} />,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Shu hafta yangi",
      value: data.users.new_this_week.toLocaleString(),
      icon: <TrendingUp size={16} />,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Premium",
      value: data.users.premium_count.toLocaleString(),
      icon: <Crown size={16} />,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Bugungi tasklar",
      value: data.tasks.today.toLocaleString(),
      icon: <Zap size={16} />,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      label: "Jami tasklar",
      value: data.tasks.total.toLocaleString(),
      icon: <Zap size={16} />,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {metrics.map((m, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${m.bgColor} ${m.color}`}>
                  {m.icon}
                </div>
              </div>
              <p className="text-xl font-bold">{m.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Card */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Daromad</h3>
          <div className="flex justify-between items-baseline mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Jami</p>
              <p className="text-lg font-bold">{data.revenue.total.toLocaleString()} UZS</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Shu oy</p>
              <p className="text-base font-semibold text-emerald-500">
                {data.revenue.this_month.toLocaleString()} UZS
              </p>
            </div>
          </div>
          {/* Revenue by method - simple bars */}
          {Object.keys(data.revenue.by_method).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Usul bo'yicha</p>
              {Object.entries(data.revenue.by_method)
                .filter(([method]) => method !== "admin_grant")
                .map(([method, amount]) => {
                  const maxAmount = Math.max(...Object.values(data.revenue.by_method));
                  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground capitalize">{method.replace(/_/g, " ")}</span>
                        <span className="font-medium">{amount.toLocaleString()} UZS</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed Rate */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground">Xatolik darajasi</p>
              <p className="text-lg font-bold">
                {(data.tasks.failed_rate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="w-16 h-16 relative">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  className={data.tasks.failed_rate > 0.1 ? "text-rose-500" : "text-emerald-500"}
                  strokeWidth="3"
                  strokeDasharray={`${data.tasks.failed_rate * 100}, 100`}
                />
              </svg>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Shu hafta: {data.tasks.this_week.toLocaleString()} task
          </p>
        </CardContent>
      </Card>

      {/* Top Agents */}
      {data.agents.most_used.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Top Agentlar</h3>
            <div className="space-y-2.5">
              {data.agents.most_used.map((agent, i) => {
                const maxTasks = data.agents.most_used[0]?.task_count || 1;
                const pct = (agent.task_count / maxTasks) * 100;
                return (
                  <div key={agent.slug} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-4">
                          #{i + 1}
                        </span>
                        <span className="text-xs font-medium">{agent.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {agent.task_count.toLocaleString()}
                      </Badge>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden ml-6">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
