import { test } from "node:test";
import assert from "node:assert/strict";
import { peut, type Droits } from "./droits.ts";

function d(p: Partial<Droits>): Droits {
  return {
    role: p.role ?? "engineer",
    actif: p.actif ?? true,
    peut_modifier: p.peut_modifier ?? true,
    peut_valider: p.peut_valider ?? true,
    peut_exporter: p.peut_exporter ?? true,
  };
}

test("admin : tout autorisé", () => {
  const a = d({ role: "admin", peut_modifier: false, peut_valider: false, peut_exporter: false });
  assert.equal(peut(a, "modifier"), true);
  assert.equal(peut(a, "valider"), true);
  assert.equal(peut(a, "exporter"), true);
});

test("compte désactivé : rien, même admin", () => {
  assert.equal(peut(d({ role: "admin", actif: false }), "modifier"), false);
  assert.equal(peut(d({ actif: false }), "exporter"), false);
});

test("ingénieur : suit chaque drapeau", () => {
  assert.equal(peut(d({ peut_modifier: false }), "modifier"), false);
  assert.equal(peut(d({ peut_valider: false }), "valider"), false);
  assert.equal(peut(d({ peut_exporter: false }), "exporter"), false);
  assert.equal(peut(d({ peut_modifier: false }), "valider"), true);
});
