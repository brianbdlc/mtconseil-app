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
