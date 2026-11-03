"use client";

import { useEffect, useState } from "react";
import { acquerirVerrou, libererVerrou, forcerVerrou } from "@/app/dossiers/actions";

// Verrou d'édition ADVISOIRE (US-6) : avertit « X modifie cette fiche », ne bloque pas le formulaire.
// Acquiert au montage, re-sonde ~20 s (sert aussi de heartbeat : acquerirVerrou réétend mon expiration),
// libère au démontage. Fermeture brutale d'onglet → le verrou expire seul (DUREE_VERROU_MS).

type Etat = { etat: "libre" | "a_moi" | "autrui"; detenteurEmail?: string | null; estAdmin: boolean };

export function VerrouFiche({ ressource }: { ressource: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);

  useEffect(() => {
    let vivant = true;
    const sonder = () =>
      acquerirVerrou(ressource).then((r) => {
        if (vivant) setEtat(r);
      });
    sonder();
    const t = setInterval(sonder, 20_000);
    return () => {
      vivant = false;
      clearInterval(t);
      void libererVerrou(ressource);
    };
  }, [ressource]);

  if (!etat || etat.etat !== "autrui") return null;

  return (
    <div className="flex items-center justify-between gap-4 border border-error rounded-lg bg-[#fbeeec] px-4 py-2 text-sm text-error">
      <span>
        <strong>{etat.detenteurEmail ?? "Un autre utilisateur"}</strong> modifie cette fiche.
        Vos modifications pourraient écraser les siennes.
      </span>
      {etat.estAdmin && (
        <button
          type="button"
          className="text-xs font-medium underline cursor-pointer"
          onClick={() => forcerVerrou(ressource).then(setEtat)}
        >
          Forcer le déverrouillage
        </button>
      )}
    </div>
  );
}
