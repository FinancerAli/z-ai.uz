"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { pageVariants } from "@/lib/page-types";

interface CreateDocPageProps {
  haptic: (t?: "light" | "medium" | "heavy") => void;
  hapticSuccess: () => void;
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
  onBack: () => void;
}

export function CreateDocPage({ haptic, hapticSuccess, fetchWithAuth, onBack }: CreateDocPageProps) {
  const [text, setText] = useState("");
  const [outputType, setOutputType] = useState("Xulosa");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runAgent = async () => {
    if (!text.trim()) return;
    setLoading(true); setResult(null); haptic("heavy");
    try {
      const data = await fetchWithAuth("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          agent_slug: "document-writer",
          input_text: text,
          context_data: { document_text: text, output_type: outputType, language: "O'zbek", extra_instruction: "" }
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
           <h2 className="text-lg font-bold">Hujjat Tahlili</h2>
           <p className="text-xs text-muted-foreground">Matn yoki shartnomani tekshiring</p>
         </div>
      </div>

      {!result && !loading && (
        <div className="space-y-4">
          <div role="group" aria-labelledby="doc-output-type-label">
            <span id="doc-output-type-label" className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Tahlil turi</span>
            <div className="flex gap-2">
               {["Xulosa", "Risk tahlili", "Tarjima"].map((t) => (
                 <button
                   key={t}
                   type="button"
                   aria-pressed={outputType === t}
                   onClick={() => {setOutputType(t); haptic("light");}}
                   className={`px-3 py-1.5 rounded-lg border text-sm transition ${outputType===t ? "bg-primary text-white" : "bg-card text-foreground"}`}
                 >
                   {t}
                 </button>
               ))}
            </div>
          </div>
          <Textarea aria-label="Hujjat matni" placeholder="Hujjat matnini shu yerga joylang..." rows={8} value={text} onChange={(e)=>setText(e.target.value)} />
          <Button className="w-full" onClick={runAgent} disabled={!text.trim()}>Tahlil qilish</Button>
        </div>
      )}

      {loading && (
        <div className="py-20 text-center space-y-3">
           <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto" />
           <p className="font-bold">Hujjat o'qilmoqda...</p>
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

export default CreateDocPage;
