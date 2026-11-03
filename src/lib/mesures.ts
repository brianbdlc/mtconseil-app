// Mesures d'amélioration + ROI (US-33/40). Saisie INGÉNIEUR (aucune IA, aucun chiffre inventé) ;
// le CODE calcule le retour simple. Module pur (miroir factures.ts/calc.ts) : retourne null quand
// incalculable, jamais de throw.

export type Mesure = {
  nom: string | null;
  economies_annuelles: number | null; // $/an
  cout_investissement: number | null; // $
  subvention: number | null; // $
};

/** Investissement net = coût − subvention. null si le coût est inconnu. */
export function investissementNet(m: Mesure): number | null {
  if (m.cout_investissement === null) return null;
  return m.cout_investissement - (m.subvention ?? 0);
}

/**
 * Retour simple en années = net / économies annuelles. null si économies ≤ 0 ou net ≤ 0
 * (pas de ROI sur données partielles ou incohérentes — ponytail: on écarte, on ne devine pas).
 */
export function retourAnnees(m: Mesure): number | null {
  const net = investissementNet(m);
  const eco = m.economies_annuelles;
  if (net === null || net <= 0 || eco === null || eco <= 0) return null;
  return net / eco;
}
