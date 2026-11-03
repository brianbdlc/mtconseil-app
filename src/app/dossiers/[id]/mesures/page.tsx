"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { retourAnnees, investissementNet, type Mesure } from "@/lib/mesures";
import { updateMesure, supprimerMesure } from "../../actions";
import { Button, Input, Label } from "@/components/ui";
import { VerrouFiche } from "@/components/verrou-fiche";

type MesureRow = Mesure & { id: string };

const COLS = "id, nom, economies_annuelles, cout_investissement, subvention";

function fmt(n: number | null, frac = 0): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: frac }).format(n);
}

export default function MesuresPage() {
  const { id: dossierId } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [mesures, setMesures] = useState<MesureRow[]>([]);

  const recharger = useCallback(async () => {
    const { data } = await supabase
      .from("mesures")
      .select(COLS)
      .eq("dossier_id", dossierId)
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });
    setMesures((data ?? []) as MesureRow[]);
  }, [supabase, dossierId]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function ajouter() {
    const fd = new FormData();
    fd.set("dossier_id", dossierId);
    await updateMesure(fd); // ligne vide à compléter
    await recharger();
  }

  return (
    <div className="space-y-8">
      <VerrouFiche ressource={`mesure:${dossierId}`} />
      <div>
        <Link href={`/dossiers/${dossierId}/rapport`} className="text-xs text-muted hover:text-ink">
          ← Rapport
        </Link>
        <h1 className="text-[22px] font-semibold text-ink mt-2">Mesures d'amélioration</h1>
        <p className="text-sm text-muted">
          Saisie de l'ingénieur. Le code calcule le retour simple (investissement net ÷ économies
          annuelles) ; aucune valeur n'est inventée.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">
            {mesures.length} mesure{mesures.length > 1 ? "s" : ""}
          </h2>
          <Button type="button" variant="secondary" onClick={ajouter}>
            + Mesure
          </Button>
        </div>
        {mesures.length === 0 && <p className="text-sm text-muted">Aucune mesure.</p>}
        {mesures.map((m) => (
          <MesureCard key={m.id} mesure={m} dossierId={dossierId} onChanged={recharger} fmt={fmt} />
        ))}
      </section>
    </div>
  );
}

function MesureCard({
  mesure,
  dossierId,
  onChanged,
  fmt,
}: {
  mesure: MesureRow;
  dossierId: string;
  onChanged: () => Promise<void>;
  fmt: (n: number | null, frac?: number) => string;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function enregistrer(formData: FormData) {
    formData.set("id", mesure.id);
    formData.set("dossier_id", dossierId);
    await run(() => updateMesure(formData));
  }

  const net = investissementNet(mesure);
  const retour = retourAnnees(mesure);

  return (
    <form action={enregistrer} className="border border-border rounded-lg bg-surface p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2">
          <Label htmlFor={`nom-${mesure.id}`}>Mesure</Label>
          <Input id={`nom-${mesure.id}`} name="nom" defaultValue={mesure.nom ?? ""} />
        </div>
        <div>
          <Label htmlFor={`eco-${mesure.id}`}>Économies ($/an)</Label>
          <Input id={`eco-${mesure.id}`} name="economies_annuelles" className="tabular-nums" defaultValue={mesure.economies_annuelles ?? ""} />
        </div>
        <div>
          <Label htmlFor={`cout-${mesure.id}`}>Investissement ($)</Label>
          <Input id={`cout-${mesure.id}`} name="cout_investissement" className="tabular-nums" defaultValue={mesure.cout_investissement ?? ""} />
        </div>
        <div>
          <Label htmlFor={`subv-${mesure.id}`}>Subvention ($)</Label>
          <Input id={`subv-${mesure.id}`} name="subvention" className="tabular-nums" defaultValue={mesure.subvention ?? ""} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex gap-6 text-sm text-muted">
          <span>
            Net : <span className="text-ink tabular-nums">{fmt(net)} $</span>
          </span>
          <span>
            Retour :{" "}
            <span className="text-ink tabular-nums">
              {retour === null ? "— (non calculable)" : `${fmt(retour, 2)} ans`}
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => supprimerMesure(mesure.id, dossierId))}
          >
            Supprimer
          </Button>
          <Button type="submit" variant="secondary" disabled={busy}>
            Enregistrer
          </Button>
        </div>
      </div>
    </form>
  );
}
