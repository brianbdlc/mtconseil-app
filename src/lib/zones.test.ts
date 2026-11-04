import { test } from "node:test";
import assert from "node:assert/strict";
import { sommeSuperficieZonesM2, type Zone } from "./zones.ts";

test("sommeSuperficieZonesM2 : mix m²/pi² converti puis sommé", () => {
  const zones: Zone[] = [
    { nom: "RDC", superficie: 100, unite: "m2" },
    { nom: "Étage", superficie: 1000, unite: "pi2" }, // 1000 × 0.09290304 = 92.90304
  ];
  assert.equal(sommeSuperficieZonesM2(zones), 100 + 1000 * 0.09290304);
});

test("sommeSuperficieZonesM2 : liste vide → 0", () => {
  assert.equal(sommeSuperficieZonesM2([]), 0);
});

test("sommeSuperficieZonesM2 : lignes incomplètes ignorées", () => {
  const zones: Zone[] = [
    { nom: "OK", superficie: 50, unite: "m2" },
    { nom: "sans unité", superficie: 999, unite: null },
    { nom: "sans superficie", superficie: null, unite: "m2" },
  ];
  assert.equal(sommeSuperficieZonesM2(zones), 50);
});
