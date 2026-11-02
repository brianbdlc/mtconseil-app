// Matrice d'états partagée (UX + tests). L'ENFORCEMENT de sécurité vit en SQL
// (dossiers_statut_garde, migration phase5) — la base ne peut pas importer ce TS, donc la
// même matrice y est redite. Garder les deux en phase si on touche aux transitions.

export const SECTIONS = ["general", "sommaire", "inventaire", "bilan", "description"] as const;
export type Section = (typeof SECTIONS)[number];

export type Statut = "brouillon" | "soumis" | "approuve" | "exporte" | "a_corriger";

// Transitions initiées par un humain (quels boutons afficher). Le retour auto
// approuve|exporte→soumis (édition) et approuve→exporte (via enregistrer_export) sont imposés
// en base, pas des boutons — absents d'ici.
export const TRANSITIONS: { de: Statut; vers: Statut; role: "tous" | "admin" }[] = [
  { de: "brouillon", vers: "soumis", role: "tous" },
  { de: "a_corriger", vers: "soumis", role: "tous" },
  { de: "soumis", vers: "soumis", role: "tous" }, // re-soumission après retour auto (si périmé)
  { de: "soumis", vers: "approuve", role: "admin" },
  { de: "soumis", vers: "a_corriger", role: "admin" },
];

export function peutTransitionner(
  de: Statut,
  vers: Statut,
  ctx: { admin: boolean; perime: boolean },
): boolean {
  const t = TRANSITIONS.find((t) => t.de === de && t.vers === vers);
  if (!t) return false;
  if (t.role === "admin" && !ctx.admin) return false;
  if (de === "soumis" && vers === "soumis" && !ctx.perime) return false;
  return true;
}
