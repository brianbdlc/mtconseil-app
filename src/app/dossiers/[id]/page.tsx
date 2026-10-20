import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEquipement } from "../actions";
import { Button, StatusChip } from "@/components/ui";

type Equipement = {
  id: string;
  nom: string | null;
  puissance_valeur: number | null;
  puissance_unite: string | null;
  heures_par_an: number | null;
  facteur_charge: number | null;
  conso_kwh_an: number | null;
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);
}

export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("id, client, adresse, statut")
    .eq("id", id)
    .single();
  if (!dossier) notFound();

  const { data: equipements } = await supabase
    .from("equipements")
    .select(
      "id, nom, puissance_valeur, puissance_unite, heures_par_an, facteur_charge, conso_kwh_an",
    )
    .eq("dossier_id", id)
    .order("created_at", { ascending: true })
    .returns<Equipement[]>();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dossiers" className="text-xs text-muted hover:text-ink">
          ← Dossiers
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-[22px] font-semibold text-ink">
              {dossier.client}
            </h1>
            <p className="text-sm text-muted">{dossier.adresse ?? "—"}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusChip status={dossier.statut} />
            <a href={`/dossiers/${id}/export`}>
              <Button variant="secondary">Exporter .docx</Button>
            </a>
          </div>
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-ink">Équipements</h2>
          <form action={createEquipement}>
            <input type="hidden" name="dossier_id" value={id} />
            <Button type="submit">+ Ajouter un équipement</Button>
          </form>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Puissance</th>
                <th className="px-4 py-2 font-medium">Heures/an</th>
                <th className="px-4 py-2 font-medium">Fact. charge</th>
                <th className="px-4 py-2 font-medium">Conso (kWh/an)</th>
              </tr>
            </thead>
            <tbody>
              {(equipements ?? []).map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border last:border-0 hover:bg-bg"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/dossiers/${id}/equipements/${e.id}`}
                      className="text-primary hover:underline"
                    >
                      {e.nom ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {e.puissance_valeur ?? "—"} {e.puissance_unite ?? ""}
                  </td>
                  <td className="px-4 py-2 font-mono">{e.heures_par_an ?? "—"}</td>
                  <td className="px-4 py-2 font-mono">
                    {e.facteur_charge ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono">{fmt(e.conso_kwh_an)}</td>
                </tr>
              ))}
              {(!equipements || equipements.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Aucun équipement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
