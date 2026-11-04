// Zones du bâtiment (US-53). Purement DESCRIPTIF : n'entre dans AUCUN calcul d'intensité.
// Seul bout de logique non trivial : somme multi-unités des superficies (réutilise toM2 de calc).

import { toM2 } from "./calc.ts";

export type Zone = {
  nom: string | null;
  superficie: number | null;
  unite: string | null;
};

/** Somme en m² des zones complètes (superficie non null + unité valide). Les lignes incomplètes sont ignorées. */
export function sommeSuperficieZonesM2(zones: Zone[]): number {
  let total = 0;
  for (const z of zones) {
    if (z.superficie === null || (z.unite !== "m2" && z.unite !== "pi2")) continue;
    total += toM2(z.superficie, z.unite);
  }
  return total;
}
