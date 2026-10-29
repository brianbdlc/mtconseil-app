import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toKW,
  consoAnnuelleKwh,
  toM2,
  intensiteKwhM2,
  gazEnKwh,
  facteurEffectif,
  normaliserSurcharge,
  consoEquipement,
  bilanEnergetique,
} from "./calc.ts";

test("toKW convertit chaque unité vers le kW", () => {
  assert.equal(toKW(10, "kW"), 10);
  assert.ok(Math.abs(toKW(10, "HP") - 7.457) < 1e-9);
  assert.ok(Math.abs(toKW(10000, "BTU/h") - 2.9307107) < 1e-9);
});

test("toKW rejette une unité inconnue (jamais deviner)", () => {
  assert.throws(() => toKW(10, "W"));
});

test("consoAnnuelleKwh = puissance(kW) × heures × facteur", () => {
  // 10 HP = 7.457 kW ; × 2000 h × 0.8 = 11931.2 kWh/an
  const kwh = consoAnnuelleKwh({
    puissanceValeur: 10,
    puissanceUnite: "HP",
    heuresParAn: 2000,
    facteurCharge: 0.8,
  });
  assert.ok(Math.abs(kwh - 11931.2) < 1e-6, `attendu ~11931.2, obtenu ${kwh}`);
});

test("toM2 : m2 inchangé, pi2 converti, inconnue => throw", () => {
  assert.equal(toM2(100, "m2"), 100);
  assert.ok(Math.abs(toM2(1000, "pi2") - 92.90304) < 1e-6);
  assert.throws(() => toM2(100, "sqft"));
});

test("intensiteKwhM2 : nominal + absence => null", () => {
  assert.ok(Math.abs(intensiteKwhM2(9290.304, 1000, "pi2")! - 100) < 1e-6);
  assert.equal(intensiteKwhM2(1000, null, "m2"), null);
  assert.equal(intensiteKwhM2(1000, 0, "m2"), null);
  assert.equal(intensiteKwhM2(1000, 100, null), null);
});

test("gazEnKwh : kWh/GJ/m³ + facteur + null + inconnue => throw", () => {
  assert.equal(gazEnKwh({ quantite: 500, unite: "kWh", facteurM3: null }), 500);
  assert.ok(Math.abs(gazEnKwh({ quantite: 1, unite: "GJ", facteurM3: null })! - 277.777) < 1e-2);
  assert.equal(gazEnKwh({ quantite: 100, unite: "m3", facteurM3: 10.5 }), 1050);
  assert.equal(gazEnKwh({ quantite: 100, unite: "m3", facteurM3: null }), null); // facteur manquant
  assert.equal(gazEnKwh({ quantite: null, unite: "GJ", facteurM3: null }), null);
  assert.throws(() => gazEnKwh({ quantite: 1, unite: "litres", facteurM3: null }));
});

test("facteurEffectif : surcharge prime, sinon type, sinon null", () => {
  assert.equal(facteurEffectif({ typeId: "t", facteurType: 0.6, surcharge: 0.9 }), 0.9);
  assert.equal(facteurEffectif({ typeId: "t", facteurType: 0.6, surcharge: null }), 0.6);
  assert.equal(facteurEffectif({ typeId: null, facteurType: null, surcharge: 0.5 }), 0.5); // hors catégorie
  assert.equal(facteurEffectif({ typeId: "t", facteurType: null, surcharge: null }), null); // manquant
});

test("normaliserSurcharge : =défaut ou effacé => null ; sinon raison requise", () => {
  assert.deepEqual(normaliserSurcharge(null, 0.6), { facteurCharge: null, raisonRequise: false });
  assert.deepEqual(normaliserSurcharge(0.6, 0.6), { facteurCharge: null, raisonRequise: false });
  assert.deepEqual(normaliserSurcharge(0.9, 0.6), { facteurCharge: 0.9, raisonRequise: true });
  assert.deepEqual(normaliserSurcharge(0.5, null), { facteurCharge: 0.5, raisonRequise: true });
});

test("consoEquipement : null si une entrée manque", () => {
  assert.equal(
    consoEquipement({ puissanceValeur: 10, puissanceUnite: "kW", heuresParAn: 2000, facteurEffectif: 0.5 }),
    10000,
  );
  assert.equal(
    consoEquipement({ puissanceValeur: 10, puissanceUnite: "kW", heuresParAn: 2000, facteurEffectif: null }),
    null,
  );
  assert.equal(
    consoEquipement({ puissanceValeur: null, puissanceUnite: "kW", heuresParAn: 2000, facteurEffectif: 0.5 }),
    null,
  );
});

test("bilanEnergetique : hors-catégorie exclu du détail mais au total ; pct ; nbAConfirmer", () => {
  const b = bilanEnergetique([
    { poste: "chauffage", conso: 6000, reposeSurValeurAConfirmer: true, valide: true },
    { poste: "chauffage", conso: 2000, reposeSurValeurAConfirmer: false, valide: true }, // surcharge : ne compte pas
    { poste: "eclairage", conso: 2000, reposeSurValeurAConfirmer: false, valide: true },
    { poste: null, conso: 1000, reposeSurValeurAConfirmer: false, valide: true }, // hors catégorie
    { poste: "ventilation", conso: null, reposeSurValeurAConfirmer: false, valide: false }, // sans conso
  ]);

  assert.equal(b.totalEquipementsKwh, 11000); // 6000+2000+2000+1000
  assert.equal(b.horsCategorieKwh, 1000);
  assert.equal(b.nbHorsCategorie, 1);
  assert.equal(b.nbSansConso, 1);
  assert.equal(b.nbNonValides, 1);
  assert.equal(b.nbAConfirmerTotal, 1); // seule la 1re ligne

  const chauffage = b.parPoste.find((p) => p.poste === "chauffage")!;
  assert.equal(chauffage.kwh, 8000);
  assert.equal(chauffage.nbAConfirmer, 1);
  assert.ok(Math.abs(chauffage.pct - (8000 / 11000) * 100) < 1e-9);
  // hors catégorie n'apparaît pas dans le détail par poste
  assert.equal(b.parPoste.find((p) => p.poste === null as unknown as string), undefined);
});
