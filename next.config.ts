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
};

export default nextConfig;
