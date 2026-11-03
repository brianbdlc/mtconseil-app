// Rédaction assistée (US-41/42). L'IA RÉDIGE un brouillon / MET EN FORME à partir des SEULS éléments
// fournis par l'ingénieur — elle n'invente aucune mesure, aucun chiffre, aucune donnée. Sortie =
// texte libre (pas de JSON schema, contrairement à plaque.ts/factures.ts). ANTHROPIC_API_KEY
// server-only ; l'appel est gâté Loi 25 (ALLOW_REDACTION_AI) côté server action.

const SYSTEM = `Tu rédiges des sections d'un rapport d'audit énergétique pour MT Conseil (ingénierie, Québec).
Règle n°1 ABSOLUE : tu METS EN FORME et RÉDIGES uniquement à partir des éléments fournis. Tu
n'INVENTES JAMAIS une mesure, un chiffre, une donnée technique ou une recommandation qui ne te sont
pas donnés. Si une information manque, tu l'omets — tu ne la combles pas.
Style : sobre, technique, professionnel, en français. Phrases claires, pas de superlatifs commerciaux.
Rends uniquement le texte de la section, sans titre ni préambule.`;

export type FicheValidee = {
  nom: string | null;
  marque: string | null;
  modele: string | null;
  puissance_valeur: number | null;
  puissance_unite: string | null;
  annee: number | null;
  etat: string | null;
  emplacement: string | null;
  dessert: string | null;
};

/**
 * Filtre les équipements : ne garde que les champs validés par l'ingénieur (*_validated=true).
 * Pur et exporté → testable sans API. L'IA ne reçoit que du confirmé (jamais une proposition IA
 * non revue, ni une donnée incertaine).
 */
export function extraireFichesValidees(
  equipements: {
    nom: string | null;
    marque: string | null;
    marque_validated: boolean | null;
    modele: string | null;
    modele_validated: boolean | null;
    puissance_valeur: number | null;
    puissance_unite: string | null;
    puissance_validated: boolean | null;
    annee: number | null;
    annee_validated: boolean | null;
    etat: string | null;
    emplacement: string | null;
    dessert: string | null;
  }[],
): FicheValidee[] {
  return equipements.map((e) => ({
    nom: e.nom,
    marque: e.marque_validated ? e.marque : null,
    modele: e.modele_validated ? e.modele : null,
    puissance_valeur: e.puissance_validated ? e.puissance_valeur : null,
    puissance_unite: e.puissance_validated ? e.puissance_unite : null,
    annee: e.annee_validated ? e.annee : null,
    // etat/emplacement/dessert sont saisis à la main (pas d'IA) → toujours inclus.
    etat: e.etat,
    emplacement: e.emplacement,
    dessert: e.dessert,
  }));
}

async function redigerTexte(instruction: string, donnees: unknown): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${instruction}\n\nÉléments fournis (JSON) :\n${JSON.stringify(donnees, null, 2)}` },
        ],
      },
    ],
  });

  const bloc = response.content.find((b) => b.type === "text");
  if (!bloc || bloc.type !== "text") throw new Error("Réponse IA sans contenu texte.");
  return bloc.text.trim();
}

/** US-41 : brouillon de la description des installations à partir des fiches équipement VALIDÉES. */
export function redigerDescriptionInstallations(fiches: FicheValidee[]): Promise<string> {
  return redigerTexte(
    "Rédige la section « Description des installations » : un paragraphe synthétique par type d'équipement présent, uniquement d'après les fiches validées ci-dessous.",
    fiches,
  );
}

/** US-42 : mise en forme des mesures décidées par l'ingénieur (+ ses notes). Aucune mesure ajoutée. */
export function mettreEnFormeMesures(
  mesures: { nom: string | null; economies_annuelles: number | null; cout_investissement: number | null; subvention: number | null; retour_annees: number | null }[],
  notes: string | null,
): Promise<string> {
  return redigerTexte(
    "Mets en forme la section « Mesures d'amélioration » : présente chaque mesure fournie avec ses chiffres (économies, investissement, subvention, retour simple) dans un style de rapport. N'ajoute AUCUNE mesure et NE RECALCULE rien.",
    { mesures, notes_ingenieur: notes },
  );
}
