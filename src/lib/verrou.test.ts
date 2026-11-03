import { test } from "node:test";
import assert from "node:assert/strict";
import { DUREE_VERROU_MS, estExpire, etatVerrou } from "./verrou.ts";

const NOW = 1_000_000;
const futur = new Date(NOW + DUREE_VERROU_MS).toISOString();
const passe = new Date(NOW - 1).toISOString();

test("etatVerrou : pas de ligne = libre", () => {
  assert.equal(etatVerrou(null, "moi", NOW), "libre");
});

test("etatVerrou : détenu par un autre, non expiré = autrui", () => {
  assert.equal(etatVerrou({ detenteur: "autre", expire_le: futur }, "moi", NOW), "autrui");
});

test("etatVerrou : détenu par moi, non expiré = a_moi", () => {
  assert.equal(etatVerrou({ detenteur: "moi", expire_le: futur }, "moi", NOW), "a_moi");
});

test("etatVerrou : expiré = libre même si détenu par un autre", () => {
  assert.equal(etatVerrou({ detenteur: "autre", expire_le: passe }, "moi", NOW), "libre");
});

test("estExpire : borne inclusive (expire_le == now)", () => {
  assert.equal(estExpire(new Date(NOW).toISOString(), NOW), true);
  assert.equal(estExpire(futur, NOW), false);
});
