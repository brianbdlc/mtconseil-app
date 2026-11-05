import { test } from "node:test";
import assert from "node:assert/strict";
import { construireSnapshot, type EquipementSnapshot, type DossierSnapshot } from "./rapport.ts";

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

// Params Phase 7 par défaut (vides) — les tests ciblent le gel équipements/bilan.
const extra = {
  facteurGaz: null,
  totalFacturesKwh: null,
  mesures: [],
  textes: {},
  modele: { methodologie: null, norme_ashrae: null, risques_sse: null, version: 1 },
};

function eq(facteur: number): EquipementSnapshot {
  return {
    nom: "Chaudière",
    puissance_valeur: 10,
    puissance_unite: "kW",
    heures_par_an: 1000,
    facteur_charge: null,
    type_id: "t1",
    type: { poste: "chauffage", confirme: false, facteur_charge: facteur },
  };
}

test("le snapshot fige conso + type (facteur/poste) par équipement", () => {
  const snap = construireSnapshot(dossier, [eq(0.5)], extra);
  assert.equal(snap.equipements[0].conso, 10 * 1000 * 0.5);
  assert.equal(snap.equipements[0].type_facteur_charge, 0.5);
  assert.equal(snap.equipements[0].type_poste, "chauffage");
  assert.equal(snap.bilan.totalEquipementsKwh, 5000);
});

test("Phase 9 : les zones sont descriptives — l'intensité est inchangée (zones vides vs peuplées)", () => {
  const sansZones = construireSnapshot(dossier, [eq(0.5)], { ...extra, zones: [] });
  const avecZones = construireSnapshot(dossier, [eq(0.5)], {
    ...extra,
    zones: [
      { nom: "RDC", superficie: 60, unite: "m2" },
      { nom: "Étage", superficie: 400, unite: "pi2" },
    ],
  });
  assert.equal(avecZones.intensite, sansZones.intensite);
  assert.equal(avecZones.bilan.totalEquipementsKwh, sansZones.bilan.totalEquipementsKwh);
  assert.equal(avecZones.zones.length, 2);
});

test("Phase 10 : la distribution électrique est descriptive — figée telle quelle, hors calcul", () => {
  const sans = construireSnapshot(dossier, [eq(0.5)], { ...extra, distribution: [] });
  const avec = construireSnapshot(dossier, [eq(0.5)], {
    ...extra,
    distribution: [
      { amperes: 200, tension: 347 },
      { amperes: 100, tension: 120 },
    ],
  });
  assert.equal(avec.intensite, sans.intensite);
  assert.equal(avec.bilan.totalEquipementsKwh, sans.bilan.totalEquipementsKwh);
  assert.deepEqual(avec.distribution, [
    { amperes: 200, tension: 347 },
    { amperes: 100, tension: 120 },
  ]);
});

test("un changement ultérieur d'un équipement ne modifie pas le snapshot sérialisé (gel)", () => {
  const equipements = [eq(0.5)];
  const fige = JSON.stringify(construireSnapshot(dossier, equipements, extra));
  // L'équipement vivant change APRÈS le gel : le snapshot déjà sérialisé reste identique.
  equipements[0].type!.facteur_charge = 0.9;
  equipements[0].puissance_valeur = 999;
  assert.equal(fige, JSON.stringify(JSON.parse(fige)));
  // Et un nouveau snapshot refléterait bien le changement (preuve que le gel vient de la sérialisation).
  const apres = construireSnapshot(dossier, equipements, extra);
  assert.notEqual(JSON.stringify(apres), fige);
});
