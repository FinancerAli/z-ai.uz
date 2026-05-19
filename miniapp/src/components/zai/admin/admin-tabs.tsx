"use client";

import { useState } from "react";
import { ChevronRight, LayoutDashboard, Users, Bot, ScrollText, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardTab } from "./dashboard-tab";
import { UsersTab } from "./users-tab";
import { AgentsTab } from "./agents-tab";
import { AuditTab } from "./audit-tab";
import { PaymentsTab } from "./payments-tab";

interface AdminTabsProps {
  user: any;
  onBack: () => void;
  fetchWithAuth: (endpoint: string, options?: RequestInit) => Promise<any>;
  haptic: (type?: "light" | "medium" | "heavy") => void;
}

type AdminTabValue = "dashboard" | "users" | "agents" | "payments" | "audit";

const tabs: { id: AdminTabValue; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14} /> },
  { id: "users", label: "Foydalanuvchilar", icon: <Users size={14} /> },
  { id: "agents", label: "Agentlar", icon: <Bot size={14} /> },
  { id: "payments", label: "To'lovlar", icon: <CreditCard size={14} /> },
  { id: "audit", label: "Audit", icon: <ScrollText size={14} /> },
];

export function AdminTabs({ user, onBack, fetchWithAuth, haptic }: AdminTabsProps) {
  const [activeTab, setActiveTab] = useState<AdminTabValue>("dashboard");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Orqaga"
          className="w-8 h-8 rounded-full"
          onClick={() => { haptic("light"); onBack(); }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
        </Button>
        <h2 className="text-lg font-bold">Admin Panel v2</h2>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); haptic("light"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        <DashboardTab fetchWithAuth={fetchWithAuth} haptic={haptic} />
      )}
      {activeTab === "users" && (
        <UsersTab fetchWithAuth={fetchWithAuth} haptic={haptic} />
      )}
      {activeTab === "agents" && (
        <AgentsTab fetchWithAuth={fetchWithAuth} haptic={haptic} />
      )}
      {activeTab === "payments" && (
        <PaymentsTab fetchWithAuth={fetchWithAuth} haptic={haptic} />
      )}
      {activeTab === "audit" && (
        <AuditTab fetchWithAuth={fetchWithAuth} haptic={haptic} />
      )}
    </div>
  );
}
