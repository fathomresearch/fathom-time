import type { NextConfig } from "next";

// The site is built as plain files (GitHub Pages serves them); data and
// sign-in come from Supabase in the browser.
const nextConfig: NextConfig = {
  output: "export",
  // /team/person/ → team/person/index.html, which GitHub Pages serves directly.
  trailingSlash: true,
  // No image server on GitHub Pages; the few images are small PNGs.
  images: { unoptimized: true },
  // Keeps the dev badge away from the sidebar's user area.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
