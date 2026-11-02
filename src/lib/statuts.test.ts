import { test } from "node:test";
import assert from "node:assert/strict";
import { peutTransitionner, SECTIONS } from "./statuts.ts";

test("transitions permises par rôle", () => {
  assert.ok(peutTransitionner("brouillon", "soumis", { admin: false, perime: false }));
  assert.ok(peutTransitionner("a_corriger", "soumis", { admin: false, perime: false }));
  assert.ok(peutTransitionner("soumis", "approuve", { admin: true, perime: false }));
  assert.ok(peutTransitionner("soumis", "a_corriger", { admin: true, perime: false }));
});

test("approbation / renvoi interdits à un non-admin", () => {
  assert.ok(!peutTransitionner("soumis", "approuve", { admin: false, perime: false }));
  assert.ok(!peutTransitionner("soumis", "a_corriger", { admin: false, perime: false }));
});

test("soumis→soumis seulement si périmé", () => {
  assert.ok(!peutTransitionner("soumis", "soumis", { admin: false, perime: false }));
  assert.ok(peutTransitionner("soumis", "soumis", { admin: false, perime: true }));
});

test("transitions hors matrice refusées", () => {
  assert.ok(!peutTransitionner("brouillon", "approuve", { admin: true, perime: false }));
  assert.ok(!peutTransitionner("approuve", "exporte", { admin: true, perime: false }));
  assert.ok(!peutTransitionner("exporte", "brouillon", { admin: true, perime: false }));
});

test("SECTIONS est la liste fixe attendue", () => {
  assert.deepEqual([...SECTIONS], ["general", "sommaire", "inventaire", "bilan", "description"]);
});
