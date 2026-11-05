// Registre des révisions du rapport (US-59). Purement DESCRIPTIF : n'entre dans AUCUN calcul.
// `numero` est un texte libre ; l'ordre d'affichage est porté par `ordre` (entier).

export type Revision = {
  numero: string | null;
  date: string | null;
  description: string | null;
  ordre: number;
};

/** Tri d'affichage : par `ordre` croissant, puis par `numero` (stable, sans muter l'entrée). */
export function trierRevisions(rs: Revision[]): Revision[] {
  return [...rs].sort(
    (a, b) => a.ordre - b.ordre || (a.numero ?? "").localeCompare(b.numero ?? ""),
  );
}
