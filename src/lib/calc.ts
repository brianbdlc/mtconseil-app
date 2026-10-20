// Règle fondatrice : LE CODE calcule. L'IA ne produit aucune valeur numérique.
// L'unité d'origine est conservée en base ; on convertit ICI avant tout calcul.

export type Unite = "kW" | "HP" | "BTU/h";

export const UNITES: Unite[] = ["kW", "HP", "BTU/h"];

// Facteurs de conversion vers le kW.
const FACTEUR_KW: Record<Unite, number> = {
  kW: 1,
  HP: 0.7457, // 1 HP (mécanique) = 0.7457 kW
  "BTU/h": 0.00029307107, // 1 BTU/h = 0.00029307107 kW
};

/** Convertit une puissance en kW. Unité inconnue => throw (jamais deviner). */
export function toKW(valeur: number, unite: string): number {
  const f = FACTEUR_KW[unite as Unite];
  if (f === undefined) {
    throw new Error(`Unité de puissance inconnue : ${unite}`);
  }
  return valeur * f;
}

/** Consommation annuelle (kWh/an) = puissance(kW) × heures/an × facteur de charge. */
export function consoAnnuelleKwh(params: {
  puissanceValeur: number;
  puissanceUnite: string;
  heuresParAn: number;
  facteurCharge: number;
}): number {
  const { puissanceValeur, puissanceUnite, heuresParAn, facteurCharge } =
    params;
  return toKW(puissanceValeur, puissanceUnite) * heuresParAn * facteurCharge;
}
