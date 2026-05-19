"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

interface AuditTabProps {
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
}

interface AuditLogItem {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: string | null;
  ip_address: string | null;
  created_at: string | null;
}

type ActionFilter = "" | "block_user" | "unblock_user" | "grant_agent" | "extend_trial" | "reset_trial" | "revoke_agent";

const actionLabels: Record<string, string> = {
  block_user: "Bloklash",
  unblock_user: "Blokdan chiqarish",
  grant_agent: "Agent berish",
  extend_trial: "Trial uzaytirish",
  reset_trial: "Trial qayta boshlash",
  set_daily_limit: "Limit o'zgartirish",
  expire_trial: "Trial tugatish",
  extend_agent: "Agent uzaytirish",
  revoke_agent: "Agent bekor qilish",
  update_pricing: "Narx o'zgartirish",
  update_settings: "Sozlama o'zgartirish",
  create_agent: "Agent yaratish",
  delete_agent: "Agent o'chirish",
};

const actionColors: Record<string, string> = {
  block_user: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  unblock_user: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  grant_agent: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  revoke_agent: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  extend_trial: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  reset_trial: "text-violet-500 bg-violet-500/10 border-violet-500/20",
};

export function AuditTab({ fetchWithAuth, haptic }: AuditTabProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const data = await fetchWithAuth(`/api/admin/audit-logs?${params.toString()}`);
      if (data) {
        setLogs(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, actionFilter, offset]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const filters: { value: ActionFilter; label: string }[] = [
    { value: "", label: "Barchasi" },
    { value: "block_user", label: "Bloklash" },
    { value: "grant_agent", label: "Agent berish" },
    { value: "extend_trial", label: "Uzaytirish" },
    { value: "revoke_agent", label: "Bekor qilish" },
  ];

  const parsePayload = (payload: string | null): Record<string, any> | null => {
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => { setActionFilter(f.value); setOffset(0); haptic("light"); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
              actionFilter === f.value
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground font-medium">
        {total.toLocaleString()} yozuv
      </p>

      {/* Logs List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10">
          <ScrollText size={24} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Audit loglar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const payload = parsePayload(log.payload);
            const colorClass = actionColors[log.action] || "text-muted-foreground bg-muted border-border/50";

            return (
              <Card key={log.id} className="border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${colorClass}`}
                    >
                      {actionLabels[log.action] || log.action}
                    </Badge>
                    {log.created_at && (
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString("uz-UZ", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <p>
                      <span className="font-medium text-foreground">{log.target_type}</span>
                      {log.target_id && (
                        <span className="ml-1 font-mono text-[9px]">
                          {log.target_id.slice(0, 8)}...
                        </span>
                      )}
                    </p>
                    {payload && (
                      <div className="mt-1 p-1.5 rounded bg-muted/50 text-[9px] font-mono break-all">
                        {Object.entries(payload).slice(0, 3).map(([key, val]) => (
                          <p key={key}>
                            <span className="text-muted-foreground">{key}:</span>{" "}
                            <span className="text-foreground">{String(val)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={offset === 0}
            onClick={() => { setOffset(Math.max(0, offset - limit)); haptic("light"); }}
            className="h-8 text-xs"
          >
            <ChevronLeft size={14} />
            Oldingi
          </Button>
          <span className="text-[11px] text-muted-foreground font-medium">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => { setOffset(offset + limit); haptic("light"); }}
            className="h-8 text-xs"
          >
            Keyingi
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
