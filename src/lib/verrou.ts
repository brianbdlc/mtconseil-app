// Verrou d'édition advisoire (US-6) : une ressource = une ligne dans `verrous`. Logique pure,
// testée ici ; l'acquisition/libération passe par les server actions (actions.ts) et la RLS.

export const DUREE_VERROU_MS = 5 * 60_000; // 5 min : au-delà, le verrou est considéré abandonné.

export type EtatVerrou = "libre" | "a_moi" | "autrui";

export function estExpire(expireLe: string, now: number): boolean {
  return new Date(expireLe).getTime() <= now;
}

export function etatVerrou(
  row: { detenteur: string | null; expire_le: string } | null,
  moiId: string | null,
  now: number,
): EtatVerrou {
  if (!row || estExpire(row.expire_le, now)) return "libre";
  if (row.detenteur === moiId) return "a_moi";
  return "autrui";
}
