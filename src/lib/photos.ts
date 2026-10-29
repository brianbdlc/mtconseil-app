// Règle fondatrice : LE CODE regroupe et vérifie. L'IA ne fait que lire une plaque (src/lib/plaque.ts).
// Pas de table photo_groupes : un groupe CONFIRMÉ = les photos partageant un equipement_id.
// Les groupes PROPOSÉS sont calculés ICI, à la volée, sur les photos non encore assignées.
// ponytail: si un groupe « confirmé mais non assigné » devient nécessaire, ajouter la table alors.

export type PhotoLite = {
  id: string;
  prise_le: string | null; // ISO (EXIF DateTimeOriginal), null => secours par nom
  nom_original: string | null;
};

/**
 * Regroupe les photos par heure de prise de vue. Nouveau groupe quand l'écart entre deux
 * prises consécutives dépasse `seuilSecondes`. Les photos sans `prise_le` sont triées par
 * `nom_original` (secours) et placées en groupes de fin.
 *
 * `seuilSecondes` = BOUTON DE CALIBRATION : 90 s couvre une plaque + ses détails rapprochés,
 * sans fusionner deux équipements photographiés à la suite. ponytail: seuil réglable — si les
 * lots réels fusionnent/éclatent mal, c'est le seul chiffre à bouger.
 */
export function grouperPhotos(
  photos: PhotoLite[],
  { seuilSecondes = 90 }: { seuilSecondes?: number } = {},
): PhotoLite[][] {
  const avecDate = photos
    .filter((p) => p.prise_le)
    .sort((a, b) => Date.parse(a.prise_le!) - Date.parse(b.prise_le!));
  const sansDate = photos
    .filter((p) => !p.prise_le)
    .sort((a, b) => (a.nom_original ?? "").localeCompare(b.nom_original ?? ""));

  const groupes: PhotoLite[][] = [];
  let courant: PhotoLite[] = [];
  let precedent: number | null = null;

  for (const p of avecDate) {
    const t = Date.parse(p.prise_le!);
    if (precedent !== null && (t - precedent) / 1000 > seuilSecondes) {
      groupes.push(courant);
      courant = [];
    }
    courant.push(p);
    precedent = t;
  }
  if (courant.length) groupes.push(courant);

  // Secours : photos sans EXIF regroupées par nom — un seul groupe (on ne devine pas de coupure).
  if (sansDate.length) groupes.push(sansDate);

  return groupes;
}

/**
 * Vérifs du code (US-16) : bornes de plausibilité. Pas de devinette, juste un drapeau.
 * Renvoie { ok } — `ok:false` => suspect (à signaler, pas à corriger automatiquement).
 */
export function verifierPlausibilite(params: {
  champ: "annee" | "puissance";
  valeur: number;
  unite?: string;
}): { ok: boolean } {
  const { champ, valeur } = params;
  if (champ === "annee") {
    const max = new Date().getFullYear() + 1;
    return { ok: valeur >= 1950 && valeur <= max };
  }
  // puissance : strictement positive, borne haute large (couvre kW industriels ; HP/BTU/h aussi).
  return { ok: valeur > 0 && valeur < 1_000_000 };
}
