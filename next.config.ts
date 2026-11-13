import type { NextConfig } from "next";

// Cache Components is off on purpose: every page in this staff app is signed-in
// and must show current register data, so pages render per request
// (docs/PLAN.md §1). Turbopack's Tailwind loader is kept from the scaffold.
const nextConfig: NextConfig = {
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  // Generated in Node route handlers only (register exports).
  serverExternalPackages: ["exceljs"],
  // The registration PDFs read their fonts and logo from disk at runtime (Phase 10).
  outputFileTracingIncludes: {
    "/api/pdf/**": ["./src/server/pdf/fonts/*.ttf", "./src/server/pdf/assets/*"],
  },
  // Workbook import (Admin › Import) uploads the .xlsm (2.7 MB); Vercel allows 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
