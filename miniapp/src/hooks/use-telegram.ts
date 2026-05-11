"use client";
import { useEffect, useCallback, useRef } from "react";

// =============================================
//  Telegram WebApp — Full Type Definitions
//  Bot API 9.5 (2026) asosida
// =============================================
interface TGThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
  section_separator_color?: string;
}

interface TGSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TGBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TGBottomButton {
  type: "main" | "secondary";
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText(text: string): TGBottomButton;
  show(): TGBottomButton;
  hide(): TGBottomButton;
  enable(): TGBottomButton;
  disable(): TGBottomButton;
  showProgress(leaveActive?: boolean): TGBottomButton;
  hideProgress(): TGBottomButton;
  onClick(cb: () => void): TGBottomButton;
  offClick(cb: () => void): TGBottomButton;
  setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): TGBottomButton;
}

interface TGHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): TGHapticFeedback;
  notificationOccurred(type: "error" | "success" | "warning"): TGHapticFeedback;
  selectionChanged(): TGHapticFeedback;
}

interface TGCloudStorage {
  setItem(key: string, value: string, callback?: (err: string | null, stored: boolean) => void): TGCloudStorage;
  getItem(key: string, callback: (err: string | null, value: string | null) => void): TGCloudStorage;
  getItems(keys: string[], callback: (err: string | null, values: Record<string, string>) => void): TGCloudStorage;
  removeItem(key: string, callback?: (err: string | null, removed: boolean) => void): TGCloudStorage;
  removeItems(keys: string[], callback?: (err: string | null, removed: boolean) => void): TGCloudStorage;
  getKeys(callback: (err: string | null, keys: string[]) => void): TGCloudStorage;
}

interface TGDeviceStorage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface TGSecureStorage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  restoreItem(key: string): Promise<string | null>;
}

interface TGPopupButton {
  id?: string;
  type?: "default" | "ok" | "close" | "cancel" | "destructive";
  text?: string;
}

interface TGPopupParams {
  title?: string;
  message: string;
  buttons?: TGPopupButton[];
}

interface TGWebApp {
  // Core
  ready(): void;
  expand(): void;
  close(): void;
  isExpanded: boolean;
  isActive: boolean;
  isFullscreen: boolean;
  version: string;
  platform: string;

  // Theme
  colorScheme: "light" | "dark";
  themeParams: TGThemeParams;
  headerColor: string;
  backgroundColor: string;
  bottomBarColor: string;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;

  // Safe Area (Bot API 8.0+)
  safeAreaInset: TGSafeAreaInset;
  contentSafeAreaInset: TGSafeAreaInset;

  // Fullscreen (Bot API 8.0+)
  requestFullscreen(): void;
  exitFullscreen(): void;

  // Navigation
  BackButton: TGBackButton;
  MainButton: TGBottomButton;
  SecondaryButton: TGBottomButton;

  // Haptic
  HapticFeedback: TGHapticFeedback;

  // Storage
  CloudStorage: TGCloudStorage;
  DeviceStorage?: TGDeviceStorage;
  SecureStorage?: TGSecureStorage;

  // Init Data
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
      is_premium?: boolean;
    };
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };

  // Events
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;

  // UI Actions
  showPopup(params: TGPopupParams, callback?: (id: string) => void): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  showScanQrPopup(params: { text?: string }, callback?: (text: string) => boolean): void;
  closeScanQrPopup(): void;

  // Home Screen (Bot API 8.0+)
  addToHomeScreen(): void;
  checkHomeScreenStatus(callback: (status: "added" | "missed" | "unknown" | "unsupported") => void): void;

  // Links
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;

  // Scroll & Keyboard
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  enableVerticalSwipes(): void;
  disableVerticalSwipes(): void;
  hideKeyboard(): void;

  // Share
  shareToStory(media_url: string, params?: { text?: string }): void;
  shareMessage(message_id: string, callback?: (success: boolean) => void): void;

  // Misc
  sendData(data: string): void;
  readTextFromClipboard(callback: (text: string | null) => void): void;
  requestContact(callback: (shared: boolean) => void): void;
  requestWriteAccess(callback: (granted: boolean) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TGWebApp };
  }
}

// =============================================
//  CloudStorage Promise wrappers
// =============================================
export function cloudSet(key: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cs = window.Telegram?.WebApp?.CloudStorage;
    if (!cs) return resolve(false);
    cs.setItem(key, value, (err, stored) => resolve(!err && stored));
  });
}

export function cloudGet(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cs = window.Telegram?.WebApp?.CloudStorage;
    if (!cs) return resolve(null);
    cs.getItem(key, (err, value) => resolve(err ? null : value));
  });
}

export function cloudRemove(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cs = window.Telegram?.WebApp?.CloudStorage;
    if (!cs) return resolve(false);
    cs.removeItem(key, (err, removed) => resolve(!err && removed));
  });
}

// =============================================
//  useTelegram Hook — Senior Level
// =============================================
export function useTelegram() {
  const webapp = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

  // 1. Initialize + Theme sync + SafeArea CSS vars
  useEffect(() => {
    if (!webapp) return;

    webapp.ready();
    webapp.expand();
    if (webapp.disableVerticalSwipes) webapp.disableVerticalSwipes();

    const applyTheme = () => {
      const isDark = webapp.colorScheme === "dark";
      document.documentElement.classList.toggle("dark", isDark);

      // Telegram theme colors → CSS variables
      const p = webapp.themeParams;
      const root = document.documentElement.style;
      if (p.bg_color)              root.setProperty("--tg-bg",              p.bg_color);
      if (p.text_color)            root.setProperty("--tg-text",            p.text_color);
      if (p.button_color)          root.setProperty("--tg-button",          p.button_color);
      if (p.button_text_color)     root.setProperty("--tg-button-text",     p.button_text_color);
      if (p.secondary_bg_color)    root.setProperty("--tg-secondary-bg",    p.secondary_bg_color);
      if (p.header_bg_color)       root.setProperty("--tg-header-bg",       p.header_bg_color);
      if (p.hint_color)            root.setProperty("--tg-hint",            p.hint_color);
      if (p.destructive_text_color) root.setProperty("--tg-destructive",   p.destructive_text_color);
    };

    applyTheme();
    webapp.onEvent("themeChanged", applyTheme);

    // SafeArea sync
    const applySafeArea = () => {
      const sa = webapp.safeAreaInset;
      const csa = webapp.contentSafeAreaInset;
      if (sa) {
        document.documentElement.style.setProperty("--safe-top",    `${sa.top}px`);
        document.documentElement.style.setProperty("--safe-bottom", `${sa.bottom}px`);
        document.documentElement.style.setProperty("--safe-left",   `${sa.left}px`);
        document.documentElement.style.setProperty("--safe-right",  `${sa.right}px`);
      }
      if (csa) {
        document.documentElement.style.setProperty("--content-safe-top",    `${csa.top}px`);
        document.documentElement.style.setProperty("--content-safe-bottom", `${csa.bottom}px`);
      }
    };

    applySafeArea();
    webapp.onEvent("safeAreaChanged", applySafeArea);
    webapp.onEvent("contentSafeAreaChanged", applySafeArea);

    return () => {
      webapp.offEvent("themeChanged", applyTheme);
      webapp.offEvent("safeAreaChanged", applySafeArea);
      webapp.offEvent("contentSafeAreaChanged", applySafeArea);
    };
  }, [webapp]);

  // 2. Haptic helpers
  const haptic = useCallback(
    (type: "light" | "medium" | "heavy" = "medium") => {
      webapp?.HapticFeedback?.impactOccurred(type);
    }, [webapp]
  );

  const hapticSuccess = useCallback(() => {
    webapp?.HapticFeedback?.notificationOccurred("success");
  }, [webapp]);

  const hapticError = useCallback(() => {
    webapp?.HapticFeedback?.notificationOccurred("error");
  }, [webapp]);

  const hapticSelect = useCallback(() => {
    webapp?.HapticFeedback?.selectionChanged();
  }, [webapp]);

  // 3. BackButton kontroli
  const showBack = useCallback((onBack: () => void) => {
    if (!webapp?.BackButton) return;
    webapp.BackButton.show();
    webapp.BackButton.offClick(onBack); // in case it was already added
    webapp.BackButton.onClick(onBack);
  }, [webapp]);

  const hideBack = useCallback((onBack?: () => void) => {
    if (!webapp?.BackButton) return;
    webapp.BackButton.hide();
    if (onBack) webapp.BackButton.offClick(onBack);
  }, [webapp]);

  // 4. MainButton (BottomButton) kontroli
  const activeMainButtonCallback = useRef<(() => void) | null>(null);

  const showMainButton = useCallback((
    text: string,
    onClick: () => void,
    color?: string
  ) => {
    const btn = webapp?.MainButton;
    if (!btn) return;
    btn.setText(text);
    if (color) btn.setParams({ color, text_color: "#ffffff" });
    
    if (activeMainButtonCallback.current) {
      btn.offClick(activeMainButtonCallback.current);
    }
    btn.onClick(onClick);
    activeMainButtonCallback.current = onClick;
    
    btn.show();
    btn.enable();
  }, [webapp]);

  const hideMainButton = useCallback(() => {
    const btn = webapp?.MainButton;
    if (!btn) return;
    btn.hide();
    if (activeMainButtonCallback.current) {
      btn.offClick(activeMainButtonCallback.current);
      activeMainButtonCallback.current = null;
    }
  }, [webapp]);

  const setMainButtonLoading = useCallback((loading: boolean) => {
    const btn = webapp?.MainButton;
    if (!btn) return;
    if (loading) {
      btn.showProgress(false);
      btn.disable();
    } else {
      btn.hideProgress();
      btn.enable();
    }
  }, [webapp]);

  // 5. Native Popup
  const showAlert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      webapp?.showAlert(message, resolve);
    });
  }, [webapp]);

  const showConfirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      if (!webapp) return resolve(false);
      webapp.showConfirm(message, resolve);
    });
  }, [webapp]);

  const showPopup = useCallback((params: TGPopupParams) => {
    return new Promise<string>((resolve) => {
      webapp?.showPopup(params, resolve);
    });
  }, [webapp]);

  // 6. Home Screen shortcut
  const addToHomeScreen = useCallback(() => {
    webapp?.addToHomeScreen();
  }, [webapp]);

  // 7. User data
  const user = webapp?.initDataUnsafe?.user;
  const startParam = webapp?.initDataUnsafe?.start_param;
  const isPremium = user?.is_premium ?? false;

  return {
    webapp,
    user,
    startParam,
    isPremium,
    isTelegram: !!webapp,
    isFullscreen: webapp?.isFullscreen ?? false,
    platform: webapp?.platform ?? "unknown",
    // Haptic
    haptic,
    hapticSuccess,
    hapticError,
    hapticSelect,
    // Navigation
    showBack,
    hideBack,
    // Main Button
    showMainButton,
    hideMainButton,
    setMainButtonLoading,
    // Popups
    showAlert,
    showConfirm,
    showPopup,
    // Home screen
    addToHomeScreen,
    // Cloud storage helpers
    cloudSet,
    cloudGet,
    cloudRemove,
  };
}
