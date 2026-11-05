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
// et « Modèle v{modele_version} ». Phase 9 ajoute la boucle {#zones}…{/zones} (nom_zone,
// superficie_zone, unite_zone) + « {zones_total_m2} m² » (descriptif, hors calcul).
// Phase 10 ajoute la boucle {#distribution}…{/distribution} (amperes, tension) +
// « Nombre d'entrées : {distribution_nb_entrees} » (descriptif, saisie ingénieur, hors calcul).
// Phase 11 ajoute la boucle {#revisions}…{/revisions} (numero_rev, date_rev, description_rev)
// + des styles Titre 1 (Heading1) sur les labels de sections + un champ TOC natif Word
// (w:fldChar « TOC \o "1-1" \h \z \u ») que Word régénère via F9. Hors calcul.
// Aucune autre ligne de code à changer.
// ponytail: liste à puces du bilan provisoire — la vraie table Word viendra avec le modèle de Luis.
// ponytail: champ TOC natif, non calculé (profondeur plate \o "1-1") — ceiling = TOC figée si Luis l'exige.
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
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Lien document → styles (requis pour que Word applique le style Heading1).
const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// Style Titre 1 minimal. outlineLvl=0 est requis pour que le champ TOC capte le titre.
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
</w:styles>`;

const p = (text) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// Titre 1 : paragraphe stylé Heading1 (promeut un label de section en titre capté par la TOC).
const h1 = (text) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// Champ TOC natif : Word le peuple à l'ouverture / F9. Texte de secours entre separate et end.
const champTOC = `<w:p>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:r><w:t xml:space="preserve">Mettez à jour le champ (F9) pour générer la table des matières.</w:t></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>`;

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p("MT Conseil — Rapport d'audit énergétique (PROVISOIRE)")}
    ${p("Client : {client}")}
    ${p("Adresse : {adresse}")}
    ${p("Statut : {statut}")}
    ${p("")}
    ${h1("Registre des révisions")}
    ${p("{#revisions}")}
    ${p("- {numero_rev} | {date_rev} | {description_rev}")}
    ${p("{/revisions}")}
    ${p("")}
    ${h1("Table des matières")}
    ${champTOC}
    ${p("")}
    ${h1("Sommaire exécutif")}
    ${p("{sommaire_texte}")}
    ${p("")}
    ${h1("Bilan par poste")}
    ${p("{#bilan_postes}")}
    ${p("- {poste} : {kwh} kWh/an ({pct} %)")}
    ${p("{/bilan_postes}")}
    ${p("Total (toutes énergies) : {total_kwh} kWh/an")}
    ${p("Intensité : {intensite} kWh/m²")}
    ${p("Gaz saisi (équivalent) : {gaz_kwh} kWh")}
    ${p("")}
    ${h1("Équipements")}
    ${p("{#equipements}")}
    ${p("- {nom} : {puissance_valeur} {puissance_unite} → {conso_kwh_an} kWh/an")}
    ${p("{/equipements}")}
    ${p("")}
    ${h1("Zones du bâtiment")}
    ${p("Descriptif — hors calcul.")}
    ${p("{#zones}")}
    ${p("- {nom_zone} : {superficie_zone} {unite_zone}")}
    ${p("{/zones}")}
    ${p("Superficie totale des zones (descriptive) : {zones_total_m2} m²")}
    ${p("")}
    ${h1("Distribution électrique")}
    ${p("Descriptif — saisie ingénieur.")}
    ${p("Nombre d'entrées : {distribution_nb_entrees}")}
    ${p("{#distribution}")}
    ${p("- {amperes} A / {tension} V")}
    ${p("{/distribution}")}
    ${p("")}
    ${h1("Description des installations")}
    ${p("{description_installations}")}
    ${p("")}
    ${h1("Mesures d'amélioration")}
    ${p("{#mesures}")}
    ${p("- {nom} : économies {economies_annuelles} $/an, investissement {cout_investissement} $, subvention {subvention} $ → retour {retour_annees} ans")}
    ${p("{/mesures}")}
    ${p("{mesures_mise_en_forme}")}
    ${p("")}
    ${h1("Problèmes techniques")}
    ${p("{problemes_techniques}")}
    ${h1("Phasage des travaux")}
    ${p("{phasage_travaux}")}
    ${h1("Risques SSE")}
    ${p("{risques_sse}")}
    ${h1("Conclusions")}
    ${p("{conclusions}")}
    ${p("")}
    ${h1("Méthodologie")}
    ${p("{methodologie}")}
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
zip.file("word/_rels/document.xml.rels", documentRels);
zip.file("word/styles.xml", styles);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip.generate({ type: "nodebuffer" }));
console.log("Écrit", out);
