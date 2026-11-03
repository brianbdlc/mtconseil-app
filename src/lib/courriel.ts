// Envoi de courriel best-effort via l'API Resend (fetch direct, pas la dépendance `resend`).
// Un échec est LOGGÉ, jamais propagé : une notification ratée ne doit pas faire échouer une
// transition de statut. Clés fournies au build : RESEND_API_KEY, COURRIEL_EXPEDITEUR,
// NEXT_PUBLIC_SITE_URL. Sans clé, l'envoi est ignoré silencieusement (log info).

export function lienDossier(dossierId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/dossiers/${dossierId}`;
}

export async function envoyerCourriel({
  to,
  sujet,
  html,
}: {
  to: string | null | undefined;
  sujet: string;
  html: string;
}): Promise<void> {
  const cle = process.env.RESEND_API_KEY;
  const from = process.env.COURRIEL_EXPEDITEUR;
  if (!cle || !from) {
    console.info("[courriel] RESEND_API_KEY/COURRIEL_EXPEDITEUR absents — envoi ignoré :", sujet);
    return;
  }
  if (!to) {
    console.info("[courriel] destinataire inconnu — envoi ignoré :", sujet);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: sujet, html }),
    });
    if (!res.ok) {
      console.error("[courriel] échec Resend", res.status, await res.text());
    }
  } catch (e) {
    console.error("[courriel] exception", e);
  }
}
