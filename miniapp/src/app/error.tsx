"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global Error Caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center mx-auto shadow-sm">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        
        <div>
          <h2 className="text-lg font-bold">Xatolik yuz berdi</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Ilova ishlashida kutilmagan xatolik yuz berdi. Iltimos, qayta urinib ko'ring yoki adminga xabar bering.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-muted/50 border border-border text-[10px] text-muted-foreground font-mono text-left break-all">
          {error.message || "Unknown error"}
        </div>

        <Button 
          onClick={() => reset()} 
          className="w-full h-12 rounded-2xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} /> Qayta yuklash
        </Button>
      </div>
    </div>
  );
}
