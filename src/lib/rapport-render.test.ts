import { test } from "node:test";
import assert from "node:assert/strict";
import { donneesRender } from "./rapport-render.ts";
import { construireSnapshot, type DossierSnapshot, type Snapshot } from "./rapport.ts";

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
