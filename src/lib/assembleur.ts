// Règle fondatrice (4e acteur, l'assembleur) : LE CODE vérifie avant transmission à Luis.
// Complétude (bloquant), cohérence estimé vs factures (Phase 6), sommaire exécutif — zéro IA.
// Réutilise ligneEquipement/types de calc.ts et verifierPlausibilite de photos.ts.

import {
  ligneEquipement,
  libellePoste,
  type Bilan,
  type LigneBilan,
} from "./calc.ts";
import { verifierPlausibilite } from "./photos.ts";

// Bornes de plausibilité (non bloquantes). Boutons de calibration — ajuster si les lots réels
// signalent des valeurs légitimes hors plage.
const HEURES_MAX = 8760; // heures dans une année
const FACTEUR_MIN = 0;
const FACTEUR_MAX = 1;

const CHAMPS_IA = [
  { champ: "marque", label: "marque", confiance: "marque_confiance", validated: "marque_validated" },
  { champ: "modele", label: "modèle", confiance: "modele_confiance", validated: "modele_validated" },
  { champ: "puissance", label: "puissance", confiance: "puissance_confiance", validated: "puissance_validated" },
  { champ: "annee", label: "année", confiance: "annee_confiance", validated: "annee_validated" },
] as const;

export type EquipementAssembleur = {
  id: string;
  nom: string | null;
  puissance_valeur: number | null;
  puissance_unite: string | null;
  heures_par_an: number | null;
  facteur_charge: number | null; // surcharge éventuelle
  type_id: string | null;
  type: { poste: string; confirme: boolean; facteur_charge: number | null } | null;
  marque_confiance: string | null;
  marque_validated: boolean;
  modele_confiance: string | null;
  modele_validated: boolean;
  puissance_confiance: string | null;
  puissance_validated: boolean;
  annee_confiance: string | null;
  annee_validated: boolean;
};

export type ProblemeEquipement = {
  equipementId: string;
  nom: string | null;
  messages: string[];
};

export type Avertissement = {
  equipementId: string;
  nom: string | null;
  message: string;
};

export type Completude = {
  bloquant: boolean;
  problemes: ProblemeEquipement[];
  superficieAbsente: boolean;
  optimaNonConfirme: boolean;
  nbManuels: number;
  avertissements: Avertissement[];
};

/** Contrôle de complétude (US-35/36). Bloque si problèmes[], superficie absente ou Optima non confirmé. */
export function controleCompletude(
  equipements: EquipementAssembleur[],
  dossier: { superficie_valeur: number | null; superficie_unite: string | null; optima_confirme: boolean },
): Completude {
  const problemes: ProblemeEquipement[] = [];
  const avertissements: Avertissement[] = [];
  let nbManuels = 0;

  for (const e of equipements) {
    const messages: string[] = [];

    // Règle 1 : champ IA lu (confiance non nulle) mais pas encore validé par l'ingénieur.
    // confiance nulle = saisi main = rien à valider.
    for (const c of CHAMPS_IA) {
      if (e[c.confiance] !== null && e[c.validated] === false) {
        messages.push(`${c.label} lue par l'IA mais non validée`);
      }
    }

    // Règle 2 : données de calcul manquantes.
    const l = ligneEquipement(e);
    if (e.type_id === null) {
      messages.push("sans type (hors catégorie)");
    }
    if (l.conso === null) {
      const manquants: string[] = [];
      if (e.puissance_valeur === null || !e.puissance_unite) manquants.push("puissance");
      if (e.heures_par_an === null) manquants.push("heures/an");
      if (l.facteurEffectif === null) manquants.push("facteur de charge");
      messages.push(`conso non calculable (${manquants.join(", ")} manquant·s)`);
    }

    if (messages.length > 0) {
      problemes.push({ equipementId: e.id, nom: e.nom, messages });
    }

    // Équipement entièrement saisi à la main = aucune lecture IA.
    const aucuneLectureIA = CHAMPS_IA.every((c) => e[c.confiance] === null);
    if (aucuneLectureIA) nbManuels++;

    // Avertissements (non bloquants) : valeurs manuelles hors plages plausibles.
    if (e.puissance_valeur !== null && !verifierPlausibilite({ champ: "puissance", valeur: e.puissance_valeur }).ok) {
      avertissements.push({ equipementId: e.id, nom: e.nom, message: `puissance suspecte (${e.puissance_valeur})` });
    }
    if (e.heures_par_an !== null && (e.heures_par_an <= 0 || e.heures_par_an > HEURES_MAX)) {
      avertissements.push({ equipementId: e.id, nom: e.nom, message: `heures/an hors plage (${e.heures_par_an})` });
    }
    if (e.facteur_charge !== null && (e.facteur_charge <= FACTEUR_MIN || e.facteur_charge > FACTEUR_MAX)) {
      avertissements.push({ equipementId: e.id, nom: e.nom, message: `facteur de charge hors (0, 1] (${e.facteur_charge})` });
    }
  }

  // Règle 3 (niveau dossier) : superficie du bâtiment absente.
  const superficieAbsente = dossier.superficie_valeur === null || !dossier.superficie_unite;

  // Règle 4 (Phase 12, US-51) : rapport Optima obligatoire et confirmé pour CHAQUE audit.
  const optimaNonConfirme = !dossier.optima_confirme;

  return {
    bloquant: problemes.length > 0 || superficieAbsente || optimaNonConfirme,
    problemes,
    superficieAbsente,
    optimaNonConfirme,
    nbManuels,
    avertissements,
  };
}

export type Coherence = {
  disponible: boolean;
  ecartPct?: number;
  depasse?: boolean;
};

/**
 * Cohérence conso estimée vs factures (US-37). Branchée en Phase 6 (table factures) ; sans
 * factures → non disponible. Comparaison toutes énergies vs factures élec+gaz.
 */
export function controleCoherence(
  totalEquipementsKwh: number,
  totalFacturesKwh: number | null,
  seuilPct: number,
): Coherence {
  if (totalFacturesKwh === null) return { disponible: false };
  if (totalFacturesKwh === 0) {
    // Pas de division par zéro : factures nulles mais estimation > 0 = écart maximal.
    const depasse = totalEquipementsKwh > 0;
    return { disponible: true, ecartPct: depasse ? Infinity : 0, depasse };
  }
  const ecartPct = (Math.abs(totalEquipementsKwh - totalFacturesKwh) / totalFacturesKwh) * 100;
  return { disponible: true, ecartPct, depasse: ecartPct > seuilPct };
}

const nf = (max = 0) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: max });

export type Sommaire = {
  texte: string;
  lignesResume: { label: string; valeur: string }[];
};

/**
 * Sommaire exécutif + tableau résumé (PRD : « rempli par le code »). Aucun nombre inventé —
 * tout vient de bilan/calc. Phrase française déterministe.
 */
export function sommaireExecutif(input: {
  dossier: {
    usage: string | null;
    annee_construction: number | null;
    superficie_valeur: number | null;
    superficie_unite: string | null;
  };
  bilan: Bilan;
  intensite: number | null;
  gazKwh: number | null;
}): Sommaire {
  const { dossier, bilan, intensite, gazKwh } = input;

  const dominant = bilan.parPoste.reduce<{ poste: string; kwh: number; pct: number } | null>(
    (max, p) => (max === null || p.kwh > max.kwh ? p : max),
    null,
  );

  const superficieLabel =
    dossier.superficie_valeur !== null && dossier.superficie_unite
      ? `${nf(0).format(dossier.superficie_valeur)} ${dossier.superficie_unite === "pi2" ? "pi²" : "m²"}`
      : "—";

  const parties: string[] = ["Ce bâtiment"];
  if (dossier.usage) parties.push(`à usage de ${dossier.usage}`);
  if (dossier.annee_construction !== null) parties.push(`construit en ${dossier.annee_construction}`);
  if (dossier.superficie_valeur !== null && dossier.superficie_unite) {
    parties.push(`d'une superficie de ${superficieLabel}`);
  }
  let texte = parties.join(", ");
  if (bilan.totalEquipementsKwh > 0) {
    texte += ` présente une consommation totale estimée de ${nf(0).format(bilan.totalEquipementsKwh)} kWh/an`;
    if (intensite !== null) texte += `, soit une intensité de ${nf(1).format(intensite)} kWh/m²`;
    texte += ".";
    if (dominant) {
      texte += ` Le poste dominant est ${libellePoste(dominant.poste)} (${Math.round(dominant.pct)} %).`;
    }
  } else {
    texte += " ne présente aucune consommation estimée (données équipements incomplètes).";
  }

  const lignesResume: { label: string; valeur: string }[] = [
    { label: "Superficie", valeur: superficieLabel },
    { label: "Usage", valeur: dossier.usage ?? "—" },
    { label: "Année de construction", valeur: dossier.annee_construction !== null ? String(dossier.annee_construction) : "—" },
    { label: "Consommation totale estimée", valeur: `${nf(0).format(bilan.totalEquipementsKwh)} kWh/an` },
    { label: "Intensité énergétique", valeur: intensite !== null ? `${nf(1).format(intensite)} kWh/m²` : "—" },
    { label: "Poste dominant", valeur: dominant ? `${libellePoste(dominant.poste)} (${Math.round(dominant.pct)} %)` : "—" },
    { label: "Gaz saisi (équivalent)", valeur: gazKwh !== null ? `${nf(0).format(gazKwh)} kWh` : "—" },
  ];

  return { texte, lignesResume };
}

// Réexport pour les appelants (page, export) qui construisent les lignes de bilan.
export type { LigneBilan };
