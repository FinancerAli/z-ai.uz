"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface BrandProfile {
  business_name?: string;
  industry?: string;
  target_audience?: string;
  products_services?: string;
  brand_tone?: string;
  main_cta?: string;
}

interface BrandProfilePageProps {
  onBack: () => void;
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
  haptic: (t?: "light" | "medium" | "heavy") => void;
}

export function BrandProfilePage({ onBack, fetchWithAuth, haptic }: BrandProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<BrandProfile>({
    business_name: "",
    industry: "",
    target_audience: "",
    products_services: "",
    brand_tone: "Kasbiy",
    main_cta: ""
  });

  useEffect(() => {
    fetchWithAuth("/api/brand-profile").then((data: BrandProfile | null) => {
      if (data) setProfile(data);
    }).finally(() => setLoading(false));
  }, [fetchWithAuth]);

  const handleSave = async () => {
    if (!profile.business_name || !profile.industry || !profile.target_audience || !profile.products_services || !profile.main_cta) {
      alert("Iltimos, barcha majburiy maydonlarni to'ldiring");
      return;
    }
    setSaving(true);
    try {
      await fetchWithAuth("/api/brand-profile", {
        method: "POST",
        body: JSON.stringify(profile)
      });
      haptic("medium");
      onBack();
    } catch {
      alert("Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="space-y-4 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" aria-label="Orqaga" className="w-8 h-8 rounded-full bg-secondary/50" onClick={() => { haptic("light"); onBack(); }}>
          <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
        </Button>
        <h2 className="text-lg font-bold">Mening Brendim</h2>
      </div>

      {loading ? (
        <div className="text-center py-10"><div className="w-8 h-8 rounded-full bg-primary/20 animate-pulse mx-auto" /></div>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground mb-4">
              Brendingiz haqidagi ma'lumotlarni kiriting. Bu ma'lumotlar AI agentingizga siz uchun mukammal moslashtirilgan kontent yaratishda yordam beradi.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="brand-business-name" className="text-[11px] font-bold text-foreground">Biznes nomi <span className="text-rose-500">*</span></label>
              <input id="brand-business-name" className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" placeholder="Masalan: Evos" value={profile.business_name || ""} onChange={e => setProfile({...profile, business_name: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="brand-industry" className="text-[11px] font-bold text-foreground">Soha (Industriya) <span className="text-rose-500">*</span></label>
              <input id="brand-industry" className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" placeholder="Masalan: Fast Food" value={profile.industry || ""} onChange={e => setProfile({...profile, industry: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="brand-target-audience" className="text-[11px] font-bold text-foreground">Maqsadli Auditoriya <span className="text-rose-500">*</span></label>
              <Textarea id="brand-target-audience" className="w-full text-sm p-2.5 rounded-xl border border-border bg-background resize-none h-16" placeholder="Kimlarga sotasiz? Yosh, qiziqishlari..." value={profile.target_audience || ""} onChange={e => setProfile({...profile, target_audience: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="brand-products-services" className="text-[11px] font-bold text-foreground">Mahsulot yoki Xizmatlar <span className="text-rose-500">*</span></label>
              <Textarea id="brand-products-services" className="w-full text-sm p-2.5 rounded-xl border border-border bg-background resize-none h-16" placeholder="Nimalar sotasiz?" value={profile.products_services || ""} onChange={e => setProfile({...profile, products_services: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="brand-main-cta" className="text-[11px] font-bold text-foreground">Asosiy Harakat (CTA) <span className="text-rose-500">*</span></label>
              <input id="brand-main-cta" className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" placeholder="Masalan: Hozir buyurtma bering" value={profile.main_cta || ""} onChange={e => setProfile({...profile, main_cta: e.target.value})} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="brand-tone" className="text-[11px] font-bold text-foreground">Brend ohangi (Tone)</label>
              <select id="brand-tone" className="w-full text-sm p-2.5 rounded-xl border border-border bg-background" value={profile.brand_tone || "Kasbiy"} onChange={e => setProfile({...profile, brand_tone: e.target.value})}>
                <option value="Do'stona">Do&apos;stona (Friendly)</option>
                <option value="Kasbiy">Kasbiy (Formal)</option>
                <option value="Energetik">Energetik (Energetic)</option>
                <option value="Hazilomuz">Hazilomuz (Humorous)</option>
              </select>
            </div>

            <Button className="w-full mt-4 h-11 bg-primary hover:bg-primary/90 text-white rounded-xl" onClick={handleSave} disabled={saving}>
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

export default BrandProfilePage;
