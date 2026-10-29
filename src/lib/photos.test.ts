import { test } from "node:test";
import assert from "node:assert/strict";
import { grouperPhotos, verifierPlausibilite } from "./photos.ts";

const p = (id: string, prise_le: string | null, nom_original: string | null = null) => ({
  id,
  prise_le,
  nom_original,
});

test("grouperPhotos : coupe quand l'écart dépasse le seuil", () => {
  const photos = [
    p("a", "2026-10-20T10:00:00Z"),
    p("b", "2026-10-20T10:00:30Z"), // +30 s : même groupe
    p("c", "2026-10-20T10:05:00Z"), // +4 min 30 : nouveau groupe
  ];
  const groupes = grouperPhotos(photos, { seuilSecondes: 90 });
  assert.equal(groupes.length, 2);
  assert.deepEqual(groupes[0].map((x) => x.id), ["a", "b"]);
  assert.deepEqual(groupes[1].map((x) => x.id), ["c"]);
});

test("grouperPhotos : secours par nom quand prise_le est null", () => {
  const photos = [
    p("z", null, "IMG_0003.jpg"),
    p("x", null, "IMG_0001.jpg"),
    p("y", null, "IMG_0002.jpg"),
  ];
  const groupes = grouperPhotos(photos);
  assert.equal(groupes.length, 1);
  assert.deepEqual(groupes[0].map((x) => x.id), ["x", "y", "z"]);
});

test("grouperPhotos : photos datées puis non datées en groupe de fin", () => {
  const photos = [
    p("sans", null, "IMG.jpg"),
    p("avec", "2026-10-20T10:00:00Z"),
  ];
  const groupes = grouperPhotos(photos);
  assert.equal(groupes.length, 2);
  assert.deepEqual(groupes[0].map((x) => x.id), ["avec"]);
  assert.deepEqual(groupes[1].map((x) => x.id), ["sans"]);
});

test("verifierPlausibilite : année hors borne => suspect", () => {
  assert.equal(verifierPlausibilite({ champ: "annee", valeur: 2015 }).ok, true);
  assert.equal(verifierPlausibilite({ champ: "annee", valeur: 1900 }).ok, false);
  assert.equal(
    verifierPlausibilite({ champ: "annee", valeur: new Date().getFullYear() + 5 }).ok,
    false,
  );
});

test("verifierPlausibilite : puissance <= 0 => suspect", () => {
  assert.equal(verifierPlausibilite({ champ: "puissance", valeur: 7.5 }).ok, true);
  assert.equal(verifierPlausibilite({ champ: "puissance", valeur: 0 }).ok, false);
  assert.equal(verifierPlausibilite({ champ: "puissance", valeur: -3 }).ok, false);
});
