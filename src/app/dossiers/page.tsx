import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createDossier } from "./actions";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";
import { SupprimerDossierBtn } from "@/components/supprimer-dossier-btn";

type DossierRow = {
  id: string;
  client: string;
  adresse: string | null;
  statut: string;
  created_at: string;
  ingenieur_id: string | null;
  ingenieur: { email: string | null } | null;
};

const STATUTS = ["brouillon", "soumis", "approuve", "exporte", "a_corriger"] as const;
const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  approuve: "Approuvé",
  exporte: "Exporté",
  a_corriger: "À corriger",
};

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; ingenieur?: string }>;
}) {
  const { q, statut, ingenieur } = await searchParams;
  const supabase = await createClient();

  const { data: estAdmin } = await supabase.rpc("is_admin");

  // Ingénieurs pour le filtre (tous les profils ayant déjà un dossier ou non : liste complète).
  const { data: ingenieurs } = await supabase
    .from("profiles")
    .select("id, email")
    .order("email", { ascending: true });

  let query = supabase
    .from("dossiers")
    .select(
      "id, client, adresse, statut, created_at, ingenieur_id, ingenieur:profiles!dossiers_ingenieur_id_fkey(email)",
    )
    .order("created_at", { ascending: false });

  // Neutralise la grammaire PostgREST .or() (virgule/parenthèses/étoile/backslash) avant interpolation.
  const qSafe = q?.replace(/[,()*\\]/g, " ").trim();
  if (qSafe) query = query.or(`client.ilike.%${qSafe}%,adresse.ilike.%${qSafe}%`);
  if (statut && STATUTS.includes(statut as (typeof STATUTS)[number])) query = query.eq("statut", statut);
  if (ingenieur) query = query.eq("ingenieur_id", ingenieur);

  const { data: dossiers } = await query.returns<DossierRow[]>();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-[22px] font-semibold text-ink mb-4">Dossiers</h1>

        <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="q">Recherche (client ou adresse)</Label>
            <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Nom du client, adresse…" />
          </div>
          <div>
            <Label htmlFor="statut">Statut</Label>
            <Select id="statut" name="statut" defaultValue={statut ?? ""} className="w-40">
              <option value="">Tous</option>
              {STATUTS.map((s) => (
                <option key={s} value={s}>
                  {STATUT_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ingenieur">Ingénieur</Label>
            <Select id="ingenieur" name="ingenieur" defaultValue={ingenieur ?? ""} className="w-48">
              <option value="">Tous</option>
              {(ingenieurs ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.email ?? i.id}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
        </form>

        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Adresse</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Ingénieur</th>
                {estAdmin && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {(dossiers ?? []).map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-4 py-2">
                    <Link href={`/dossiers/${d.id}`} className="text-primary hover:underline">
                      {d.client}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted">{d.adresse ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={d.statut} />
                  </td>
                  <td className="px-4 py-2 text-muted">{d.ingenieur?.email ?? "—"}</td>
                  {estAdmin && (
                    <td className="px-4 py-2 text-right">
                      <SupprimerDossierBtn dossierId={d.id} client={d.client} />
                    </td>
                  )}
                </tr>
              ))}
              {(!dossiers || dossiers.length === 0) && (
                <tr>
                  <td colSpan={estAdmin ? 5 : 4} className="px-4 py-6 text-center text-muted">
                    Aucun dossier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-md">
        <h2 className="text-[15px] font-semibold text-ink mb-3">Nouveau dossier</h2>
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
