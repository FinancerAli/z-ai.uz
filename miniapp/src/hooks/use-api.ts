import { useState, useCallback, useEffect } from "react";
import { useTelegram } from "./use-telegram";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || (process.env.NODE_ENV === 'production' ? 'https://apizai.ustaitech.uz' : 'http://localhost:8005');

const TOKEN_KEY = "zai_jwt";

/**
 * RateLimitError — backend 429 javobini ifodalovchi xato.
 * `Retry-After` header'idan o'qilgan soniyalar qiymatini saqlaydi,
 * shu orqali UI countdown'ni ko'rsata oladi.
 */
export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number, message?: string) {
    super(message || `Rate limit exceeded. Retry after ${retryAfter}s`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * NetworkError — qurilma offline bo'lgan yoki tarmoq xatosi yuz bergan
 * paytda `fetch()` chiqaradigan TypeError'ni ifodalovchi typed xato.
 * UI bu xatoni tutib, OfflineBanner orqali foydalanuvchiga xabar berishi
 * mumkin (shu bilan birga RateLimitError va boshqa server xatolaridan
 * farqli ravishda ishlanadi).
 */
export class NetworkError extends Error {
  constructor(message?: string) {
    super(message || "Network unavailable");
    this.name = "NetworkError";
  }
}

/**
 * AuthExpiredError — JWT token expired/invalid va auto-refresh ham
 * muvaffaqiyatsiz tugagan paytda chiqariladi. UI buni tutib foydalanuvchiga
 * "Sessiya muddati tugagan, Mini App'ni qayta oching" deb ko'rsatishi kerak.
 */
export class AuthExpiredError extends Error {
  constructor(message?: string) {
    super(message || "Sessiya muddati tugagan. Iltimos mini ilovani qayta oching.");
    this.name = "AuthExpiredError";
  }
}

async function saveToken(token: string): Promise<void> {
  if (typeof window === "undefined") return;
  const ss = window.Telegram?.WebApp?.SecureStorage;
  const cs = window.Telegram?.WebApp?.CloudStorage;
  if (ss) {
    await ss.setItem(TOKEN_KEY, token);
  } else if (cs) {
    await new Promise<void>((resolve) => cs.setItem(TOKEN_KEY, token, () => resolve()));
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

async function clearToken(): Promise<void> {
  if (typeof window === "undefined") return;
  const ss = window.Telegram?.WebApp?.SecureStorage;
  const cs = window.Telegram?.WebApp?.CloudStorage;
  try {
    if (ss?.removeItem) {
      await ss.removeItem(TOKEN_KEY);
    } else if (cs?.removeItem) {
      await new Promise<void>((resolve) => cs.removeItem(TOKEN_KEY, () => resolve()));
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // best-effort: agar removeItem qo'llab-quvvatlanmasa, bo'sh string bilan ovrayd qilamiz
    try { await saveToken(""); } catch {}
  }
}

async function loadToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  // Dedupe: agar boshqa chaqiruv allaqachon yuklayotgan bo'lsa, o'sha promise'ni qaytaramiz.
  // Aks holda bir nechta `useApi()` instance bir vaqtda Telegram CloudStorage'dan
  // o'qishi mumkin (race condition).
  if (inFlightLoad) return inFlightLoad;

  inFlightLoad = (async () => {
    try {
      const ss = window.Telegram?.WebApp?.SecureStorage;
      const cs = window.Telegram?.WebApp?.CloudStorage;
      if (ss) {
        return await ss.getItem(TOKEN_KEY);
      } else if (cs) {
        return await new Promise<string | null>((resolve) =>
          cs.getItem(TOKEN_KEY, (err: string | null, val: string | null) => resolve(err ? null : val))
        );
      } else {
        return sessionStorage.getItem(TOKEN_KEY);
      }
    } finally {
      // Tozalash darhol — chunki har ikki chaqiruvda yangi qiymat o'qish kerak bo'lishi mumkin
      setTimeout(() => { inFlightLoad = null; }, 100);
    }
  })();
  return inFlightLoad;
}

interface AuthUser {
  id: string;
  telegram_id: number;
  first_name: string;
  username?: string;
  plan: string;
  trial_expires_at: string | null;
  daily_limit: number;
  is_premium?: boolean;
}

// =====================================================================
// Module-level singleton: barcha hook instance'lar uchun bitta in-flight
// auth promise va in-flight loadToken promise.
//
// Sabab: Mini App'da bir vaqtda bir nechta `useApi()` instance ishlashi mumkin
// (page.tsx, profile-page, agent-purchase-flow va h.k.). Har biri 401 olganda
// alohida `/api/auth/telegram` POST yuborsa, backend rate limit (10/min)
// tezda oshib ketadi va 429 qaytaradi → cascade auth failure.
// =====================================================================
let inFlightAuth: Promise<{ token: string; user: AuthUser | null } | null> | null = null;
let inFlightLoad: Promise<string | null> | null = null;
let lastAuthAt = 0;
const AUTH_DEDUPE_WINDOW_MS = 2000;  // 2 soniya ichida qayta auth bo'lmaydi

export function useApi() {
  const { webapp } = useTelegram();
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const initData = webapp?.initData;

  // Yangi token olish — initData mavjud bo'lsa /auth/telegram ga so'rov yuboradi.
  // ⚠️ Module-level singleton bilan dedupe: bir vaqtda bir nechta hook instance
  // /auth/telegram chaqirsa, faqat birinchisi haqiqiy so'rov yuboradi, qolganlari
  // o'sha promise'ni kutib turadi. Bu rate limit (10/min) ni saqlash uchun muhim.
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!initData) return null;

    // Agar yaqinda muvaffaqiyatli auth bo'lgan bo'lsa, cached tokenni qaytaramiz
    const now = Date.now();
    if (now - lastAuthAt < AUTH_DEDUPE_WINDOW_MS) {
      const cached = await loadToken();
      if (cached) return cached;
    }

    // Boshqa instance allaqachon refresh qilayotgan bo'lsa, kutamiz
    if (inFlightAuth) {
      const result = await inFlightAuth;
      if (result?.token) {
        setToken(result.token);
        if (result.user) setAuthUser(result.user);
        return result.token;
      }
      return null;
    }

    // Yangi auth oqimi
    inFlightAuth = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ init_data: initData }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.token) return null;
        await saveToken(data.token);
        lastAuthAt = Date.now();
        return { token: data.token, user: data.user || null };
      } catch {
        return null;
      } finally {
        // 1 soniya keyin singleton'ni tozalash — keyingi auth qayta yangilash mumkin
        setTimeout(() => { inFlightAuth = null; }, 1000);
      }
    })();

    const result = await inFlightAuth;
    if (result?.token) {
      setToken(result.token);
      if (result.user) setAuthUser(result.user);
      return result.token;
    }
    return null;
  }, [initData]);

  // Auth logic
  useEffect(() => {
    async function authenticate() {
      // Allow development on web without Telegram if needed, but for prod require initData
      if (!initData && process.env.NODE_ENV === "production") {
        setAuthError(true);
        setIsReady(true);
        return;
      }

      // Try to restore token from secure storage before making a network request.
      // Lekin avval token haqiqatan amal qilayotganini /auth/telegram orqali validatsiya qilamiz —
      // chunki JWT muddati 60 daqiqaga qisqartirilgan (Hardening Faza 1) va eski token cache'da
      // turishi mumkin.
      const cached = await loadToken();
      if (cached) {
        // Cached token bilan ham authUser'ni to'ldirishimiz kerak — aks holda
        // userPlan = "trial" default'i state'da qolib, "trial expired" UI ko'rinadi.
        // Yondashuv: cached tokenni state'ga qo'yamiz, keyin /api/auth/me/usage chaqirib
        // authUser'ni yangilaymiz. Agar 401 bo'lsa fetchWithAuth o'zi refreshToken qiladi.
        setToken(cached);
        setIsReady(true);
        // Background'da authUser'ni to'ldiramiz (UI'ni bloklamasdan)
        try {
          const headers: HeadersInit = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cached}`,
          };
          const res = await fetch(`${API_BASE}/api/auth/me/usage`, { headers });
          if (res.ok) {
            const usage = await res.json();
            // /me/usage javobida user.id va telegram_id yo'q — uni initData'dan olamiz
            const tgUser = (webapp as any)?.initDataUnsafe?.user;
            setAuthUser({
              id: "",  // unknown without /auth/telegram, lekin asosiy maydonlar bor
              telegram_id: tgUser?.id ?? 0,
              first_name: tgUser?.first_name ?? "",
              username: tgUser?.username,
              plan: usage.plan ?? "trial",
              trial_expires_at: usage.trial_expires_at ?? null,
              daily_limit: usage.daily_limit ?? 0,
              is_premium: usage.is_premium ?? false,
            });
          } else if (res.status === 401) {
            // Token expired — yangisi olamiz
            await refreshToken();
          }
        } catch {
          // Ignore — fetchWithAuth ham 401 da auto retry qiladi
        }
        return;
      }

      try {
        const newToken = await refreshToken();
        if (!newToken) setAuthError(true);
        else setAuthError(false);
      } catch (e) {
        console.error("Auth error", e);
        setAuthError(true);
      } finally {
        setIsReady(true);
      }
    }
    authenticate();
  }, [initData, refreshToken]);

  // Authenticated fetch wrapper
  const fetchWithAuth = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      // Hozirgi (yoki yangilangan) tokenni olamiz
      let activeToken = token;
      if (!activeToken) {
        // initData bor bo'lsa — bir martaga refresh qilib ko'ramiz
        activeToken = await refreshToken();
        if (!activeToken) throw new Error("Not authenticated");
      }

      const buildHeaders = (t: string): HeadersInit => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        ...options.headers,
      });

      const doFetch = async (t: string): Promise<Response> => {
        try {
          return await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: buildHeaders(t),
          });
        } catch (err) {
          // `fetch` browser'da tarmoq uzilganda yoki DNS xatosida TypeError chiqaradi.
          // Buni typed `NetworkError` sifatida qayta uloqtiramiz.
          if (err instanceof TypeError) {
            throw new NetworkError(err.message);
          }
          throw err;
        }
      };

      let res = await doFetch(activeToken);

      // Token expired yoki noto'g'ri bo'lsa — bir marta auto re-auth qilib qayta urinamiz.
      if (res.status === 401) {
        await clearToken();
        const newToken = await refreshToken();
        if (newToken) {
          res = await doFetch(newToken);
        }
      }

      if (res.status === 429) {
        const retryHeader = res.headers.get("Retry-After");
        const parsed = retryHeader ? parseInt(retryHeader, 10) : NaN;
        const retryAfter = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
        throw new RateLimitError(retryAfter);
      }
      // 401 holati hali ham qolsa (refresh ham 401 berdi) — friendly error
      if (res.status === 401 || res.status === 403) {
        throw new AuthExpiredError();
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail || `API Error: ${res.status}`);
      }
      return res.json();
    },
    [token, refreshToken],
  );

  // Plan/usage'ni yangilash — agent grant/buy keyin chaqiriladi.
  // Fire-and-forget — UI'ni bloklamasdan authUser'ni yangilaydi.
  const refreshAuthUser = useCallback(async (): Promise<void> => {
    const t = token || (await loadToken());
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me/usage`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
      });
      if (!res.ok) return;
      const usage = await res.json();
      setAuthUser((prev) => prev
        ? { ...prev,
            plan: usage.plan ?? prev.plan,
            trial_expires_at: usage.trial_expires_at ?? null,
            daily_limit: usage.daily_limit ?? prev.daily_limit,
            is_premium: usage.is_premium ?? prev.is_premium,
          }
        : {
            id: "",
            telegram_id: (webapp as any)?.initDataUnsafe?.user?.id ?? 0,
            first_name: (webapp as any)?.initDataUnsafe?.user?.first_name ?? "",
            username: (webapp as any)?.initDataUnsafe?.user?.username,
            plan: usage.plan ?? "trial",
            trial_expires_at: usage.trial_expires_at ?? null,
            daily_limit: usage.daily_limit ?? 0,
            is_premium: usage.is_premium ?? false,
          });
    } catch {
      // ignore — keyingi natural call paytida o'zi yangilanadi
    }
  }, [token, webapp]);

  return { token, isReady, authError, fetchWithAuth, authUser, refreshAuthUser };
}
