// Génère le modèle Word PROVISOIRE (src/templates/rapport-provisoire.docx) avec les
// placeholders docxtemplater. Un .docx = un zip OOXML ; on l'assemble à la main pour
// ne pas dépendre d'un éditeur Word.
//
// SWAP MODÈLE (Phase ultérieure) : remplacer rapport-provisoire.docx par le VRAI modèle
// Word de Luis portant les MÊMES placeholders ({client}, {adresse}, {statut}, le sommaire
// {sommaire_texte}/{total_kwh}/{intensite}/{gaz_kwh}, la boucle {#bilan_postes}…{/bilan_postes}
// et {#equipements}…{/equipements}). Phase 7 ajoute : {description_installations},
// {mesures_mise_en_forme}, {problemes_techniques}, {phasage_travaux}, {risques_sse},
// {conclusions} ; la boucle {#mesures}…{/mesures} (nom, economies_annuelles, cout_investissement,
// subvention, retour_annees) ; les textes fixes {methodologie}/{norme_ashrae}/{modele_risques_sse}
// et « Modèle v{modele_version} ». Aucune autre ligne de code à changer.
// ponytail: liste à puces du bilan provisoire — la vraie table Word viendra avec le modèle de Luis.
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
    ${p("Sommaire exécutif :")}
    ${p("{sommaire_texte}")}
    ${p("")}
    ${p("Bilan par poste :")}
    ${p("{#bilan_postes}")}
    ${p("- {poste} : {kwh} kWh/an ({pct} %)")}
    ${p("{/bilan_postes}")}
    ${p("Total (toutes énergies) : {total_kwh} kWh/an")}
    ${p("Intensité : {intensite} kWh/m²")}
    ${p("Gaz saisi (équivalent) : {gaz_kwh} kWh")}
    ${p("")}
    ${p("Équipements :")}
    ${p("{#equipements}")}
    ${p("- {nom} : {puissance_valeur} {puissance_unite} → {conso_kwh_an} kWh/an")}
    ${p("{/equipements}")}
    ${p("")}
    ${p("Description des installations :")}
    ${p("{description_installations}")}
    ${p("")}
    ${p("Mesures d'amélioration :")}
    ${p("{#mesures}")}
    ${p("- {nom} : économies {economies_annuelles} $/an, investissement {cout_investissement} $, subvention {subvention} $ → retour {retour_annees} ans")}
    ${p("{/mesures}")}
    ${p("{mesures_mise_en_forme}")}
    ${p("")}
    ${p("Problèmes techniques :")}
    ${p("{problemes_techniques}")}
    ${p("Phasage des travaux :")}
    ${p("{phasage_travaux}")}
    ${p("Risques SSE :")}
    ${p("{risques_sse}")}
    ${p("Conclusions :")}
    ${p("{conclusions}")}
    ${p("")}
    ${p("Méthodologie : {methodologie}")}
    ${p("Norme ASHRAE : {norme_ashrae}")}
    ${p("Risques SSE génériques : {modele_risques_sse}")}
    ${p("Modèle v{modele_version}")}
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
