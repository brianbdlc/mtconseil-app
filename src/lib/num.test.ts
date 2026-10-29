import { test } from "node:test";
import assert from "node:assert/strict";
import { numFr } from "./num.ts";

test("numFr : vide => null", () => {
  assert.equal(numFr(""), null);
  assert.equal(numFr("   "), null);
  assert.equal(numFr(null), null);
});

test("numFr : décimale fr-CA et milliers avec espace", () => {
  assert.equal(numFr("0,65"), 0.65);
  assert.equal(numFr("1234.5"), 1234.5);
  assert.equal(numFr("1 234,5"), 1234.5);
  assert.equal(numFr("1 234,5"), 1234.5); // espace insécable
  assert.equal(numFr("1 234,5"), 1234.5); // fine insécable
});

test("numFr : ambigu => throw", () => {
  assert.throws(() => numFr("12,500"));
  assert.throws(() => numFr("3,120")); // heures : 3120 ou 3,12 ? refusé
});

test("numFr : invalide => throw", () => {
  assert.throws(() => numFr("abc"));
  assert.throws(() => numFr("1,2,3"));
});
