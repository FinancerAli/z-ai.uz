"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

const MANIFEST_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/tonconnect-manifest.json`
    : process.env.NEXT_PUBLIC_FRONTEND_URL 
      ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}/tonconnect-manifest.json` 
      : "https://zai.ustaitech.uz/tonconnect-manifest.json";

export function TonProvider({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      {children}
    </TonConnectUIProvider>
  );
}
