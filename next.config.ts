import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the dev badge away from the sidebar's user area.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
