import { gazEnKwh } from "./calc.ts";

// Anthropic est importé dynamiquement dans lireFacture (server-only) pour que ce module reste
// bundlable côté client (la page factures importe les fonctions pures ci-dessous).
type Confiance = "lisible" | "partiel" | "illisible";

// Règle fondatrice : l'IA LIT la facture et PROPOSE. Le CODE convertit (kWh), somme et vérifie
// (continuité des périodes). L'ingénieur CONFIRME. Un champ incertain reste null.
// Seules les factures CONFIRMÉES alimentent le contrôle de cohérence (assembleur).

const CONSO_UNITES = ["kWh", "m3", "GJ"] as const;
export type ConsoUnite = (typeof CONSO_UNITES)[number];

export type Facture = {
  id: string;
  energie: "elec" | "gaz" | null;
  periode_debut: string | null; // YYYY-MM-DD
  periode_fin: string | null;
  conso_valeur: number | null;
  conso_unite: string | null;
  confirme: boolean;
};

/**
 * kWh d'une facture. Élec → conso telle quelle (unité attendue kWh, sinon null : on ne devine pas).
 * Gaz → gazEnKwh (réutilise la conversion de calc.ts, m3 sans facteur = null). null si incalculable.
 */
export function factureEnKwh(f: Facture, facteurGaz: number | null): number | null {
  if (f.conso_valeur === null || !f.conso_unite || !f.energie) return null;
  if (f.energie === "elec") return f.conso_unite === "kWh" ? f.conso_valeur : null;
  return gazEnKwh({ quantite: f.conso_valeur, unite: f.conso_unite, facteurM3: facteurGaz });
}

/**
 * Total kWh des factures CONFIRMÉES exploitables (élec + gaz). null si aucune confirmée n'est
 * convertible → la cohérence reste « non disponible » plutôt que d'additionner du vide.
 */
export function totalFacturesKwh(factures: Facture[], facteurGaz: number | null): number | null {
  let total = 0;
  let nb = 0;
  for (const f of factures) {
    if (!f.confirme) continue;
    const kwh = factureEnKwh(f, facteurGaz);
    if (kwh !== null) {
      total += kwh;
      nb++;
    }
  }
  return nb === 0 ? null : total;
}

export type DouteFacture = { factureId: string; message: string };

const UN_JOUR_MS = 86_400_000;

/**
 * Vérifs du CODE (US-32), non bloquantes : période inversée, conso manquante/nulle, et par énergie
 * — chevauchement ou trou entre périodes consécutives (« dates qui se suivent »). Signale, ne bloque pas.
 */
export function verifierFactures(factures: Facture[]): DouteFacture[] {
  const doutes: DouteFacture[] = [];

  for (const f of factures) {
    if (f.periode_debut && f.periode_fin && f.periode_fin < f.periode_debut) {
      doutes.push({ factureId: f.id, message: "période inversée (fin avant début)" });
    }
    if (f.conso_valeur === null || f.conso_valeur === 0) {
      doutes.push({ factureId: f.id, message: "consommation manquante ou nulle" });
    }
  }

  // Continuité par énergie : trie les factures datées, compare chaque paire consécutive.
  for (const energie of ["elec", "gaz"] as const) {
    const datees = factures
      .filter((f) => f.energie === energie && f.periode_debut && f.periode_fin)
      .sort((a, b) => a.periode_debut!.localeCompare(b.periode_debut!));
    for (let i = 1; i < datees.length; i++) {
      const prev = datees[i - 1];
      const cur = datees[i];
      if (cur.periode_debut! < prev.periode_fin!) {
        doutes.push({ factureId: cur.id, message: `chevauchement de période (${energie})` });
      } else {
        const trou = Date.parse(cur.periode_debut!) - Date.parse(prev.periode_fin!);
        if (trou > UN_JOUR_MS) {
          doutes.push({ factureId: cur.id, message: `trou entre périodes (${energie})` });
        }
      }
    }
  }

  return doutes;
}

// ───────────────────────── Appel IA (server-only, miroir plaque.ts) ─────────────────────────

export type FactureProposee = {
  energie: "elec" | "gaz" | null;
  fournisseur: string | null;
  periode_debut: string | null;
  periode_fin: string | null;
  conso_valeur: number | null;
  conso_unite: ConsoUnite | null;
  confiance: Confiance;
};

const CONFIANCE_ENUM: Confiance[] = ["lisible", "partiel", "illisible"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    energie: { anyOf: [{ type: "string", enum: ["elec", "gaz"] }, { type: "null" }] },
    fournisseur: { anyOf: [{ type: "string" }, { type: "null" }] },
    periode_debut: { anyOf: [{ type: "string" }, { type: "null" }] },
    periode_fin: { anyOf: [{ type: "string" }, { type: "null" }] },
    conso_valeur: { anyOf: [{ type: "number" }, { type: "null" }] },
    conso_unite: { anyOf: [{ type: "string", enum: CONSO_UNITES }, { type: "null" }] },
    confiance: { type: "string", enum: CONFIANCE_ENUM },
  },
  required: [
    "energie",
    "fournisseur",
    "periode_debut",
    "periode_fin",
    "conso_valeur",
    "conso_unite",
    "confiance",
  ],
} as const;

const SYSTEM = `Tu lis une facture d'énergie (électricité Hydro-Québec, gaz naturel Énergir, etc.).
Règles absolues :
- Ne DEVINE jamais. Si un champ n'est pas clairement lisible, mets-le à null.
- energie : "elec" (électricité) ou "gaz" (gaz naturel) ; null si indéterminable.
- CONSERVE l'unité de consommation telle qu'imprimée (kWh, m3 ou GJ). Ne convertis JAMAIS.
- Si l'unité imprimée n'est pas kWh, m3 ou GJ, mets conso_valeur ET conso_unite à null.
- Dates de période au format AAAA-MM-JJ ; null si absentes ou illisibles.
- confiance globale de la lecture : "lisible" (clair), "partiel" (ambigu), "illisible" (quasi illisible).`;

/** Normalise la sortie brute : écarte une unité hors liste (le code n'invente pas une unité). */
export function normaliserFacture(raw: FactureProposee): FactureProposee {
  const out: FactureProposee = { ...raw };
  if (out.conso_unite !== null && !(CONSO_UNITES as readonly string[]).includes(out.conso_unite)) {
    out.conso_valeur = null;
    out.conso_unite = null;
  }
  return out;
}

export type FichierEntree = { base64: string; mediaType: string };

/** Appelle Claude sur une facture (image ou PDF) et renvoie une proposition. ANTHROPIC_API_KEY server-only. */
export async function lireFacture(fichier: FichierEntree): Promise<FactureProposee> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  // PDF → bloc document ; image → bloc image (même source base64).
  const bloc =
    fichier.mediaType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: fichier.base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: fichier.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: fichier.base64,
          },
        };

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: [bloc, { type: "text", text: "Lis cette facture d'énergie." }] }],
  });

  const texte = response.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") throw new Error("Réponse IA sans contenu texte.");

  return normaliserFacture(JSON.parse(texte.text) as FactureProposee);
}
