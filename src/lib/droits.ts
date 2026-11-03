// Droits par personne (Phase 8). Miroir lisible des fonctions SQL peut_modifier()/peut_valider()/
// peut_exporter() : admin ⇒ tout, compte désactivé ⇒ rien, sinon le drapeau du profil. Pur, testé.

export type Action = "modifier" | "valider" | "exporter";

export type Droits = {
  role: string;
  actif: boolean;
  peut_modifier: boolean;
  peut_valider: boolean;
  peut_exporter: boolean;
};

export function peut(p: Droits, action: Action): boolean {
  if (!p.actif) return false;
  if (p.role === "admin") return true;
  if (action === "modifier") return p.peut_modifier;
  if (action === "valider") return p.peut_valider;
  return p.peut_exporter;
}
