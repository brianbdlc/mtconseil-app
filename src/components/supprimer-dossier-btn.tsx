"use client";

import { supprimerDossier } from "@/app/dossiers/actions";

// Bouton de suppression (admin) avec confirmation. La vraie garde est is_admin() côté action/RLS.
export function SupprimerDossierBtn({ dossierId, client }: { dossierId: string; client: string }) {
  return (
    <form
      action={supprimerDossier}
      onSubmit={(e) => {
        if (
          !confirm(
            `Supprimer définitivement le dossier « ${client} » et tous ses fichiers ? Cette action est irréversible.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="dossier_id" value={dossierId} />
      <button type="submit" className="text-xs text-error hover:underline cursor-pointer">
        Supprimer
      </button>
    </form>
  );
}
