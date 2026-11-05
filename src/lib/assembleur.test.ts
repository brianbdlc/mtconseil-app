import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controleCompletude,
  controleCoherence,
  type EquipementAssembleur,
} from "./assembleur.ts";

// Équipement complet et sain (0 problème) : type, puissance/heures/facteur présents, aucune
// lecture IA en attente.
function eqComplet(over: Partial<EquipementAssembleur> = {}): EquipementAssembleur {
  return {
    id: "e1",
    nom: "Chaudière",
    puissance_valeur: 10,
    puissance_unite: "kW",
    heures_par_an: 2000,
    facteur_charge: 0.8,
    type_id: "t1",
    type: { poste: "chauffage", confirme: true, facteur_charge: 0.8 },
    marque_confiance: null,
    marque_validated: false,
    modele_confiance: null,
    modele_validated: false,
    puissance_confiance: null,
    puissance_validated: false,
    annee_confiance: null,
    annee_validated: false,
    ...over,
  };
}

const dossierOk = { superficie_valeur: 100, superficie_unite: "m2" };

test("controleCompletude : cas complet => non bloquant, 0 problème, 1 manuel", () => {
  const r = controleCompletude([eqComplet()], dossierOk);
  assert.equal(r.bloquant, false);
  assert.equal(r.problemes.length, 0);
  assert.equal(r.superficieAbsente, false);
  assert.equal(r.nbManuels, 1); // aucune confiance => saisi main
  assert.equal(r.avertissements.length, 0);
});

test("règle 1 : champ IA lu mais non validé => bloquant", () => {
  const r = controleCompletude(
    [eqComplet({ marque_confiance: "lisible", marque_validated: false })],
    dossierOk,
  );
  assert.equal(r.bloquant, true);
  assert.equal(r.problemes[0].messages.some((m) => m.includes("marque")), true);
  assert.equal(r.nbManuels, 0); // une confiance non nulle => plus "tout manuel"
});

test("règle 1 : champ IA validé => pas de problème", () => {
  const r = controleCompletude(
    [eqComplet({ marque_confiance: "lisible", marque_validated: true })],
    dossierOk,
  );
  assert.equal(r.bloquant, false);
});

test("règle 2 : sans type => problème hors catégorie", () => {
  const r = controleCompletude([eqComplet({ type_id: null, type: null })], dossierOk);
  assert.equal(r.bloquant, true);
  assert.equal(r.problemes[0].messages.some((m) => m.includes("sans type")), true);
});

test("règle 2 : conso non calculable précise l'entrée manquante", () => {
  const r = controleCompletude([eqComplet({ heures_par_an: null })], dossierOk);
  assert.equal(r.bloquant, true);
  const msg = r.problemes[0].messages.find((m) => m.includes("conso non calculable"))!;
  assert.equal(msg.includes("heures"), true);
});

test("règle 3 : superficie absente => bloquant", () => {
  const r = controleCompletude([eqComplet()], { superficie_valeur: null, superficie_unite: null });
  assert.equal(r.bloquant, true);
  assert.equal(r.superficieAbsente, true);
  assert.equal(r.problemes.length, 0); // le blocage vient du dossier, pas d'un équipement
});

test("avertissements : heures > 8760, facteur > 1, puissance <= 0", () => {
  const r = controleCompletude(
    [eqComplet({ heures_par_an: 9000, facteur_charge: 1.5, puissance_valeur: 0, puissance_unite: "kW" })],
    dossierOk,
  );
  const msgs = r.avertissements.map((a) => a.message).join(" | ");
  assert.equal(msgs.includes("heures/an hors plage"), true);
  assert.equal(msgs.includes("facteur de charge hors"), true);
  assert.equal(msgs.includes("puissance suspecte"), true);
});

test("controleCoherence : null => non disponible", () => {
  assert.deepEqual(controleCoherence(1000, null, 20), { disponible: false });
});

test("controleCoherence : dans le seuil => depasse=false ; au-delà => true", () => {
  // 1100 vs 1000 = 10 % < 20 %
  const sous = controleCoherence(1100, 1000, 20);
  assert.equal(sous.depasse, false);
  assert.ok(Math.abs(sous.ecartPct! - 10) < 1e-9);
  // 1500 vs 1000 = 50 % > 20 %
  const sur = controleCoherence(1500, 1000, 20);
  assert.equal(sur.depasse, true);
  assert.ok(Math.abs(sur.ecartPct! - 50) < 1e-9);
});

