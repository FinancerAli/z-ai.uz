"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="uz">
      <body>
        <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-6 text-center" style={{ fontFamily: "sans-serif" }}>
          <div className="max-w-sm w-full space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center mx-auto shadow-sm">
              <AlertCircle size={32} className="text-red-500" />
            </div>
            
            <div>
              <h2 className="text-lg font-bold">Kritik xatolik yuz berdi</h2>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                Ilova yuklanishida og'ir xatolik yuz berdi. Iltimos, Telegram ilovasini yopib qaytadan oching.
              </p>
            </div>

            <button 
              onClick={() => reset()} 
              className="w-full h-12 rounded-2xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2 border-0 outline-none cursor-pointer"
            >
              <RotateCcw size={16} /> Qayta yuklash
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
