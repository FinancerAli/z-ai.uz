import { useState, useCallback, useEffect } from "react";
import { useTelegram } from "./use-telegram";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || (process.env.NODE_ENV === 'production' ? 'https://apizai.ustaitech.uz' : 'http://localhost:8005');

interface AuthUser {
  id: string;
  telegram_id: number;
  first_name: string;
  username?: string;
  plan: string;
  trial_expires_at: string | null;
  daily_limit: number;
}

export function useApi() {
  const { webapp } = useTelegram();
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const initData = webapp?.initData;

  // Auth logic
  useEffect(() => {
    async function authenticate() {
      // Allow development on web without Telegram if needed, but for prod require initData
      if (!initData && process.env.NODE_ENV === "production") {
        setAuthError(true);
        setIsReady(true);
        return;
      }
      
      try {
        const res = await fetch(`${API_BASE}/api/auth/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ init_data: initData || "" }),
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
          setAuthUser(data.user || null);
          setAuthError(false);
        } else {
          setAuthError(true);
        }
      } catch (e) {
        console.error("Auth error", e);
        setAuthError(true);
      } finally {
        setIsReady(true);
      }
    }
    authenticate();
  }, [initData]);

  // Authenticated fetch wrapper
  const fetchWithAuth = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      if (!token) throw new Error("Not authenticated");
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail || `API Error: ${res.status}`);
      }
      return res.json();
    },
    [token]
  );

  return { token, isReady, authError, fetchWithAuth, authUser };
}
