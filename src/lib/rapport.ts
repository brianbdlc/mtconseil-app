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

export function construireSnapshot(
  dossier: DossierSnapshot,
  equipements: EquipementSnapshot[],
  parametres: { facteurGaz: number | null },
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
  };
}

export type Snapshot = ReturnType<typeof construireSnapshot>;
