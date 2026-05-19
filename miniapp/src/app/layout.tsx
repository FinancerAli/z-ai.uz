import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { TonProvider } from "@/components/ton-provider";
import { Toaster } from "sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ZAI — AI Marketing Agent",
  description: "O'zbekiston biznesi uchun AI marketing yordamchisi. Professional postlar 10 soniyada.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${geist.variable} antialiased`}>
        <TonProvider>
          {children}
        </TonProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            className: "rounded-xl text-sm font-medium",
            duration: 3000,
          }}
        />
      </body>
    </html>
  );
}
