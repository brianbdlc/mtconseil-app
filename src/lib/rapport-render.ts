// Construit l'objet de rendu docxtemplater depuis le snapshot gelé. Fonction PURE, isolée de la
// route (qui porte les imports server-only) pour rester unit-testable. Rétrocompat Phase 13 : lit
// le texte libre (sommaire/mesures_etudiees), sinon l'ancien champ calculé (snapshots pré-Phase 13).

import { libellePoste } from "./calc.ts";
import { sommeSuperficieZonesM2 } from "./zones.ts";
import type { Snapshot } from "./rapport.ts";

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined
    ? ""
    : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);

export function donneesRender(snapshot: Snapshot, statut: string) {
  const textesLegacy = snapshot.textes as Record<string, string | undefined>;
  return {
    client: snapshot.dossier.client,
    adresse: snapshot.dossier.adresse ?? "",
    statut,
    // Phase 13 : sommaire = texte libre ; repli sur l'ancien sommaire calculé (snapshots pré-Phase 13).
    sommaire_texte: snapshot.textes.sommaire ?? snapshot.sommaire?.texte ?? "",
    intensite: snapshot.intensite !== null ? fmt(snapshot.intensite) : "—",
    total_kwh: fmt(snapshot.bilan.totalEquipementsKwh),
    gaz_kwh: snapshot.gazKwh !== null ? fmt(snapshot.gazKwh) : "—",
    bilan_postes: snapshot.bilan.parPoste.map((p) => ({
      poste: libellePoste(p.poste),
      kwh: fmt(p.kwh),
      pct: Math.round(p.pct),
    })),
    equipements: snapshot.equipements.map((e) => ({
      nom: e.nom ?? "",
      puissance_valeur: e.puissance_valeur ?? "",
      puissance_unite: e.puissance_unite ?? "",
      conso_kwh_an: fmt(e.conso),
      // Phase 14 : champs fiche Andalos. `?? ""` / fmt → rétrocompat (ancien snapshot = vides, zéro orphelin).
      identifiant: e.identifiant ?? "",
      description: e.description ?? "",
      debit_pcm: fmt(e.debit_pcm),
      air_frais_pct: fmt(e.air_frais_pct),
      ventilateur: e.ventilateur ?? "",
      refroidissement: e.refroidissement ?? "",
      chauffage: e.chauffage ?? "",
      humidificateur: e.humidificateur ?? "",
      capacite_refroidissement_kw: fmt(e.capacite_refroidissement_kw),
      capacite_chauffage_kw: fmt(e.capacite_chauffage_kw),
      efficacite_pct: fmt(e.efficacite_pct),
      constat: e.constat ?? "",
      // Tags image : la valeur EST le chemin Storage (résolu par le module image à l'export) ;
      // booléen pour la section conditionnelle. Chemin absent → section absente, aucune image.
      photo_unite: e.photo_unite_path ?? "",
      photo_plaque: e.photo_plaque_path ?? "",
      a_photo_unite: !!e.photo_unite_path,
      a_photo_plaque: !!e.photo_plaque_path,
    })),
    // Phase 13 : boucle mesures/ROI conservée pour les ANCIENS snapshots seulement (`?? []` → boucle
    // vide pour les nouveaux). Les nouveaux rapports utilisent l'emplacement libre `mesures_etudiees`.
    mesures: (snapshot.mesures ?? []).map((m) => ({
      nom: m.nom ?? "",
      economies_annuelles: fmt(m.economies_annuelles),
      cout_investissement: fmt(m.cout_investissement),
      subvention: fmt(m.subvention),
      retour_annees:
        m.retour_annees === null
          ? "—"
          : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(m.retour_annees),
    })),
    // Phase 9 : zones descriptives (hors calcul) + total informatif.
    zones: snapshot.zones.map((z) => ({
      nom_zone: z.nom ?? "",
      superficie_zone: fmt(z.superficie),
      unite_zone: z.unite === "pi2" ? "pi²" : z.unite === "m2" ? "m²" : "",
    })),
    zones_total_m2: fmt(sommeSuperficieZonesM2(snapshot.zones)),
    // Phase 10 : distribution électrique descriptive + compteur d'entrées dérivé des lignes.
    // `?? []` : rétrocompat des snapshots gelés AVANT la Phase 10 (sans champ distribution).
    distribution: (snapshot.distribution ?? []).map((d) => ({
      amperes: fmt(d.amperes),
      tension: fmt(d.tension),
    })),
    distribution_nb_entrees: (snapshot.distribution ?? []).length,
    // Phase 11 : registre des révisions. `?? []` : rétrocompat des snapshots gelés AVANT Phase 11.
    revisions: (snapshot.revisions ?? []).map((r) => ({
      numero_rev: r.numero ?? "",
      date_rev: r.date ?? "",
      description_rev: r.description ?? "",
    })),
    description_installations: snapshot.textes.description_installations ?? "",
    // Phase 13 : nouveaux emplacements libres.
    humidification_controles: snapshot.textes.humidification_controles ?? "",
    electricite: snapshot.textes.electricite ?? "",
    mesures_etudiees: snapshot.textes.mesures_etudiees ?? "",
    mesures_mise_en_forme: textesLegacy.mesures_mise_en_forme ?? "", // legacy (hors UI, rétrocompat)
    problemes_techniques: snapshot.textes.problemes_techniques ?? "",
    phasage_travaux: snapshot.textes.phasage_travaux ?? "",
    risques_sse: snapshot.textes.risques_sse ?? "",
    conclusions: snapshot.textes.conclusions ?? "",
    methodologie: snapshot.modele.methodologie ?? "",
    norme_ashrae: snapshot.modele.norme_ashrae ?? "",
    modele_risques_sse: snapshot.modele.risques_sse ?? "",
    modele_version: snapshot.modele_version,
  };
}
