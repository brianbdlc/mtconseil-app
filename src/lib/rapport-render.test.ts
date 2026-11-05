import { test } from "node:test";
import assert from "node:assert/strict";
import { donneesRender } from "./rapport-render.ts";
import {
  construireSnapshot,
  type DossierSnapshot,
  type EquipementSnapshot,
  type Snapshot,
} from "./rapport.ts";

const dossier: DossierSnapshot = {
  client: "ACME",
  adresse: "1 rue Test",
  superficie_valeur: 100,
  superficie_unite: "m2",
  annee_construction: 2000,
  usage: "bureau",
  gaz_quantite: null,
  gaz_unite: null,
  gaz_periode: null,
};
const modele = { methodologie: null, norme_ashrae: null, risques_sse: null, version: 1 };

test("Phase 13 : NOUVEAU snapshot → sommaire/mesures depuis le texte libre, boucle mesures vide", () => {
  const snap = construireSnapshot(dossier, [], {
    facteurGaz: null,
    totalFacturesKwh: null,
    textes: { sommaire: "Sommaire collé par l'ingénieur.", mesures_etudiees: "- Isolation : 4000 $/an" },
    modele,
  });
  const d = donneesRender(snap, "approuve");
  assert.equal(d.sommaire_texte, "Sommaire collé par l'ingénieur.");
  assert.equal(d.mesures_etudiees, "- Isolation : 4000 $/an");
  assert.equal(d.mesures.length, 0); // plus de mesures/ROI calculées
});

test("Phase 13 : ANCIEN snapshot (pré-Phase 13) → sommaire calculé + boucle mesures rendus à l'identique", () => {
  const base = construireSnapshot(dossier, [], {
    facteurGaz: null,
    totalFacturesKwh: null,
    textes: {},
    modele,
  });
  // Snapshot figé AVANT la Phase 13 : portait sommaire.texte + mesures[] (avec retour_annees).
  const ancien: Snapshot = {
    ...base,
    sommaire: { texte: "Ancien sommaire calculé par le code." },
    mesures: [
      {
        nom: "Remplacement éclairage",
        economies_annuelles: 4000,
        cout_investissement: 15000,
        subvention: 2000,
        net: 13000,
        retour_annees: 3.25,
      },
    ],
  };
  const d = donneesRender(ancien, "exporte");
  assert.equal(d.sommaire_texte, "Ancien sommaire calculé par le code.");
  assert.equal(d.mesures.length, 1);
  assert.equal(d.mesures[0].nom, "Remplacement éclairage");
  assert.equal(d.mesures[0].retour_annees, "3,25");
  assert.equal(d.mesures_etudiees, ""); // l'ancien n'a pas d'emplacement libre
});

test("Phase 14 : NOUVEAU snapshot → champs fiche Andalos + tags image présents", () => {
  const eq: EquipementSnapshot = {
    nom: "CTA-1",
    puissance_valeur: 10,
    puissance_unite: "kW",
    heures_par_an: 2000,
    facteur_charge: null,
    type_id: null,
    type: null,
    identifiant: "U-1",
    description: "Unité de toit",
    debit_pcm: 4500,
    air_frais_pct: 20,
    ventilateur: "VFD",
    refroidissement: "DX",
    chauffage: "Gaz",
    humidificateur: "Aucun",
    capacite_refroidissement_kw: 35,
    capacite_chauffage_kw: 50,
    efficacite_pct: 92,
    constat: "- Filtre encrassé",
    photo_unite_path: "d1/unite.jpg",
    photo_plaque_path: "d1/plaque.jpg",
  };
  const snap = construireSnapshot(dossier, [eq], { facteurGaz: null, totalFacturesKwh: null, textes: {}, modele });
  const e = donneesRender(snap, "approuve").equipements[0];
  assert.equal(e.identifiant, "U-1");
  assert.equal(e.description, "Unité de toit");
  assert.match(e.debit_pcm, /4.?500/); // fmt fr-CA : separateur de milliers
  assert.equal(e.ventilateur, "VFD");
  assert.equal(e.efficacite_pct, "92");
  assert.equal(e.constat, "- Filtre encrassé");
  assert.equal(e.photo_unite, "d1/unite.jpg");
  assert.equal(e.photo_plaque, "d1/plaque.jpg");
  assert.equal(e.a_photo_unite, true);
  assert.equal(e.a_photo_plaque, true);
});

test("Phase 15 : NOUVEAU snapshot → tableaux mensuels, tarifs, GES, intensité réelle, $/pi², degrés-jours, graphiques", () => {
  const factures = [
    { id: "e1", energie: "elec" as const, periode_debut: "2024-01-01", periode_fin: "2024-01-31", conso_valeur: 1000, conso_unite: "kWh", montant: 120, confirme: true },
    { id: "g1", energie: "gaz" as const, periode_debut: "2024-01-01", periode_fin: "2024-01-31", conso_valeur: 100, conso_unite: "m3", montant: 50, confirme: true },
  ];
  const snap = construireSnapshot(dossier, [], {
    facteurGaz: 10.33,
    totalFacturesKwh: 2033,
    textes: {},
    modele,
    factures,
    facteurGesElec: 0.0006,
    facteurGesGaz: 1.879,
    degresJours: [{ mois: "2024-01-01", valeur: 800 }],
    graphiqueDjElecPath: "d1/graphique_dj_elec.png",
    graphiqueDjGazPath: null,
  });
  const d = donneesRender(snap, "approuve");
  assert.equal(d.factures_mensuel_elec.length, 1);
  assert.equal(d.factures_mensuel_elec[0].mois, "2024-01-01");
  assert.match(d.factures_mensuel_elec[0].montant, /120/);
  assert.equal(d.factures_mensuel_gaz.length, 1);
  assert.notEqual(d.tarif_moyen_elec, "");
  assert.notEqual(d.ges_total, "");
  assert.notEqual(d.intensite_reelle, "—");
  assert.notEqual(d.cout_pi2, "—");
  assert.equal(d.degres_jours.length, 1);
  assert.equal(d.degres_jours[0].mois_dj, "2024-01-01");
  assert.equal(d.graphique_dj_elec, "d1/graphique_dj_elec.png");
  assert.equal(d.a_graphique_dj_elec, true);
  assert.equal(d.a_graphique_dj_gaz, false); // chemin null
});

test("Phase 15 : ANCIEN snapshot (sans factures_mensuel) → boucles vides, tarifs vides, zéro orphelin", () => {
  const base = construireSnapshot(dossier, [], { facteurGaz: null, totalFacturesKwh: null, textes: {}, modele });
  // Snapshot figé AVANT la Phase 15 : aucun champ facture mensuel / GES / graphiques.
  const sansPhase15 = { ...base } as Record<string, unknown>;
  delete sansPhase15.factures_mensuel;
  delete sansPhase15.tarif_moyen_elec;
  delete sansPhase15.tarif_moyen_gaz;
  delete sansPhase15.ges_total;
  delete sansPhase15.intensite_reelle;
  delete sansPhase15.cout_pi2;
  delete sansPhase15.degres_jours;
  delete sansPhase15.graphique_dj_elec_path;
  delete sansPhase15.graphique_dj_gaz_path;
  const d = donneesRender(sansPhase15 as unknown as Snapshot, "exporte");
  assert.equal(d.factures_mensuel_elec.length, 0);
  assert.equal(d.factures_mensuel_gaz.length, 0);
  assert.equal(d.tarif_moyen_elec, "");
  assert.equal(d.ges_total, "");
  assert.equal(d.intensite_reelle, "—");
  assert.equal(d.cout_pi2, "—");
  assert.equal(d.degres_jours.length, 0);
  assert.equal(d.graphique_dj_elec, "");
  assert.equal(d.a_graphique_dj_elec, false);
});

test("Phase 14 : ANCIEN snapshot (sans champs fiche ni photos) → chaînes vides, a_photo_*=false, zéro orphelin", () => {
  const base = construireSnapshot(dossier, [], { facteurGaz: null, totalFacturesKwh: null, textes: {}, modele });
  // Équipement figé AVANT la Phase 14 : seulement les champs pré-Phase-14.
  const ancien: Snapshot = {
    ...base,
    equipements: [
      { nom: "Vieux", puissance_valeur: 5, puissance_unite: "kW", conso: 1000, type_id: null, type_facteur_charge: null, type_poste: null },
    ] as Snapshot["equipements"],
  };
  const e = donneesRender(ancien, "exporte").equipements[0];
  assert.equal(e.identifiant, "");
  assert.equal(e.description, "");
  assert.equal(e.debit_pcm, "");
  assert.equal(e.ventilateur, "");
  assert.equal(e.constat, "");
  assert.equal(e.photo_unite, "");
  assert.equal(e.photo_plaque, "");
  assert.equal(e.a_photo_unite, false);
  assert.equal(e.a_photo_plaque, false);
});
