import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App interne entièrement dynamique (auth + données par-utilisateur via cookies()).
  // On garde le rendu dynamique conventionnel : pas de cacheComponents/PPR.
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
