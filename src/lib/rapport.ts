// Gel du snapshot à la soumission (US-44). Le snapshot fige TOUT ce que le rapport affiche
// (bilan, intensité, gaz) + par équipement son type_id, facteur et poste figés — requis par
// approuver_dossier (A3) pour refuser l'approbation si une valeur par défaut a bougé.
// Zéro IA, zéro nombre inventé : tout vient de calc.ts. Phase 13 : le sommaire (calculé) et les
// mesures (ROI) sortent du snapshot — devenus des emplacements de texte libre (`textes.*`).

import {
  bilanEnergetique,
  gazEnKwh,
  intensiteKwhM2,
  ligneEquipement,
  type LigneBilan,
} from "./calc.ts";
import type { Zone } from "./zones.ts";
import { trierRevisions, type Revision } from "./revisions.ts";
import type { NarrativeSection } from "./statuts.ts";

// Phase 10 : distribution électrique — descriptif, AUCUNE logique (pas de fichier lib dédié).
export type DistributionEntree = { amperes: number | null; tension: number | null };

type TypeJoint = { poste: string; confirme: boolean; facteur_charge: number | null } | null;

export type EquipementSnapshot = {
  nom: string | null;
  puissance_valeur: number | null;
  puissance_unite: string | null;
  heures_par_an: number | null;
  facteur_charge: number | null;
  type_id: string | null;
  type: TypeJoint;
};

export type DossierSnapshot = {
  client: string;
  adresse: string | null;
  superficie_valeur: number | null;
  superficie_unite: string | null;
  annee_construction: number | null;
  usage: string | null;
  gaz_quantite: number | null;
  gaz_unite: string | null;
  gaz_periode: string | null;
};

export type ModeleSnapshot = {
  methodologie: string | null;
  norme_ashrae: string | null;
  risques_sse: string | null;
  version: number;
};

export function construireSnapshot(
  dossier: DossierSnapshot,
  equipements: EquipementSnapshot[],
  parametres: {
    facteurGaz: number | null;
    totalFacturesKwh: number | null;
    textes: Partial<Record<NarrativeSection, string>>; // seulement les sections valide=true
    modele: ModeleSnapshot;
    zones?: Zone[]; // Phase 9 : descriptif, hors calcul
    distribution?: DistributionEntree[]; // Phase 10 : descriptif, hors calcul
    revisions?: Revision[]; // Phase 11 : descriptif, hors calcul
    optima?: { path: string; sha256: string }; // Phase 12 : annexe PDF figée telle quelle, hors calcul
  },
) {
  const bilan = bilanEnergetique(equipements.map((e) => ligneEquipement(e)) as LigneBilan[]);
  const gazKwh =
    dossier.gaz_quantite !== null && dossier.gaz_unite
      ? gazEnKwh({ quantite: dossier.gaz_quantite, unite: dossier.gaz_unite, facteurM3: parametres.facteurGaz })
      : null;
  const intensite = intensiteKwhM2(
    bilan.totalEquipementsKwh,
    dossier.superficie_valeur,
    dossier.superficie_unite,
  );

  return {
    dossier: {
      client: dossier.client,
      adresse: dossier.adresse,
      superficie_valeur: dossier.superficie_valeur,
      superficie_unite: dossier.superficie_unite,
      annee_construction: dossier.annee_construction,
      usage: dossier.usage,
      gaz_quantite: dossier.gaz_quantite,
      gaz_unite: dossier.gaz_unite,
      gaz_periode: dossier.gaz_periode,
    },
    bilan,
    intensite,
    gazKwh,
    totalFacturesKwh: parametres.totalFacturesKwh, // gelé pour la cohérence du rapport figé (Phase 6)
    equipements: equipements.map((e) => ({
      nom: e.nom,
      puissance_valeur: e.puissance_valeur,
      puissance_unite: e.puissance_unite,
      conso: ligneEquipement(e).conso,
      type_id: e.type_id,
      type_facteur_charge: e.type?.facteur_charge ?? null,
      type_poste: e.type?.poste ?? null,
    })),
    // Phase 7 : sections narratives VALIDÉES + textes fixes du modèle GELÉS + leur n° de version
    // (porté sur rapport_versions à l'export). Phase 13 : sommaire/mesures sont dans `textes.*`.
    textes: parametres.textes,
    // Phase 9 : zones DESCRIPTIVES figées (hors calcul — l'intensité reste basée sur la superficie totale).
    zones: (parametres.zones ?? []).map((z) => ({
      nom: z.nom,
      superficie: z.superficie,
      unite: z.unite,
    })),
    // Phase 10 : distribution électrique DESCRIPTIVE figée (hors calcul — saisie ingénieur pure).
    distribution: (parametres.distribution ?? []).map((d) => ({
      amperes: d.amperes,
      tension: d.tension,
    })),
    // Phase 11 : registre des révisions DESCRIPTIF figé, trié (hors calcul — saisie ingénieur pure).
    revisions: trierRevisions(parametres.revisions ?? []).map((r) => ({
      numero: r.numero,
      date: r.date,
      description: r.description,
      ordre: r.ordre,
    })),
    modele: {
      methodologie: parametres.modele.methodologie,
      norme_ashrae: parametres.modele.norme_ashrae,
      risques_sse: parametres.modele.risques_sse,
    },
    modele_version: parametres.modele.version,
    // Phase 12 : annexe Optima figée telle quelle (hors calcul). `?? null` : rétrocompat des
    // snapshots gelés AVANT la Phase 12. Fusionnée au PDF final à l'export (route export).
    optima: parametres.optima ?? null,
  };
}

// Champs LEGACY optionnels : lecture seule des snapshots gelés AVANT la Phase 13 (sommaire calculé
// + mesures/ROI). Les nouveaux snapshots ne les écrivent plus (→ undefined) ; l'export les lit en repli.
export type Snapshot = ReturnType<typeof construireSnapshot> & {
  sommaire?: { texte: string; lignesResume?: { label: string; valeur: string }[] };
  mesures?: {
    nom: string | null;
    economies_annuelles: number | null;
    cout_investissement: number | null;
    subvention: number | null;
    net: number | null;
    retour_annees: number | null;
  }[];
};
