import Anthropic from "@anthropic-ai/sdk";
import { UNITES } from "./calc";
import { verifierPlausibilite } from "./photos";

// Règle fondatrice : l'IA LIT la plaque et PROPOSE. Elle ne devine jamais, ne convertit jamais,
// ne calcule jamais. Tout champ incertain reste null. L'unité d'origine est conservée telle quelle.
// Sortie STRUCTURÉE (JSON schema), pas de texte libre. ANTHROPIC_API_KEY est server-only.

export type Confiance = "lisible" | "partiel" | "illisible";

export type PlaqueProposee = {
  marque: string | null;
  modele: string | null;
  puissance_valeur: number | null;
  puissance_unite: string | null;
  annee: number | null;
  confiance: {
    marque: Confiance;
    modele: Confiance;
    puissance: Confiance;
    annee: Confiance;
  };
};

const CONFIANCE_ENUM: Confiance[] = ["lisible", "partiel", "illisible"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    marque: { anyOf: [{ type: "string" }, { type: "null" }] },
    modele: { anyOf: [{ type: "string" }, { type: "null" }] },
    puissance_valeur: { anyOf: [{ type: "number" }, { type: "null" }] },
    puissance_unite: { anyOf: [{ type: "string", enum: UNITES }, { type: "null" }] },
    annee: { anyOf: [{ type: "integer" }, { type: "null" }] },
    confiance: {
      type: "object",
      additionalProperties: false,
      properties: {
        marque: { type: "string", enum: CONFIANCE_ENUM },
        modele: { type: "string", enum: CONFIANCE_ENUM },
        puissance: { type: "string", enum: CONFIANCE_ENUM },
        annee: { type: "string", enum: CONFIANCE_ENUM },
      },
      required: ["marque", "modele", "puissance", "annee"],
    },
  },
  required: ["marque", "modele", "puissance_valeur", "puissance_unite", "annee", "confiance"],
} as const;

const SYSTEM = `Tu lis la plaque signalétique d'un équipement CVC/électrique à partir de photos.
Règles absolues :
- Ne DEVINE jamais. Si un champ n'est pas clairement lisible, mets-le à null.
- CONSERVE l'unité de puissance telle qu'imprimée (kW, HP ou BTU/h). Ne convertis JAMAIS et ne calcule JAMAIS.
- Si l'unité imprimée n'est pas kW, HP ou BTU/h, mets puissance_valeur ET puissance_unite à null.
- Reporte ta confiance par champ : "lisible" (clair), "partiel" (partiellement visible/ambigu), "illisible" (absent ou illisible).
- Un champ null doit avoir une confiance "partiel" ou "illisible", jamais "lisible".`;

/**
 * Normalise la sortie brute du modèle : rejette une unité hors liste et borne via
 * verifierPlausibilite. Pur et exporté => testable sans appeler l'API. Une valeur implausible
 * est effacée (null) et sa confiance rétrogradée en "partiel" (le code ne corrige pas, il écarte).
 */
export function normaliserPlaque(raw: PlaqueProposee): PlaqueProposee {
  const out: PlaqueProposee = {
    ...raw,
    confiance: { ...raw.confiance },
  };

  if (out.puissance_unite !== null && !(UNITES as string[]).includes(out.puissance_unite)) {
    out.puissance_valeur = null;
    out.puissance_unite = null;
    out.confiance.puissance = "illisible";
  }
  if (
    out.puissance_valeur !== null &&
    !verifierPlausibilite({ champ: "puissance", valeur: out.puissance_valeur }).ok
  ) {
    out.puissance_valeur = null;
    out.puissance_unite = null;
    out.confiance.puissance = "partiel";
  }
  if (out.annee !== null && !verifierPlausibilite({ champ: "annee", valeur: out.annee }).ok) {
    out.annee = null;
    out.confiance.annee = "partiel";
  }
  return out;
}

export type ImageEntree = { base64: string; mediaType: string };

/** Appelle Claude vision sur une ou plusieurs photos de la même plaque et renvoie une proposition. */
export async function lirePlaque(images: ImageEntree[]): Promise<PlaqueProposee> {
  if (images.length === 0) throw new Error("Aucune photo à lire.");

  const client = new Anthropic(); // lit ANTHROPIC_API_KEY depuis l'environnement (server-only)

  const response = await client.messages.create({
    model: "claude-sonnet-5", // vision + bon OCR, moins cher que l'Opus ; configurable au besoin
    max_tokens: 1024,
    thinking: { type: "disabled" }, // lecture de plaque : réponse courte, pas de raisonnement long
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: img.base64,
            },
          })),
          { type: "text" as const, text: "Lis cette plaque signalétique." },
        ],
      },
    ],
  });

  const bloc = response.content.find((b) => b.type === "text");
  if (!bloc || bloc.type !== "text") throw new Error("Réponse IA sans contenu texte.");

  return normaliserPlaque(JSON.parse(bloc.text) as PlaqueProposee);
}
