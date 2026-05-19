"use client";

import { AlertTriangle, RefreshCw, MessageCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="uz">
      <body className="bg-white">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-sm space-y-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50">
              <AlertTriangle size={36} className="text-amber-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gray-900">
                Biror narsa noto&apos;g&apos;ri ketdi
              </h2>
              <p className="text-sm text-gray-500">
                Texnik muammo yuz berdi. Sahifani qayta yuklang yoki admin bilan bog&apos;laning.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={reset}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#6C3BFF] via-[#7B4FFF] to-[#8B5CF6] text-sm font-semibold text-white shadow-[0_8px_24px_-4px_rgba(108,59,255,0.25)] transition-all active:scale-[0.98] hover:brightness-110"
              >
                <RefreshCw size={16} />
                Qayta yuklash
              </button>
              <a
                href="https://t.me/Muxammadali"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98]"
              >
                <MessageCircle size={16} />
                Admin bilan bog&apos;lanish
              </a>
            </div>

            {process.env.NODE_ENV === "development" && error?.message && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-gray-400">
                  Texnik tafsilotlar
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-3 text-[11px] text-gray-600">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
