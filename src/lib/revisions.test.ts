import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { trierRevisions, type Revision } from "./revisions.ts";

test("trierRevisions : ordonne par `ordre` croissant", () => {
  const rs: Revision[] = [
    { numero: "1.0", date: null, description: null, ordre: 2 },
    { numero: "0", date: null, description: null, ordre: 0 },
    { numero: "A", date: null, description: null, ordre: 1 },
  ];
  assert.deepEqual(
    trierRevisions(rs).map((r) => r.numero),
    ["0", "A", "1.0"],
  );
});

test("trierRevisions : ordre égal → départage par `numero`", () => {
  const rs: Revision[] = [
    { numero: "B", date: null, description: null, ordre: 0 },
    { numero: "A", date: null, description: null, ordre: 0 },
  ];
  assert.deepEqual(trierRevisions(rs).map((r) => r.numero), ["A", "B"]);
});

test("trierRevisions : ne mute pas l'entrée", () => {
  const rs: Revision[] = [
    { numero: "b", date: null, description: null, ordre: 1 },
    { numero: "a", date: null, description: null, ordre: 0 },
  ];
  trierRevisions(rs);
  assert.equal(rs[0].numero, "b"); // ordre d'origine préservé
});

test("modèle .docx committé : styles Titre 1 + champ TOC natif présents", () => {
  const docx = readFileSync(path.join(process.cwd(), "src/templates/rapport-provisoire.docx"), "binary");
  const zip = new PizZip(docx);
  const styles = zip.file("word/styles.xml")?.asText() ?? "";
  const document = zip.file("word/document.xml")?.asText() ?? "";

  assert.match(styles, /w:styleId="Heading1"/);
  assert.match(document, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(document, /TOC \\o "1-1"/);
  assert.match(document, /\{#revisions\}/); // la boucle du registre est bien dans le modèle
  // Phase 15 : garde-fou SWAP MODÈLE — les tableaux mensuels + tags image graphiques sont présents.
  assert.match(document, /\{#factures_mensuel_elec\}/);
  assert.match(document, /\{#factures_mensuel_gaz\}/);
  assert.match(document, /\{#degres_jours\}/);
  assert.match(document, /\{%graphique_dj_elec\}/);
});
