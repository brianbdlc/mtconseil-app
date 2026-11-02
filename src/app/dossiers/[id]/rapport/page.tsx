import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { soumettreDossier } from "../../actions";
import {
  bilanEnergetique,
  gazEnKwh,
  intensiteKwhM2,
  libellePoste,
  ligneEquipement,
  type LigneBilan,
} from "@/lib/calc";
import {
  controleCoherence,
  controleCompletude,
  sommaireExecutif,
  type EquipementAssembleur,
} from "@/lib/assembleur";
import { Button, StatusChip } from "@/components/ui";

function fmt(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);
}

export default async function RapportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: dossier } = await supabase
    .from("dossiers")
    .select(
      "id, client, adresse, statut, superficie_valeur, superficie_unite, annee_construction, usage, gaz_quantite, gaz_unite",
    )
    .eq("id", id)
    .single();
  if (!dossier) notFound();

  const { data: equipements } = await supabase
    .from("equipements")
    .select(
      "id, nom, puissance_valeur, puissance_unite, heures_par_an, facteur_charge, type_id, type:valeurs_defaut(poste, confirme, facteur_charge), marque_confiance, marque_validated, modele_confiance, modele_validated, puissance_confiance, puissance_validated, annee_confiance, annee_validated",
    )
    .eq("dossier_id", id)
    .order("created_at", { ascending: true })
    .returns<EquipementAssembleur[]>();

  const { data: parametres } = await supabase
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["facteur_conversion_gaz", "seuil_coherence"]);
  const facteurGaz = parametres?.find((p) => p.cle === "facteur_conversion_gaz")?.valeur ?? null;
  const seuilCoherence = parametres?.find((p) => p.cle === "seuil_coherence")?.valeur ?? 20;

  // Recalcul via calc.ts (source unique, comme le hub).
  const eqs = equipements ?? [];
  const bilan = bilanEnergetique(eqs.map((e) => ligneEquipement(e)) as LigneBilan[]);
  const gazKwh =
    dossier.gaz_quantite !== null && dossier.gaz_unite
      ? gazEnKwh({ quantite: dossier.gaz_quantite, unite: dossier.gaz_unite, facteurM3: facteurGaz })
      : null;
  const intensite = intensiteKwhM2(bilan.totalEquipementsKwh, dossier.superficie_valeur, dossier.superficie_unite);

  const completude = controleCompletude(eqs, dossier);
  // Phase 6 fournira le total factures (élec+gaz). D'ici là : non disponible.
  const coherence = controleCoherence(bilan.totalEquipementsKwh, null, seuilCoherence);
  const sommaire = sommaireExecutif({ dossier, bilan, intensite, gazKwh });

  // L'admin peut autoriser une soumission incomplète avec une raison. Les ingénieurs sont bloqués.
  const { data: estAdmin } = await supabase.rpc("is_admin");

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/dossiers/${id}`} className="text-xs text-muted hover:text-ink">
          ← {dossier.client}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-[22px] font-semibold text-ink">Rapport — contrôles avant soumission</h1>
          <StatusChip status={dossier.statut} />
        </div>
      </div>

      {/* 1. Complétude (US-35/36) */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Complétude</h2>
        <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
          {completude.problemes.length === 0 && !completude.superficieAbsente ? (
            <p className="text-sm text-success">✓ Prêt à soumettre : aucun point bloquant.</p>
          ) : (
            <div className="space-y-3">
              {completude.superficieAbsente && (
                <p className="text-sm text-[#B42318]">
                  Superficie du bâtiment absente —{" "}
                  <Link href={`/dossiers/${id}`} className="underline">à renseigner</Link>.
                </p>
              )}
              {completude.problemes.map((p) => (
                <div key={p.equipementId} className="text-sm">
                  <Link href={`/dossiers/${id}/equipements/${p.equipementId}`} className="text-primary hover:underline">
                    {p.nom ?? "Équipement sans nom"}
                  </Link>
                  <ul className="list-disc ml-5 text-[#B42318] mt-1">
                    {p.messages.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted">
            {completude.nbManuels} équipement(s) entièrement saisi(s) à la main (aucune lecture IA).
          </p>

          {completude.avertissements.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted mb-1">Avertissements (non bloquants) :</p>
              <ul className="text-xs text-[#9A6410] space-y-1">
                {completude.avertissements.map((a, i) => (
                  <li key={i}>
                    <Link href={`/dossiers/${id}/equipements/${a.equipementId}`} className="underline">
                      {a.nom ?? "Équipement"}
                    </Link>{" "}
                    — {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* 2. Cohérence (US-37) — factures en Phase 6 */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Cohérence estimé vs factures</h2>
        <div className="border border-border rounded-lg bg-surface p-4 text-sm text-muted">
          {coherence.disponible ? (
            <p className={coherence.depasse ? "text-[#B42318]" : "text-ink"}>
              Écart de {fmt(coherence.ecartPct ?? null)} % (seuil {seuilCoherence} %) —{" "}
              {coherence.depasse ? "au-delà du seuil." : "dans le seuil."}
            </p>
          ) : (
            <p>Non disponible — aucune facture (Phase 6). Seuil configuré : {seuilCoherence} %.</p>
          )}
        </div>
      </section>

      {/* 3. Sommaire exécutif + tableau résumé (rempli par le code) */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Sommaire exécutif</h2>
        <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
          <p className="text-sm text-ink leading-relaxed">{sommaire.texte}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {sommaire.lignesResume.map((l) => (
                  <tr key={l.label} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted">{l.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{l.valeur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border">
                  <th className="px-3 py-2 font-medium">Poste</th>
                  <th className="px-3 py-2 font-medium text-right">kWh/an</th>
                  <th className="px-3 py-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {bilan.parPoste.map((p) => (
                  <tr key={p.poste} className="border-b border-border">
                    <td className="px-3 py-2">{libellePoste(p.poste)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.kwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(p.pct)} %</td>
                  </tr>
                ))}
                <tr className="font-semibold text-ink">
                  <td className="px-3 py-2">Total (toutes énergies)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(bilan.totalEquipementsKwh)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">100 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. Soumettre */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Soumission</h2>
        <form action={soumettreDossier} className="border border-border rounded-lg bg-surface p-4 space-y-4">
          <input type="hidden" name="dossier_id" value={id} />
          {!completude.bloquant ? (
            <Button type="submit">Soumettre</Button>
          ) : estAdmin ? (
            <div className="space-y-3">
              <p className="text-sm text-[#B42318]">
                Le dossier est incomplet. En tant qu'administrateur, vous pouvez autoriser une soumission
                incomplète en justifiant.
              </p>
              <textarea
                name="raison"
                required
                rows={3}
                placeholder="Raison de la soumission incomplète (tracée dans le journal)"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink"
              />
              <Button type="submit" variant="secondary">Autoriser une soumission incomplète</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button type="submit" disabled>Soumettre</Button>
              <p className="text-sm text-muted">
                Soumission bloquée : corrigez les points ci-dessus ou demandez à un administrateur.
              </p>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
