import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  soumettreDossier,
  approuverDossier,
  renvoyerDossier,
  updateTexteSection,
  validerTexteSection,
  redigerSection,
} from "../../actions";
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
import { SECTIONS, NARRATIVE_SECTIONS, type NarrativeSection } from "@/lib/statuts";
import { totalFacturesKwh, type Facture } from "@/lib/factures";
import type { Snapshot } from "@/lib/rapport";
import { Button, StatusChip } from "@/components/ui";
import { VerrouFiche } from "@/components/verrou-fiche";

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);
}

const SECTION_LABELS: Record<(typeof SECTIONS)[number], string> = {
  general: "Général",
  sommaire: "Sommaire exécutif",
  inventaire: "Inventaire des équipements",
  bilan: "Bilan énergétique",
  description: "Description du bâtiment",
};

// Tableaux bilan + sommaire, partagés entre l'affichage « en direct » et « gelé ».
function BilanEtSommaire({
  sommaire,
  bilan,
}: {
  sommaire: { texte: string; lignesResume: { label: string; valeur: string }[] };
  bilan: { parPoste: { poste: string; kwh: number; pct: number }[]; totalEquipementsKwh: number };
}) {
  return (
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
  );
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
      "id, client, adresse, statut, snapshot_perime, rapport_snapshot, commentaires, superficie_valeur, superficie_unite, annee_construction, usage, gaz_quantite, gaz_unite",
    )
    .eq("id", id)
    .single();
  if (!dossier) notFound();

  const { data: estAdmin } = await supabase.rpc("is_admin");
  const fige = ["soumis", "approuve", "exporte"].includes(dossier.statut);
  const snapshot = (dossier.rapport_snapshot ?? null) as Snapshot | null;

  return (
    <div className="space-y-8">
      <VerrouFiche ressource={`rapport:${id}`} />
      <div>
        <Link href={`/dossiers/${id}`} className="text-xs text-muted hover:text-ink">
          ← {dossier.client}
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-[22px] font-semibold text-ink">Rapport</h1>
          <StatusChip status={dossier.statut} />
        </div>
      </div>

      {fige && snapshot ? (
        <FrozenReport
          id={id}
          dossier={dossier}
          snapshot={snapshot}
          estAdmin={!!estAdmin}
          supabase={supabase}
        />
      ) : (
        <LiveReport id={id} dossier={dossier} supabase={supabase} estAdmin={!!estAdmin} />
      )}
    </div>
  );
}

// ───────────────────────── Rapport gelé (soumis/approuve/exporte) ─────────────────────────
async function FrozenReport({
  id,
  dossier,
  snapshot,
  estAdmin,
  supabase,
}: {
  id: string;
  dossier: { statut: string; snapshot_perime: boolean; commentaires: Record<string, string> | null };
  snapshot: Snapshot;
  estAdmin: boolean;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  // Valeurs par défaut non confirmées utilisées par le SNAPSHOT (effet global signalé).
  const typeIds = [...new Set(snapshot.equipements.map((e) => e.type_id).filter((x): x is string => !!x))];
  let aConfirmer: { id: string; type: string; facteur_charge: number | null; poste: string }[] = [];
  if (dossier.statut === "soumis" && estAdmin && typeIds.length > 0) {
    const { data } = await supabase
      .from("valeurs_defaut")
      .select("id, type, facteur_charge, poste, confirme")
      .in("id", typeIds);
    aConfirmer = (data ?? []).filter((v) => !v.confirme);
  }
  const valeurIds = aConfirmer.map((v) => v.id);

  // Cohérence gelée : total factures figé dans le snapshot vs seuil courant (réglable par l'admin).
  const { data: pSeuil } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "seuil_coherence")
    .maybeSingle();
  const seuil = pSeuil?.valeur ?? 20;
  const coherence = controleCoherence(
    snapshot.bilan.totalEquipementsKwh,
    snapshot.totalFacturesKwh ?? null,
    seuil,
  );

  return (
    <>
      <div className="border border-border rounded-lg bg-bg px-4 py-3 text-sm">
        <p className="text-muted">
          Valeurs <strong className="text-ink">gelées à la soumission</strong> — ce rapport n'est plus
          recalculé en direct.
        </p>
        {dossier.snapshot_perime && (
          <p className="text-[#9A6410] mt-1">
            Le dossier a été modifié depuis l'approbation/soumission — <strong>re-soumettre</strong> pour
            rafraîchir le rapport.
          </p>
        )}
      </div>

      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Sommaire exécutif (gelé)</h2>
        <BilanEtSommaire sommaire={snapshot.sommaire} bilan={snapshot.bilan} />
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Cohérence estimé vs factures (gelée)</h2>
        <div className="border border-border rounded-lg bg-surface p-4 text-sm text-muted">
          {coherence.disponible ? (
            <p className={coherence.depasse ? "text-[#B42318]" : "text-ink"}>
              Écart de {fmt(coherence.ecartPct ?? null)} % (seuil {seuil} %) —{" "}
              {coherence.depasse ? "au-delà du seuil." : "dans le seuil."}
            </p>
          ) : (
            <p>Non disponible — aucune facture confirmée au moment de la soumission.</p>
          )}
        </div>
      </section>

      {dossier.statut === "soumis" && estAdmin && (
        <ApprobationSection id={id} aConfirmer={aConfirmer} valeurIds={valeurIds} perime={dossier.snapshot_perime} />
      )}

      {dossier.statut === "soumis" && !estAdmin && (
        <p className="text-sm text-muted">En attente d'approbation par un administrateur.</p>
      )}

      {["approuve", "exporte"].includes(dossier.statut) && (
        <p className="text-sm text-success">
          ✓ Rapport approuvé. L'export .docx est disponible depuis la fiche du dossier.
        </p>
      )}
    </>
  );
}

function ApprobationSection({
  id,
  aConfirmer,
  valeurIds,
  perime,
}: {
  id: string;
  aConfirmer: { id: string; type: string; facteur_charge: number | null; poste: string }[];
  valeurIds: string[];
  perime: boolean;
}) {
  const approuver = approuverDossier.bind(null, id, valeurIds);

  // Renvoi : lit un <textarea> par section, borne/valide côté serveur (renvoyerDossier).
  async function renvoyer(formData: FormData) {
    "use server";
    const commentaires: Record<string, string> = {};
    for (const s of SECTIONS) commentaires[s] = String(formData.get(s) ?? "");
    await renvoyerDossier(id, commentaires);
  }

  return (
    <section className="space-y-6">
      <h2 className="text-[15px] font-semibold text-ink">Approbation (administrateur)</h2>

      <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
        {perime ? (
          <p className="text-sm text-[#9A6410]">
            Dossier modifié depuis la soumission : l'auteur doit <strong>re-soumettre</strong> avant que
            vous puissiez l'approuver.
          </p>
        ) : (
          <>
            {aConfirmer.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-ink">
                  En approuvant, vous confirmez les valeurs par défaut suivantes utilisées par ce rapport.
                </p>
                <p className="text-xs text-[#9A6410]">
                  ⚠ Effet <strong>global</strong> : ces valeurs vivent dans la table partagée et vaudront
                  pour les futurs dossiers. Ce rapport, lui, reste protégé par son instantané gelé.
                </p>
                <ul className="text-sm text-ink border border-border rounded-md divide-y divide-border">
                  {aConfirmer.map((v) => (
                    <li key={v.id} className="px-3 py-2 flex justify-between gap-4">
                      <span>{v.type}</span>
                      <span className="text-muted tabular-nums">
                        {libellePoste(v.poste)} · facteur {v.facteur_charge ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucune valeur par défaut à confirmer pour ce rapport.</p>
            )}

            <form action={approuver}>
              <Button type="submit">Approuver le rapport</Button>
            </form>
          </>
        )}
      </div>

      <form action={renvoyer} className="border border-border rounded-lg bg-surface p-4 space-y-4">
        <p className="text-sm text-ink">Renvoyer à corriger (commentaires par section)</p>
        {SECTIONS.map((s) => (
          <div key={s}>
            <label htmlFor={`c-${s}`} className="block text-xs text-muted mb-1">
              {SECTION_LABELS[s]}
            </label>
            <textarea
              id={`c-${s}`}
              name={s}
              rows={2}
              maxLength={4000}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink"
            />
          </div>
        ))}
        <Button type="submit" variant="secondary">
          Renvoyer à corriger
        </Button>
      </form>
    </section>
  );
}

// Une section narrative : textarea éditable + (si IA) bouton brouillon + bouton valider.
function SectionNarrative({
  id,
  meta,
  actuel,
}: {
  id: string;
  meta: (typeof NARRATIVE_SECTIONS)[number];
  actuel: { texte: string | null; source: string; valide: boolean } | undefined;
}) {
  const section = meta.cle as NarrativeSection;
  const rediger = redigerSection.bind(null, id, section);
  const valider = validerTexteSection.bind(null, id, section);

  return (
    <div className="border border-border rounded-lg bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-ink">{meta.label}</h3>
          {meta.source === "ia" && <span className="text-[11px] text-muted border border-border rounded px-1.5 py-0.5">IA</span>}
          {actuel?.source === "ia" && !actuel.valide && (
            <StatusChip status="a_confirmer" />
          )}
          {actuel?.valide && <StatusChip status="valide" />}
        </div>
        {meta.source === "ia" && (
          <form action={rediger}>
            <Button type="submit" variant="secondary">
              Rédiger un brouillon (IA)
            </Button>
          </form>
        )}
      </div>

      <form action={updateTexteSection} className="space-y-3">
        <input type="hidden" name="dossier_id" value={id} />
        <input type="hidden" name="section" value={section} />
        <textarea
          name="texte"
          rows={5}
          defaultValue={actuel?.texte ?? ""}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="valide" defaultChecked={actuel?.valide ?? false} />
            Validée (entre dans le rapport)
          </label>
          <Button type="submit" variant="secondary">
            Enregistrer
          </Button>
        </div>
      </form>

      {actuel?.source === "ia" && !actuel.valide && (
        <form action={valider}>
          <Button type="submit">Valider ce brouillon</Button>
        </form>
      )}
    </div>
  );
}

// ───────────────────────── Rapport en direct (brouillon/a_corriger) ─────────────────────────
async function LiveReport({
  id,
  dossier,
  supabase,
  estAdmin,
}: {
  id: string;
  dossier: {
    statut: string;
    commentaires: Record<string, string> | null;
    superficie_valeur: number | null;
    superficie_unite: string | null;
    annee_construction: number | null;
    usage: string | null;
    gaz_quantite: number | null;
    gaz_unite: string | null;
  };
  supabase: Awaited<ReturnType<typeof createClient>>;
  estAdmin: boolean;
}) {
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

  // Factures confirmées → total pour la cohérence (US-36/37). null = « non disponible ».
  const { data: factures } = await supabase
    .from("factures")
    .select("id, energie, periode_debut, periode_fin, conso_valeur, conso_unite, confirme")
    .eq("dossier_id", id)
    .eq("confirme", true)
    .returns<Facture[]>();

  const eqs = equipements ?? [];
  const bilan = bilanEnergetique(eqs.map((e) => ligneEquipement(e)) as LigneBilan[]);
  const gazKwh =
    dossier.gaz_quantite !== null && dossier.gaz_unite
      ? gazEnKwh({ quantite: dossier.gaz_quantite, unite: dossier.gaz_unite, facteurM3: facteurGaz })
      : null;
  const intensite = intensiteKwhM2(bilan.totalEquipementsKwh, dossier.superficie_valeur, dossier.superficie_unite);

  const completude = controleCompletude(eqs, dossier);
  const coherence = controleCoherence(
    bilan.totalEquipementsKwh,
    totalFacturesKwh(factures ?? [], facteurGaz),
    seuilCoherence,
  );
  const sommaire = sommaireExecutif({ dossier, bilan, intensite, gazKwh });

  // Sections narratives (Phase 7) : textes existants indexés par section.
  const { data: textesRows } = await supabase
    .from("rapport_textes")
    .select("section, texte, source, valide")
    .eq("dossier_id", id);
  const textes: Record<string, { texte: string | null; source: string; valide: boolean }> = {};
  for (const t of textesRows ?? []) textes[t.section] = t;

  const commentaires = dossier.commentaires ?? {};

  return (
    <>
      {dossier.statut === "a_corriger" && Object.keys(commentaires).length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold text-ink mb-3">Corrections demandées</h2>
          <div className="border border-error rounded-lg bg-[#fbeeec] p-4 space-y-3">
            {SECTIONS.filter((s) => commentaires[s]).map((s) => (
              <div key={s} className="text-sm">
                <div className="text-xs font-medium text-error">{SECTION_LABELS[s]}</div>
                <p className="text-ink whitespace-pre-wrap">{commentaires[s]}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Complétude (US-35/36) */}
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

      {/* Cohérence (US-36/37) — alimentée par les factures confirmées (Phase 6). */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Cohérence estimé vs factures</h2>
        <div className="border border-border rounded-lg bg-surface p-4 text-sm text-muted">
          {coherence.disponible ? (
            <p className={coherence.depasse ? "text-[#B42318]" : "text-ink"}>
              Écart de {fmt(coherence.ecartPct ?? null)} % (seuil {seuilCoherence} %) —{" "}
              {coherence.depasse ? "au-delà du seuil." : "dans le seuil."}
            </p>
          ) : (
            <p>
              Non disponible — aucune facture confirmée. Seuil configuré : {seuilCoherence} %.{" "}
              <Link href={`/dossiers/${id}/factures`} className="underline">Ajouter des factures</Link>.
            </p>
          )}
        </div>
      </section>

      {/* Sommaire exécutif + bilan */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Sommaire exécutif</h2>
        <BilanEtSommaire sommaire={sommaire} bilan={bilan} />
      </section>

      {/* Sections narratives (Phase 7, US-41/42/43) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Sections narratives</h2>
          <Link href={`/dossiers/${id}/mesures`} className="text-sm text-primary underline">
            Mesures d'amélioration →
          </Link>
        </div>
        <p className="text-sm text-muted">
          L'IA propose un brouillon pour les sections marquées « IA » à partir des seuls éléments
          validés ; vous relisez, corrigez et validez. Seules les sections validées entrent dans le
          rapport. Les autres sont saisies à la main.
        </p>
        {NARRATIVE_SECTIONS.map((s) => (
          <SectionNarrative key={s.cle} id={id} meta={s} actuel={textes[s.cle]} />
        ))}
      </section>

      {/* Soumettre */}
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
    </>
  );
}
