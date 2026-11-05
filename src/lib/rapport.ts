// Gel du snapshot à la soumission (US-44). Le snapshot fige TOUT ce que le rapport affiche
// (bilan, intensité, gaz, sommaire) + par équipement son type_id, facteur et poste figés —
// requis par approuver_dossier (A3) pour refuser l'approbation si une valeur par défaut a bougé.
// Zéro IA, zéro nombre inventé : tout vient de calc.ts / assembleur.ts.

import {
  bilanEnergetique,
  gazEnKwh,
  intensiteKwhM2,
  ligneEquipement,
  type LigneBilan,
} from "./calc.ts";
import { sommaireExecutif } from "./assembleur.ts";
import { retourAnnees, investissementNet, type Mesure } from "./mesures.ts";
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
    mesures: Mesure[];
    textes: Partial<Record<NarrativeSection, string>>; // seulement les sections valide=true
    modele: ModeleSnapshot;
    zones?: Zone[]; // Phase 9 : descriptif, hors calcul
    distribution?: DistributionEntree[]; // Phase 10 : descriptif, hors calcul
    revisions?: Revision[]; // Phase 11 : descriptif, hors calcul
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
  const sommaire = sommaireExecutif({ dossier, bilan, intensite, gazKwh });

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
    sommaire,
    equipements: equipements.map((e) => ({
      nom: e.nom,
      puissance_valeur: e.puissance_valeur,
      puissance_unite: e.puissance_unite,
      conso: ligneEquipement(e).conso,
      type_id: e.type_id,
      type_facteur_charge: e.type?.facteur_charge ?? null,
      type_poste: e.type?.poste ?? null,
    })),
    // Phase 7 : ROI calculé par le CODE (zéro valeur inventée), sections narratives VALIDÉES,
    // textes fixes du modèle GELÉS + leur n° de version (porté sur rapport_versions à l'export).
    mesures: parametres.mesures.map((m) => ({
      nom: m.nom,
      economies_annuelles: m.economies_annuelles,
      cout_investissement: m.cout_investissement,
      subvention: m.subvention,
      net: investissementNet(m),
      retour_annees: retourAnnees(m),
    })),
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
  };
}

export type Snapshot = ReturnType<typeof construireSnapshot>;
