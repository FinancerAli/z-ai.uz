"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { UserDetailSheet } from "./user-detail-sheet";

interface UsersTabProps {
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
}

interface UserItem {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  is_premium: boolean;
  status: string;
  balance: number;
  created_at: string | null;
  last_seen_at: string | null;
}

type StatusFilter = "" | "active" | "blocked" | "expired";

export function UsersTab({ fetchWithAuth, haptic }: UsersTabProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [offset, setOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const limit = 20;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.set("sort", "created_at");
      params.set("order", "desc");

      const data = await fetchWithAuth(`/api/admin/users?${params.toString()}`);
      if (data) {
        setUsers(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, search, statusFilter, offset]);

  useEffect(() => {
    const timer = setTimeout(loadUsers, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "", label: "Barchasi" },
    { value: "active", label: "Faol" },
    { value: "blocked", label: "Bloklangan" },
  ];

  const getStatusBadge = (status: string, isPremium: boolean) => {
    if (status === "blocked") {
      return <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Bloklangan</Badge>;
    }
    if (isPremium) {
      return <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">Premium</Badge>;
    }
    return <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Faol</Badge>;
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Qidirish (ism, username, ID)..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          className="pl-9 h-9 text-sm rounded-xl"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setOffset(0); haptic("light"); }}
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

      {/* Results count */}
      <p className="text-[10px] text-muted-foreground font-medium">
        {total.toLocaleString()} foydalanuvchi topildi
      </p>

      {/* User List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-muted-foreground">Foydalanuvchilar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card
              key={u.id}
              interactive
              className="cursor-pointer"
              onClick={() => { setSelectedUserId(u.id); haptic("light"); }}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] font-bold truncate">
                        {u.first_name || "—"} {u.last_name || ""}
                      </p>
                      {u.is_admin && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary">
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {u.username ? `@${u.username}` : `ID: ${u.telegram_id}`}
                    </p>
                  </div>
                  {getStatusBadge(u.status, u.is_premium)}
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                  <span>{u.balance.toLocaleString()} UZS</span>
                  {u.last_seen_at && (
                    <span>
                      {new Date(u.last_seen_at).toLocaleDateString("uz-UZ", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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

      {/* User Detail Sheet */}
      {selectedUserId && (
        <UserDetailSheet
          userId={selectedUserId}
          open={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
          fetchWithAuth={fetchWithAuth}
          haptic={haptic}
          onUserUpdated={loadUsers}
        />
      )}
    </div>
  );
}
