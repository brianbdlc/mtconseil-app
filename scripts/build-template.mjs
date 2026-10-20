// Génère le modèle Word PROVISOIRE (src/templates/rapport-provisoire.docx) avec les
// placeholders docxtemplater. Un .docx = un zip OOXML ; on l'assemble à la main pour
// ne pas dépendre d'un éditeur Word.
//
// SWAP MODÈLE (Phase ultérieure) : remplacer rapport-provisoire.docx par le VRAI modèle
// Word de Luis portant les MÊMES placeholders ({client}, {adresse}, {statut} et la boucle
// {#equipements}…{/equipements}). Aucune autre ligne de code à changer.
//
// Régénérer : `node scripts/build-template.mjs`

import PizZip from "pizzip";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "../src/templates/rapport-provisoire.docx");

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const p = (text) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p("MT Conseil — Rapport d'audit énergétique (PROVISOIRE)")}
    ${p("Client : {client}")}
    ${p("Adresse : {adresse}")}
    ${p("Statut : {statut}")}
    ${p("")}
    ${p("Équipements :")}
    ${p("{#equipements}")}
    ${p("- {nom} : {puissance_valeur} {puissance_unite} → {conso_kwh_an} kWh/an")}
    ${p("{/equipements}")}
    <w:sectPr/>
  </w:body>
</w:document>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", rels);
zip.file("word/document.xml", document);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip.generate({ type: "nodebuffer" }));
console.log("Écrit", out);
