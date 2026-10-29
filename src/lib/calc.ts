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

// ─────────────────────── Phase 3 : superficie, gaz, bilan ───────────────────────

// Postes : codes sans accent en base (CHECK), libellés accentués à l'affichage.
export const POSTES: { code: string; label: string }[] = [
  { code: "chauffage", label: "Chauffage" },
  { code: "refroidissement", label: "Refroidissement" },
  { code: "ventilation", label: "Ventilation" },
  { code: "eclairage", label: "Éclairage" },
  { code: "eau_chaude", label: "Eau chaude" },
  { code: "procedes", label: "Procédés" },
  { code: "autre", label: "Autre" },
];

const POSTE_LABEL: Record<string, string> = Object.fromEntries(
  POSTES.map((p) => [p.code, p.label]),
);

export function libellePoste(code: string): string {
  return POSTE_LABEL[code] ?? code;
}

export type SuperficieUnite = "m2" | "pi2";

const PI2_EN_M2 = 0.09290304; // 1 pi² = 0.09290304 m²

/** Convertit une superficie en m². Codes sans accent ('m2'/'pi2'). Inconnue => throw. */
export function toM2(valeur: number, unite: string): number {
  if (unite === "m2") return valeur;
  if (unite === "pi2") return valeur * PI2_EN_M2;
  throw new Error(`Unité de superficie inconnue : ${unite}`);
}

/** Intensité kWh/m². null si superficie absente/≤0 ou unité manquante (jamais deviner). */
export function intensiteKwhM2(
  totalEquipementsKwh: number,
  superficieValeur: number | null,
  superficieUnite: string | null,
): number | null {
  if (superficieValeur === null || superficieValeur <= 0 || !superficieUnite) {
    return null;
  }
  return totalEquipementsKwh / toM2(superficieValeur, superficieUnite);
}

export type GazUnite = "m3" | "GJ" | "kWh";

const GJ_EN_KWH = 1000 / 3.6; // 1 GJ = 277.77… kWh

/** Quantité de gaz convertie en kWh. m³ sans facteur => null ; quantité absente => null ; inconnue => throw. */
export function gazEnKwh(p: {
  quantite: number | null;
  unite: string;
  facteurM3: number | null;
}): number | null {
  if (p.quantite === null) return null;
  if (p.unite === "kWh") return p.quantite;
  if (p.unite === "GJ") return p.quantite * GJ_EN_KWH;
  if (p.unite === "m3") return p.facteurM3 !== null ? p.quantite * p.facteurM3 : null;
  throw new Error(`Unité de gaz inconnue : ${p.unite}`);
}

/** Facteur effectif = surcharge si présente, sinon celui du type. null => facteur manquant. */
export function facteurEffectif(p: {
  typeId: string | null;
  facteurType: number | null;
  surcharge: number | null;
}): number | null {
  if (p.surcharge !== null) return p.surcharge;
  return p.facteurType;
}

/**
 * Normalise une surcharge saisie : une valeur égale au facteur du type (ou effacée) n'est PAS
 * une surcharge (on ne stocke rien). raisonRequise => il faut une raison SI l'équipement a un type.
 */
export function normaliserSurcharge(
  surcharge: number | null,
  facteurType: number | null,
): { facteurCharge: number | null; raisonRequise: boolean } {
  if (surcharge === null) return { facteurCharge: null, raisonRequise: false };
  if (facteurType !== null && surcharge === facteurType) {
    return { facteurCharge: null, raisonRequise: false };
  }
  return { facteurCharge: surcharge, raisonRequise: true };
}

/** Conso d'un équipement. null si une entrée manque (puissance, unité, heures, facteur). */
export function consoEquipement(p: {
  puissanceValeur: number | null;
  puissanceUnite: string | null;
  heuresParAn: number | null;
  facteurEffectif: number | null;
}): number | null {
  if (
    p.puissanceValeur === null ||
    !p.puissanceUnite ||
    p.heuresParAn === null ||
    p.facteurEffectif === null
  ) {
    return null;
  }
  return toKW(p.puissanceValeur, p.puissanceUnite) * p.heuresParAn * p.facteurEffectif;
}

export type LigneBilan = {
  poste: string | null; // null = hors catégorie
  conso: number | null;
  reposeSurValeurAConfirmer: boolean; // facteur venant d'un type confirme=false, SANS surcharge
  valide: boolean; // complétude (info seulement en Phase 3)
};

export type Bilan = {
  parPoste: { poste: string; kwh: number; pct: number; nbAConfirmer: number }[];
  horsCategorieKwh: number;
  totalEquipementsKwh: number; // somme de TOUTES les conso (toutes énergies)
  nbAConfirmerTotal: number;
  nbSansConso: number;
  nbHorsCategorie: number;
  nbNonValides: number;
};

/**
 * Source UNIQUE de la ligne de bilan d'un équipement (liste, fiche, export, bilan).
 * Prend l'équipement + son type joint (valeurs_defaut). reposeSurValeurAConfirmer = le facteur
 * effectif vient du TYPE (pas d'une surcharge) ET ce type n'est pas confirmé.
 */
export function ligneEquipement(e: {
  puissance_valeur: number | null;
  puissance_unite: string | null;
  heures_par_an: number | null;
  facteur_charge: number | null; // surcharge éventuelle
  type_id: string | null;
  type: { poste: string; confirme: boolean; facteur_charge: number | null } | null;
}): LigneBilan & { facteurEffectif: number | null } {
  const facteurType = e.type?.facteur_charge ?? null;
  const fe = facteurEffectif({ typeId: e.type_id, facteurType, surcharge: e.facteur_charge });
  const conso = consoEquipement({
    puissanceValeur: e.puissance_valeur,
    puissanceUnite: e.puissance_unite,
    heuresParAn: e.heures_par_an,
    facteurEffectif: fe,
  });
  return {
    poste: e.type?.poste ?? null,
    conso,
    reposeSurValeurAConfirmer:
      e.facteur_charge === null && e.type != null && facteurType !== null && e.type.confirme === false,
    valide: conso !== null,
    facteurEffectif: fe,
  };
}

/** Bilan par poste. Le hors-catégorie est EXCLU du détail mais compté au total. */
export function bilanEnergetique(lignes: LigneBilan[]): Bilan {
  const postes = new Map<string, { kwh: number; nbAConfirmer: number }>();
  let horsCategorieKwh = 0;
  let totalEquipementsKwh = 0;
  let nbAConfirmerTotal = 0;
  let nbSansConso = 0;
  let nbHorsCategorie = 0;
  let nbNonValides = 0;

  for (const l of lignes) {
    if (l.poste === null) nbHorsCategorie++;
    if (!l.valide) nbNonValides++;
    if (l.reposeSurValeurAConfirmer) nbAConfirmerTotal++;

    if (l.conso === null) {
      nbSansConso++;
      continue;
    }
    totalEquipementsKwh += l.conso;
    if (l.poste === null) {
      horsCategorieKwh += l.conso;
    } else {
      const e = postes.get(l.poste) ?? { kwh: 0, nbAConfirmer: 0 };
      e.kwh += l.conso;
      if (l.reposeSurValeurAConfirmer) e.nbAConfirmer++;
      postes.set(l.poste, e);
    }
  }

  const parPoste = [...postes.entries()].map(([poste, e]) => ({
    poste,
    kwh: e.kwh,
    pct: totalEquipementsKwh > 0 ? (e.kwh / totalEquipementsKwh) * 100 : 0,
    nbAConfirmer: e.nbAConfirmer,
  }));

  return {
    parPoste,
    horsCategorieKwh,
    totalEquipementsKwh,
    nbAConfirmerTotal,
    nbSansConso,
    nbHorsCategorie,
    nbNonValides,
  };
}
