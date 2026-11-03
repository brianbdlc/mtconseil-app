import { createClient } from "@/lib/supabase/server";
import { majCompte } from "@/app/dossiers/actions";
import { Button, Select } from "@/components/ui";

type Compte = {
  id: string;
  email: string | null;
  role: string;
  actif: boolean;
  peut_modifier: boolean;
  peut_valider: boolean;
  peut_exporter: boolean;
};

export default async function ComptesPage() {
  const supabase = await createClient();
  const { data: comptes } = await supabase
    .from("profiles")
    .select("id, email, role, actif, peut_modifier, peut_valider, peut_exporter")
    .order("email", { ascending: true })
    .returns<Compte[]>();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-ink">Comptes</h1>
        <p className="text-sm text-muted mt-1">
          Réservé aux administrateurs. Un compte désactivé ne peut plus rien lire ni écrire ;
          son historique reste. Les nouveaux comptes se créent via le dashboard Supabase.
        </p>
      </div>

      <div className="space-y-3">
        {(comptes ?? []).map((c) => (
          <form
            key={c.id}
            action={majCompte}
            className="border border-border rounded-lg bg-surface p-4 flex flex-wrap items-end gap-4"
          >
            <input type="hidden" name="id" value={c.id} />
            <div className="min-w-[200px] flex-1">
              <div className="text-xs font-medium text-muted mb-1">Courriel</div>
              <div className="text-sm text-ink truncate">{c.email ?? "—"}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-muted mb-1">Rôle</div>
              <Select name="role" defaultValue={c.role} className="w-32">
                <option value="engineer">Ingénieur</option>
                <option value="admin">Admin</option>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="actif" defaultChecked={c.actif} /> Actif
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="peut_modifier" defaultChecked={c.peut_modifier} /> Modifier
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="peut_valider" defaultChecked={c.peut_valider} /> Valider
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="peut_exporter" defaultChecked={c.peut_exporter} /> Exporter
            </label>

            <Button type="submit">Enregistrer</Button>
          </form>
        ))}
        {(!comptes || comptes.length === 0) && (
          <p className="text-sm text-muted">Aucun compte.</p>
        )}
      </div>
    </div>
  );
}
