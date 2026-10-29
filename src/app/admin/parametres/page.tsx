import { createClient } from "@/lib/supabase/server";
import { updateParametre } from "@/app/dossiers/actions";
import { Button, Input, Label, StatusChip } from "@/components/ui";

export default async function ParametresPage() {
  const supabase = await createClient();

  const { data: gaz } = await supabase
    .from("parametres")
    .select("valeur, source, confirme, unite")
    .eq("cle", "facteur_conversion_gaz")
    .maybeSingle();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-ink">Paramètres</h1>
        <p className="text-sm text-muted mt-1">
          Réservé aux administrateurs. Modifier la valeur repasse le paramètre à « à confirmer ».
        </p>
      </div>

      <form action={updateParametre} className="border border-border rounded-lg bg-surface p-4 space-y-4">
        <input type="hidden" name="cle" value="facteur_conversion_gaz" />

        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Facteur de conversion du gaz</h2>
          {gaz && !gaz.confirme && <StatusChip status="a_confirmer" />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="valeur">Valeur</Label>
            <Input id="valeur" name="valeur" className="tabular-nums" defaultValue={gaz?.valeur ?? ""} />
          </div>
          <div>
            <Label htmlFor="unite">Unité</Label>
            <Input id="unite" value="kWh/m³" readOnly className="bg-bg text-muted" />
          </div>
        </div>

        <div>
          <Label htmlFor="source">Source</Label>
          <Input id="source" name="source" defaultValue={gaz?.source ?? ""} />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="confirme" defaultChecked={gaz?.confirme ?? false} />
          Confirmé
        </label>

        <Button type="submit">Enregistrer</Button>
      </form>
    </div>
  );
}
