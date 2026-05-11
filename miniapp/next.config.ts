import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Vercel deploy uchun
  output: undefined,
};

export default nextConfig;
