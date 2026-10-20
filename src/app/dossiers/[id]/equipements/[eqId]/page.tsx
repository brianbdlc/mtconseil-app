import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateEquipement } from "../../../actions";
import { UNITES } from "@/lib/calc";
import { Button, Input, Label, Select } from "@/components/ui";

export default async function EquipementPage({
  params,
}: {
  params: Promise<{ id: string; eqId: string }>;
}) {
  const { id, eqId } = await params;
  const supabase = await createClient();

  const { data: eq } = await supabase
    .from("equipements")
    .select("*")
    .eq("id", eqId)
    .single();
  if (!eq) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <Link
        href={`/dossiers/${id}`}
        className="text-xs text-muted hover:text-ink"
      >
        ← Dossier
      </Link>

      <h1 className="text-[22px] font-semibold text-ink">Fiche équipement</h1>

      <form action={updateEquipement} className="space-y-4">
        <input type="hidden" name="id" value={eqId} />
        <input type="hidden" name="dossier_id" value={id} />

        <div>
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" name="nom" defaultValue={eq.nom ?? ""} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="puissance_valeur">Puissance</Label>
            <Input
              id="puissance_valeur"
              name="puissance_valeur"
              type="number"
              step="any"
              className="font-mono"
              defaultValue={eq.puissance_valeur ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="puissance_unite">Unité</Label>
            <Select
              id="puissance_unite"
              name="puissance_unite"
              defaultValue={eq.puissance_unite ?? ""}
            >
              <option value="">—</option>
              {UNITES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="heures_par_an">Heures / an</Label>
            <Input
              id="heures_par_an"
              name="heures_par_an"
              type="number"
              step="any"
              className="font-mono"
              defaultValue={eq.heures_par_an ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="facteur_charge">Facteur de charge</Label>
            <Input
              id="facteur_charge"
              name="facteur_charge"
              type="number"
              step="any"
              min="0"
              max="1"
              className="font-mono"
              defaultValue={eq.facteur_charge ?? ""}
            />
          </div>
        </div>

        <div className="border border-border rounded-md bg-bg px-4 py-3">
          <div className="text-xs text-muted">
            Consommation annuelle (calculée par le code)
          </div>
          <div className="font-mono text-lg text-ink">
            {eq.conso_kwh_an !== null
              ? `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(eq.conso_kwh_an)} kWh/an`
              : "— (champ incomplet)"}
          </div>
        </div>

        <Button type="submit">Enregistrer</Button>
      </form>
    </div>
  );
}
