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

// Tarif $/unité : garder les décimales (ex. 0,0987 $/kWh).
const fmtTarif = (n: number | null | undefined) =>
  n === null || n === undefined
    ? ""
    : new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 4 }).format(n);

export function donneesRender(snapshot: Snapshot, statut: string) {
  const textesLegacy = snapshot.textes as Record<string, string | undefined>;
  // Phase 15 : `?? ` → rétrocompat des snapshots gelés AVANT la Phase 15 (tableaux/tarifs/GES absents).
  const fmEmpty = { lignes: [], total_conso: null, total_montant: null, total_ges: null, tarif_moyen: null };
  const fm = snapshot.factures_mensuel ?? { elec: fmEmpty, gaz: fmEmpty };
  const ligneMois = (l: {
    mois: string | null;
    conso: number | null;
    montant: number | null;
    tarif: number | null;
    ges: number | null;
  }) => ({
    mois: l.mois ?? "",
    conso: fmt(l.conso),
    montant: fmt(l.montant),
    tarif: fmtTarif(l.tarif),
    ges: fmt(l.ges),
  });
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
    // Phase 15 : tableaux mensuels (une ligne/facture) + lignes totaux + tarifs moyens + GES + intensité
    // réelle + $/pi² + degrés-jours + graphiques collés. `?? ` partout → zéro orphelin sur ancien snapshot.
    factures_mensuel_elec: fm.elec.lignes.map(ligneMois),
    factures_mensuel_gaz: fm.gaz.lignes.map(ligneMois),
    total_conso_elec: fmt(fm.elec.total_conso),
    total_montant_elec: fmt(fm.elec.total_montant),
    total_ges_elec: fmt(fm.elec.total_ges),
    total_conso_gaz: fmt(fm.gaz.total_conso),
    total_montant_gaz: fmt(fm.gaz.total_montant),
    total_ges_gaz: fmt(fm.gaz.total_ges),
    tarif_moyen_elec: fmtTarif(snapshot.tarif_moyen_elec),
    tarif_moyen_gaz: fmtTarif(snapshot.tarif_moyen_gaz),
    ges_total: fmt(snapshot.ges_total),
    intensite_reelle: snapshot.intensite_reelle != null ? fmt(snapshot.intensite_reelle) : "—",
    cout_pi2: snapshot.cout_pi2 != null ? fmtTarif(snapshot.cout_pi2) : "—",
    degres_jours: (snapshot.degres_jours ?? []).map((d) => ({
      mois_dj: d.mois ?? "",
      valeur_dj: fmt(d.valeur),
    })),
    // Tags image : la valeur EST le chemin Storage (résolu à l'export) ; booléen pour section conditionnelle.
    graphique_dj_elec: snapshot.graphique_dj_elec_path ?? "",
    graphique_dj_gaz: snapshot.graphique_dj_gaz_path ?? "",
    a_graphique_dj_elec: !!snapshot.graphique_dj_elec_path,
    a_graphique_dj_gaz: !!snapshot.graphique_dj_gaz_path,
  };
}
