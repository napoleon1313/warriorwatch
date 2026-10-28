import type { NextConfig } from "next";

// Static export: every page is prebuilt HTML served from Cloudflare Pages' CDN.
// Live numbers are fetched client-side from NEXT_PUBLIC_API_BASE (or the
// in-browser mock when it is unset). The only server code is the OG image
// Pages Function in ./functions, which lives outside Next. See README.md.
const config: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ["@warriorwatch/contract"],
  poweredByHeader: false,
};

export default config;
