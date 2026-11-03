import { test } from "node:test";
import assert from "node:assert/strict";
import { retourAnnees, investissementNet, type Mesure } from "./mesures.ts";

function m(p: Partial<Mesure>): Mesure {
  return {
    nom: p.nom ?? null,
    economies_annuelles: p.economies_annuelles ?? null,
    cout_investissement: p.cout_investissement ?? null,
    subvention: p.subvention ?? null,
  };
}

test("retourAnnees : cas nominal (net 13000 / 4000 = 3,25 ans)", () => {
  assert.equal(
    retourAnnees(m({ cout_investissement: 15000, subvention: 2000, economies_annuelles: 4000 })),
    3.25,
  );
});

test("retourAnnees : subvention manquante = 0 (net = coût)", () => {
  assert.equal(
    retourAnnees(m({ cout_investissement: 8000, economies_annuelles: 4000 })),
    2,
  );
});

test("retourAnnees : économies nulles ou négatives → null", () => {
  assert.equal(retourAnnees(m({ cout_investissement: 8000, economies_annuelles: 0 })), null);
  assert.equal(retourAnnees(m({ cout_investissement: 8000, economies_annuelles: -100 })), null);
});

test("retourAnnees : net ≤ 0 (subvention ≥ coût) → null", () => {
  assert.equal(
    retourAnnees(m({ cout_investissement: 3000, subvention: 3000, economies_annuelles: 4000 })),
    null,
  );
});

test("retourAnnees / investissementNet : coût inconnu → null", () => {
  assert.equal(investissementNet(m({ economies_annuelles: 4000 })), null);
  assert.equal(retourAnnees(m({ economies_annuelles: 4000 })), null);
});
