// Parsing numérique fr-CA. Un champ incertain ne doit JAMAIS être effacé silencieusement :
// vide => null ; ambigu ou invalide => throw (l'erreur remonte et bloque l'enregistrement).

// Ambigu : "12,500" peut être 12500 (séparateur de milliers) ou 12,5 → on refuse.
const AMBIGU = /^\d{1,3}(,\d{3})+$/;

/** Parse une valeur fr-CA en nombre. vide => null ; ambigu/invalide => throw. */
export function numFr(v: FormDataEntryValue | string | null | undefined): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;

  if (AMBIGU.test(s)) {
    throw new Error(
      `Valeur ambiguë : « ${s} ». Écrivez 12500 ou 12 500 (sans séparateur), ou 12,5 pour une décimale.`,
    );
  }

  // Retirer les espaces (normal, insécable U+00A0, fine insécable U+202F), virgule décimale → point.
  const normalise = s.replace(/[\s  ]/g, "").replace(",", ".");
  const n = Number(normalise);
  if (!Number.isFinite(n)) {
    throw new Error(`Valeur invalide : « ${s} ».`);
  }
  return n;
}
