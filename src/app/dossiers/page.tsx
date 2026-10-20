import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createDossier } from "./actions";
import { Button, Input, Label, StatusChip } from "@/components/ui";

type DossierRow = {
  id: string;
  client: string;
  adresse: string | null;
  statut: string;
  created_at: string;
  ingenieur: { email: string | null } | null;
};

export default async function DossiersPage() {
  const supabase = await createClient();
  const { data: dossiers } = await supabase
    .from("dossiers")
    .select(
      "id, client, adresse, statut, created_at, ingenieur:profiles!dossiers_ingenieur_id_fkey(email)",
    )
    .order("created_at", { ascending: false })
    .returns<DossierRow[]>();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-[22px] font-semibold text-ink mb-4">Dossiers</h1>
        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Adresse</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Ingénieur</th>
              </tr>
            </thead>
            <tbody>
              {(dossiers ?? []).map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border last:border-0 hover:bg-bg"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/dossiers/${d.id}`}
                      className="text-primary hover:underline"
                    >
                      {d.client}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted">{d.adresse ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={d.statut} />
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {d.ingenieur?.email ?? "—"}
                  </td>
                </tr>
              ))}
              {(!dossiers || dossiers.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    Aucun dossier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-md">
        <h2 className="text-[15px] font-semibold text-ink mb-3">
          Nouveau dossier
        </h2>
        <form action={createDossier} className="space-y-3">
          <div>
            <Label htmlFor="client">Client</Label>
            <Input id="client" name="client" required />
          </div>
          <div>
            <Label htmlFor="adresse">Adresse</Label>
            <Input id="adresse" name="adresse" />
          </div>
          <Button type="submit">Créer le dossier</Button>
        </form>
      </section>
    </div>
  );
}
