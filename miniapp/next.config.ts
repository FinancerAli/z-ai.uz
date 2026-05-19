import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  // Enable the analyzer report only when ANALYZE=true (e.g.
  // `ANALYZE=true npm run build`). In normal builds this is a no-op.
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Vercel deploy uchun
  output: undefined,
};

export default withBundleAnalyzer(nextConfig);
