import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App interne entièrement dynamique (auth + données par-utilisateur via cookies()).
  // On garde le rendu dynamique conventionnel : pas de cacheComponents/PPR.
  //
  // La route d'export lit le modèle .docx du filesystem (process.cwd()). Next ne trace pas
  // ce fichier tout seul → l'embarquer explicitement dans le bundle serveur, sinon l'export
  // 500 en prod (ENOENT). Swap du vrai modèle de Luis : même chemin, rien à changer ici.
  outputFileTracingIncludes: {
    "/dossiers/*/export": ["./src/templates/rapport-provisoire.docx"],
  },
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
