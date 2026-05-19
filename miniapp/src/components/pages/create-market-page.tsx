"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { pageVariants } from "@/lib/page-types";

interface CreateMarketPageProps {
  haptic: (t?: "light" | "medium" | "heavy") => void;
  hapticSuccess: () => void;
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
  onBack: () => void;
}

export function CreateMarketPage({ haptic, hapticSuccess, fetchWithAuth, onBack }: CreateMarketPageProps) {
  const [biz, setBiz] = useState("");
  const [industry, setIndustry] = useState("");
  const [type, setType] = useState("SWOT");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runAgent = async () => {
    if (!biz.trim()) return;
    setLoading(true); setResult(null); haptic("heavy");
    try {
      const data = await fetchWithAuth("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          agent_slug: "market-analysis",
          input_text: biz,
          context_data: { business_name: biz, industry: industry, analysis_type: type, target_market: "O'zbekiston", goal: "" }
        }),
      });
      setResult(data.output_text || "Hech qanday natija qaytmadi");
      hapticSuccess();
    } catch (e: any) {
      setResult("⚠️ Xatolik yoki ushbu agent sizda faol emas.\n\n" + (e.message || ""));
    } finally { setLoading(false); }
  };

  return (
    <motion.div {...pageVariants} className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
         <Button variant="ghost" size="icon" aria-label="Orqaga" onClick={onBack}><ChevronRight className="rotate-180" aria-hidden="true" /></Button>
         <div>
           <h2 className="text-lg font-bold">Biznes Tahlil</h2>
           <p className="text-xs text-muted-foreground">Bozor va raqobatchilarni tahlil qiling</p>
         </div>
      </div>

      {!result && !loading && (
        <div className="space-y-4">
          <input
            aria-label="Biznes nomi"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Biznes nomi (Masalan: Evos)"
            value={biz}
            onChange={e=>setBiz(e.target.value)}
          />
          <input
            aria-label="Soha"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Soha (Masalan: Fast Food)"
            value={industry}
            onChange={e=>setIndustry(e.target.value)}
          />
          <div role="group" aria-labelledby="market-type-label">
            <span id="market-type-label" className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Tahlil turi</span>
            <div className="flex flex-wrap gap-2">
               {["SWOT", "Target audience", "Raqobatchi tahlili"].map((t) => (
                 <button
                   key={t}
                   type="button"
                   aria-pressed={type === t}
                   onClick={() => {setType(t); haptic("light");}}
                   className={`px-3 py-1.5 rounded-lg border text-sm transition ${type===t ? "bg-primary text-white" : "bg-card text-foreground"}`}
                 >
                   {t}
                 </button>
               ))}
            </div>
          </div>
          <Button className="w-full" onClick={runAgent} disabled={!biz.trim()}>Tahlilni boshlash</Button>
        </div>
      )}

      {loading && (
        <div className="py-20 text-center space-y-3">
           <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
           <p className="font-bold">Bozor o'rganilmoqda...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
           <Card><CardContent className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{result}</CardContent></Card>
           <Button className="w-full" variant="outline" onClick={() => setResult(null)}>Yangi tahlil</Button>
        </div>
      )}
    </motion.div>
  );
}

export default CreateMarketPage;
