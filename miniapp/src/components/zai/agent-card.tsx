"use client";

import { ChevronRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type AgentMeta } from "@/lib/agents";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AgentStatus = "available" | "trial" | "active" | "locked" | "pending" | "expired";

interface AgentCardProps {
  agent: AgentMeta;
  status: AgentStatus;
  priceMonthly?: number;
  onUse?: () => void;
  onBuy?: () => void;
  onClick?: () => void;
  showPrice?: boolean;
  compact?: boolean;
}

export function AgentCard({
  agent,
  status,
  priceMonthly,
  onUse,
  onBuy,
  onClick,
  showPrice = true,
  compact = false,
}: AgentCardProps) {
  const Icon = agent.icon;
  const isLocked = status === "locked" || status === "expired";

  const cardVariant = isLocked
    ? "locked"
    : status === "active"
    ? "highlighted"
    : "default";

  return (
    <Card
      variant={cardVariant}
      interactive={!!onClick}
      onClick={onClick}
      className={cn("p-4", !isLocked && agent.accent.border)}
    >
      <div className="flex items-center gap-3">
        {/* Agent Icon */}
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            isLocked ? "bg-muted text-muted-foreground" : agent.accent.bg,
            !isLocked && agent.accent.text
          )}
        >
          <Icon size={20} strokeWidth={2} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {compact ? agent.shortName : agent.name}
          </p>
          {!compact && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {agent.description}
            </p>
          )}
          {showPrice && priceMonthly && !compact && (
            <p className="mt-1 text-xs font-bold text-primary">
              {formatCurrency(priceMonthly)} so'm/oy
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {status === "active" && (
            <>
              <Badge variant="success">Faol</Badge>
              {onUse && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => { e.stopPropagation(); onUse(); }}
                >
                  Ochish
                </Button>
              )}
            </>
          )}

          {status === "trial" && (
            <>
              <Badge variant="info">Sinov</Badge>
              {onUse && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => { e.stopPropagation(); onUse(); }}
                >
                  Ochish
                </Button>
              )}
            </>
          )}

          {status === "pending" && <Badge variant="warning">Tekshiruvda</Badge>}

          {status === "available" && onBuy && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onBuy(); }}
            >
              Xarid
            </Button>
          )}

          {isLocked && !onBuy && (
            <Lock size={16} className="text-muted-foreground" />
          )}

          {isLocked && onBuy && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onBuy(); }}
            >
              Xarid
            </Button>
          )}

          {onClick && !onBuy && !onUse && status !== "pending" && !isLocked && (
            <ChevronRight size={16} className="text-muted-foreground" />
          )}
        </div>
      </div>
    </Card>
  );
}
