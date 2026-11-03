import { test } from "node:test";
import assert from "node:assert/strict";
import {
  factureEnKwh,
  totalFacturesKwh,
  verifierFactures,
  normaliserFacture,
  type Facture,
  type FactureProposee,
} from "./factures.ts";

function f(p: Partial<Facture>): Facture {
  return {
    id: p.id ?? "x",
    energie: p.energie ?? null,
    periode_debut: p.periode_debut ?? null,
    periode_fin: p.periode_fin ?? null,
    conso_valeur: p.conso_valeur ?? null,
    conso_unite: p.conso_unite ?? null,
    confirme: p.confirme ?? false,
  };
}

test("factureEnKwh : élec en kWh telle quelle, autre unité élec = null", () => {
  assert.equal(factureEnKwh(f({ energie: "elec", conso_valeur: 1200, conso_unite: "kWh" }), null), 1200);
  assert.equal(factureEnKwh(f({ energie: "elec", conso_valeur: 1200, conso_unite: "m3" }), null), null);
});

test("factureEnKwh : gaz via gazEnKwh (m3 avec/sans facteur, GJ)", () => {
  assert.equal(factureEnKwh(f({ energie: "gaz", conso_valeur: 100, conso_unite: "m3" }), 10.33), 1033);
  assert.equal(factureEnKwh(f({ energie: "gaz", conso_valeur: 100, conso_unite: "m3" }), null), null);
  assert.ok(Math.abs(factureEnKwh(f({ energie: "gaz", conso_valeur: 3.6, conso_unite: "GJ" }), null)! - 1000) < 1e-9);
});

test("factureEnKwh : null si une donnée manque", () => {
  assert.equal(factureEnKwh(f({ energie: "elec", conso_valeur: null, conso_unite: "kWh" }), null), null);
  assert.equal(factureEnKwh(f({ energie: null, conso_valeur: 100, conso_unite: "kWh" }), null), null);
});

test("totalFacturesKwh : somme des confirmées seulement, null si aucune exploitable", () => {
  const factures = [
    f({ id: "a", energie: "elec", conso_valeur: 1000, conso_unite: "kWh", confirme: true }),
    f({ id: "b", energie: "gaz", conso_valeur: 100, conso_unite: "m3", confirme: true }),
    f({ id: "c", energie: "elec", conso_valeur: 999, conso_unite: "kWh", confirme: false }), // non confirmée
  ];
  assert.equal(totalFacturesKwh(factures, 10), 1000 + 1000); // 999 exclue
  assert.equal(totalFacturesKwh([f({ confirme: false, energie: "elec", conso_valeur: 5, conso_unite: "kWh" })], null), null);
  // Confirmée mais inconvertible (gaz m3 sans facteur) → non exploitable → null.
  assert.equal(totalFacturesKwh([f({ energie: "gaz", conso_valeur: 100, conso_unite: "m3", confirme: true })], null), null);
});

test("verifierFactures : période inversée et conso nulle signalées", () => {
  const doutes = verifierFactures([
    f({ id: "inv", periode_debut: "2024-03-01", periode_fin: "2024-02-01", conso_valeur: 10, conso_unite: "kWh", energie: "elec" }),
    f({ id: "vide", conso_valeur: 0 }),
  ]);
  assert.ok(doutes.some((d) => d.factureId === "inv" && /inversée/.test(d.message)));
  assert.ok(doutes.some((d) => d.factureId === "vide" && /manquante ou nulle/.test(d.message)));
});

test("verifierFactures : chevauchement et trou entre périodes de même énergie", () => {
  const chevauche = verifierFactures([
    f({ id: "1", energie: "elec", periode_debut: "2024-01-01", periode_fin: "2024-02-01", conso_valeur: 1, conso_unite: "kWh" }),
    f({ id: "2", energie: "elec", periode_debut: "2024-01-15", periode_fin: "2024-02-15", conso_valeur: 1, conso_unite: "kWh" }),
  ]);
  assert.ok(chevauche.some((d) => /chevauchement/.test(d.message)));

  const trou = verifierFactures([
    f({ id: "1", energie: "elec", periode_debut: "2024-01-01", periode_fin: "2024-02-01", conso_valeur: 1, conso_unite: "kWh" }),
    f({ id: "2", energie: "elec", periode_debut: "2024-03-01", periode_fin: "2024-04-01", conso_valeur: 1, conso_unite: "kWh" }),
  ]);
  assert.ok(trou.some((d) => /trou/.test(d.message)));
});

test("verifierFactures : périodes contiguës sans doute de continuité", () => {
  const ok = verifierFactures([
    f({ id: "1", energie: "elec", periode_debut: "2024-01-01", periode_fin: "2024-02-01", conso_valeur: 1, conso_unite: "kWh" }),
    f({ id: "2", energie: "elec", periode_debut: "2024-02-01", periode_fin: "2024-03-01", conso_valeur: 1, conso_unite: "kWh" }),
  ]);
  assert.equal(ok.filter((d) => /chevauchement|trou/.test(d.message)).length, 0);
});

test("normaliserFacture : écarte une unité hors liste", () => {
  const raw = { energie: "gaz", fournisseur: "Énergir", periode_debut: null, periode_fin: null, conso_valeur: 50, conso_unite: "pi3", confiance: "lisible" } as unknown as FactureProposee;
  const out = normaliserFacture(raw);
  assert.equal(out.conso_unite, null);
  assert.equal(out.conso_valeur, null);
});
