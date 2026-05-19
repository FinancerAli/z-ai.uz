"use client";

import { motion } from "framer-motion";
import { AdminTabs } from "@/components/zai/admin";

interface AdminPageProps {
  user: any;
  onBack: () => void;
  fetchWithAuth: (url: string, opts?: any) => Promise<any>;
  haptic: (t?: "light" | "medium" | "heavy") => void;
}

export function AdminPage({ user, onBack, fetchWithAuth, haptic }: AdminPageProps) {
  return (
    <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
      <AdminTabs user={user} onBack={onBack} fetchWithAuth={fetchWithAuth} haptic={haptic} />
    </motion.div>
  );
}

export default AdminPage;
