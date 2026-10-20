import { test } from "node:test";
import assert from "node:assert/strict";
import { toKW, consoAnnuelleKwh } from "./calc.ts";

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
