import { createClient } from "@/lib/supabase/server";
import {
  createValeurDefaut,
  updateValeurDefaut,
  deleteValeurDefaut,
} from "@/app/dossiers/actions";
import { POSTES } from "@/lib/calc";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";

type ValeurDefaut = {
  id: string;
  type: string;
  poste: string;
  facteur_charge: number | null;
  confirme: boolean;
};

export default async function ValeursDefautPage() {
  const supabase = await createClient();

  const { data: valeurs } = await supabase
    .from("valeurs_defaut")
    .select("id, type, poste, facteur_charge, confirme")
    .order("type", { ascending: true })
    .returns<ValeurDefaut[]>();

  // Compte des référents (pour désactiver la suppression). FK restrict = vrai garde-fou.
  const { data: refs } = await supabase.from("equipements").select("type_id");
  const refCount = new Map<string, number>();
  for (const r of refs ?? []) {
    if (r.type_id) refCount.set(r.type_id, (refCount.get(r.type_id) ?? 0) + 1);
  }

  const posteOptions = POSTES.map((p) => (
    <option key={p.code} value={p.code}>
      {p.label}
    </option>
  ));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold text-ink">Valeurs par défaut</h1>
        <p className="text-sm text-muted mt-1">
          Table éditable par tous les ingénieurs. Toute modification repasse la ligne à « à
          confirmer » (confirmation avec Luis reportée à l&apos;approbation du rapport).
        </p>
      </div>

      {/* Ajouter un type */}
      <section className="border border-border rounded-lg bg-surface p-4">
        <h2 className="text-[15px] font-semibold text-ink mb-3">Ajouter un type</h2>
        <form action={createValeurDefaut} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label htmlFor="type">Type</Label>
            <Input id="type" name="type" required />
          </div>
          <div>
            <Label htmlFor="poste">Poste</Label>
            <Select id="poste" name="poste" defaultValue="">
              <option value="" disabled>
                —
              </option>
              {posteOptions}
            </Select>
          </div>
          <div>
            <Label htmlFor="facteur_charge">Facteur de charge</Label>
            <Input id="facteur_charge" name="facteur_charge" className="tabular-nums" placeholder="0 – 1" />
          </div>
          <Button type="submit">Ajouter</Button>
        </form>
      </section>

      <div className="overflow-x-auto border border-border rounded-lg bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Poste</th>
              <th className="px-4 py-2 font-medium">Facteur de charge</th>
              <th className="px-4 py-2 font-medium">État</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(valeurs ?? []).map((v) => {
              const n = refCount.get(v.id) ?? 0;
              return (
                <tr key={v.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2" colSpan={3}>
                    <form
                      action={updateValeurDefaut}
                      className="grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center"
                    >
                      <input type="hidden" name="id" value={v.id} />
                      <Input name="type" defaultValue={v.type} />
                      <Select name="poste" defaultValue={v.poste}>
                        {posteOptions}
                      </Select>
                      <Input
                        name="facteur_charge"
                        className="tabular-nums"
                        placeholder="facteur manquant"
                        defaultValue={v.facteur_charge ?? ""}
                      />
                      <Button type="submit" variant="secondary">
                        Enregistrer
                      </Button>
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    {!v.confirme && <StatusChip status="a_confirmer" />}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {n > 0 ? (
                      <span className="text-xs text-muted">utilisé par {n} équipement(s)</span>
                    ) : (
                      <form action={deleteValeurDefaut}>
                        <input type="hidden" name="id" value={v.id} />
                        <Button type="submit" variant="secondary">
                          Supprimer
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!valeurs || valeurs.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Aucun type.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
