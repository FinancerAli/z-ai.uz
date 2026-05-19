/**
 * ZAI Format Utilities — Sana, valyuta, raqam formatlash
 */

/**
 * Relative vaqt formatlash (Telegram uslubida)
 * "Hozir", "5 daqiqa oldin", "3 soat oldin", "12 yan, 14:30"
 */
export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "Hozir";
  if (mins < 60) return `${mins} daqiqa oldin`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} kun oldin`;

  return d.toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * So'm formatlash: 49000 → "49 000"
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("uz-UZ");
}

/**
 * Qisqa raqam: 1234 → "1.2K", 1234567 → "1.2M"
 */
export function formatCompact(num: number): string {
  if (num < 1000) return num.toString();
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1_000_000).toFixed(1)}M`;
}

/**
 * Token narxi: 0.001234 → "$0.0012"
 */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Trial qolgan kunlarni hisoblash
 */
export function getTrialDaysLeft(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const expires = new Date(expiresAt);
  const now = new Date();
  const diff = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}
