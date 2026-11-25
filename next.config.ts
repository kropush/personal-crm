import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CRM_E2E === "1" ? ".next/e2e" : ".next",
  // The Docker image runs .next/standalone/server.js without node_modules.
  // Only the image build asks for it: locally `pnpm start` runs `next start`,
  // which does not support standalone output
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
