import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEquipement, updateBatiment, updateZone, supprimerZone, updateDistribution, supprimerDistribution, updateRevision, supprimerRevision, prefillRevisions } from "../actions";
import {
  bilanEnergetique,
  gazEnKwh,
  intensiteKwhM2,
  libellePoste,
  ligneEquipement,
  type LigneBilan,
} from "@/lib/calc";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";
import { VerrouFiche } from "@/components/verrou-fiche";
import { OptimaSection } from "./optima-section";

type TypeJoint = { poste: string; confirme: boolean; facteur_charge: number | null } | null;

type Equipement = {
  id: string;
  nom: string | null;
  puissance_valeur: number | null;
  puissance_unite: string | null;
  heures_par_an: number | null;
  facteur_charge: number | null;
  type_id: string | null;
  type: TypeJoint;
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);
}

const ANNEE_COURANTE = new Date().getFullYear();

export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: dossier } = await supabase
    .from("dossiers")
    .select(
      "id, client, adresse, statut, superficie_valeur, superficie_unite, annee_construction, usage, gaz_quantite, gaz_unite, gaz_periode",
    )
    .eq("id", id)
    .single();
  if (!dossier) notFound();

  // Join type pour CALCULER la conso à la lecture (source unique = calc.ts) ; conso_kwh_an non relu.
  const { data: equipements } = await supabase
    .from("equipements")
    .select(
      "id, nom, puissance_valeur, puissance_unite, heures_par_an, facteur_charge, type_id, type:valeurs_defaut(poste, confirme, facteur_charge)",
    )
    .eq("dossier_id", id)
    .order("created_at", { ascending: true })
    .returns<Equipement[]>();

  const { data: paramGaz } = await supabase
    .from("parametres")
    .select("valeur, confirme")
    .eq("cle", "facteur_conversion_gaz")
    .maybeSingle();

  // Phase 9 : zones descriptives (hors calcul).
  const { data: zones } = await supabase
    .from("zones")
    .select("id, nom, superficie, unite")
    .eq("dossier_id", id)
    .order("ordre", { ascending: true });

  // Phase 10 : distribution électrique descriptive (hors calcul).
  const { data: distribution } = await supabase
    .from("distribution_electrique")
    .select("id, amperes, tension")
    .eq("dossier_id", id)
    .order("ordre", { ascending: true });

  // Phase 11 : registre des révisions descriptif (hors calcul).
  const { data: revisions } = await supabase
    .from("revisions")
    .select("id, numero, date, description, ordre")
    .eq("dossier_id", id)
    .order("ordre", { ascending: true });

  const eqs = equipements ?? [];
  const lignes = eqs.map((e) => ligneEquipement(e));
  const bilan = bilanEnergetique(lignes as LigneBilan[]);

  // Gaz saisi : ligne de référence, JAMAIS additionnée au total équipements.
  const facteurGaz = paramGaz?.valeur ?? null;
  const gazKwh = dossier.gaz_quantite !== null && dossier.gaz_unite
    ? gazEnKwh({ quantite: dossier.gaz_quantite, unite: dossier.gaz_unite, facteurM3: facteurGaz })
    : null;
  const gazSaisiNonConvertible =
    dossier.gaz_quantite !== null && dossier.gaz_unite === "m3" && facteurGaz === null;

  const intensite = intensiteKwhM2(
    bilan.totalEquipementsKwh,
    dossier.superficie_valeur,
    dossier.superficie_unite,
  );

  const anneeHorsBorne =
    dossier.annee_construction !== null &&
    (dossier.annee_construction < 1800 || dossier.annee_construction > ANNEE_COURANTE);

  return (
    <div className="space-y-8">
      <VerrouFiche ressource={`batiment:${id}`} />
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
            <Link href={`/dossiers/${id}/photos`}>
              <Button variant="secondary">Photos</Button>
            </Link>
            <Link href={`/dossiers/${id}/factures`}>
              <Button variant="secondary">Factures</Button>
            </Link>
            <Link href={`/dossiers/${id}/mesures`}>
              <Button variant="secondary">Mesures</Button>
            </Link>
            <Link href={`/dossiers/${id}/rapport`}>
              <Button variant="secondary">Rapport</Button>
            </Link>
            {["approuve", "exporte"].includes(dossier.statut) ? (
              <a href={`/dossiers/${id}/export`}>
                <Button variant="secondary">Exporter PDF</Button>
              </a>
            ) : (
              <Button variant="secondary" disabled title="Disponible une fois le rapport approuvé">
                Exporter PDF
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Description du bâtiment (US-25→29) */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Description du bâtiment</h2>
        <form action={updateBatiment} className="border border-border rounded-lg bg-surface p-4 space-y-4">
          <input type="hidden" name="dossier_id" value={id} />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="superficie_valeur">Superficie</Label>
              <Input
                id="superficie_valeur"
                name="superficie_valeur"
                className="tabular-nums"
                defaultValue={dossier.superficie_valeur ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="superficie_unite">Unité</Label>
              <Select id="superficie_unite" name="superficie_unite" defaultValue={dossier.superficie_unite ?? ""}>
                <option value="">—</option>
                <option value="m2">m²</option>
                <option value="pi2">pi²</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="annee_construction">Année de construction</Label>
              <Input
                id="annee_construction"
                name="annee_construction"
                className="tabular-nums"
                defaultValue={dossier.annee_construction ?? ""}
              />
              {anneeHorsBorne && (
                <p className="text-xs text-[#9A6410] mt-1">
                  Année hors de [1800, {ANNEE_COURANTE}] : à vérifier.
                </p>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="usage">Usage du bâtiment</Label>
            <Input id="usage" name="usage" defaultValue={dossier.usage ?? ""} />
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted mb-2">
              Gaz naturel (saisie manuelle de référence). Les{" "}
              <Link href={`/dossiers/${id}/factures`} className="underline">factures</Link> alimentent
              le contrôle de cohérence du rapport.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="gaz_quantite">Quantité</Label>
                <Input
                  id="gaz_quantite"
                  name="gaz_quantite"
                  className="tabular-nums"
                  defaultValue={dossier.gaz_quantite ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="gaz_unite">Unité</Label>
                <Select id="gaz_unite" name="gaz_unite" defaultValue={dossier.gaz_unite ?? ""}>
                  <option value="">—</option>
                  <option value="m3">m³</option>
                  <option value="GJ">GJ</option>
                  <option value="kWh">kWh</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="gaz_periode">Période</Label>
                <Input id="gaz_periode" name="gaz_periode" defaultValue={dossier.gaz_periode ?? ""} />
              </div>
            </div>
          </div>

          <Button type="submit">Enregistrer</Button>
        </form>
      </section>

      {/* Zones du bâtiment (US-53) — descriptif, hors calcul */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Zones du bâtiment</h2>
            <p className="text-xs text-muted">Descriptif — n&apos;entre pas dans le calcul d&apos;intensité.</p>
          </div>
          <form action={updateZone}>
            <input type="hidden" name="dossier_id" value={id} />
            <Button type="submit">+ Ajouter une zone</Button>
          </form>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-2 font-medium">Zone</th>
                <th className="px-4 py-2 font-medium">Superficie</th>
                <th className="px-4 py-2 font-medium">Unité</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(zones ?? []).map((z) => (
                <tr key={z.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2">
                    <form id={`zone-${z.id}`} action={updateZone} className="contents">
                      <input type="hidden" name="id" value={z.id} />
                      <input type="hidden" name="dossier_id" value={id} />
                      <Input name="nom" defaultValue={z.nom ?? ""} form={`zone-${z.id}`} />
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name="superficie"
                      className="tabular-nums"
                      defaultValue={z.superficie ?? ""}
                      form={`zone-${z.id}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Select name="unite" defaultValue={z.unite ?? ""} form={`zone-${z.id}`}>
                      <option value="">—</option>
                      <option value="m2">m²</option>
                      <option value="pi2">pi²</option>
                    </Select>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button type="submit" form={`zone-${z.id}`}>Enregistrer</Button>
                      <form action={supprimerZone.bind(null, z.id, id)}>
                        <Button type="submit" variant="secondary">Supprimer</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {(zones ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    Aucune zone.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Distribution électrique (US-54) — descriptif, saisie ingénieur pure (hors calcul) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Distribution électrique</h2>
            <p className="text-xs text-muted">Descriptif — saisie ingénieur. Une ligne par entrée électrique.</p>
          </div>
          <form action={updateDistribution}>
            <input type="hidden" name="dossier_id" value={id} />
            <Button type="submit">+ Ajouter une entrée</Button>
          </form>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-2 font-medium">Ampères (A)</th>
                <th className="px-4 py-2 font-medium">Tension (V)</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(distribution ?? []).map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2">
                    <form id={`dist-${d.id}`} action={updateDistribution} className="contents">
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="dossier_id" value={id} />
                      <Input
                        name="amperes"
                        className="tabular-nums"
                        defaultValue={d.amperes ?? ""}
                        form={`dist-${d.id}`}
                      />
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name="tension"
                      className="tabular-nums"
                      defaultValue={d.tension ?? ""}
                      form={`dist-${d.id}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button type="submit" form={`dist-${d.id}`}>Enregistrer</Button>
                      <form action={supprimerDistribution.bind(null, d.id, id)}>
                        <Button type="submit" variant="secondary">Supprimer</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {(distribution ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted">
                    Aucune entrée électrique.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Annexe Optima (US-50/US-51) — PDF inséré tel quel, hors lecture/recalcul */}
      <OptimaSection dossierId={id} />

      {/* Registre des révisions (US-59) — descriptif, saisie ingénieur pure (hors calcul) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Registre des révisions</h2>
            <p className="text-xs text-muted">Descriptif — numéro, date et description de chaque révision.</p>
          </div>
          <div className="flex gap-2">
            <form action={prefillRevisions.bind(null, id)}>
              <Button type="submit" variant="secondary">Pré-remplir depuis les exports</Button>
            </form>
            <form action={updateRevision}>
              <input type="hidden" name="dossier_id" value={id} />
              <Button type="submit">+ Ajouter une révision</Button>
            </form>
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-2 font-medium">Numéro</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Ordre</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(revisions ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2">
                    <form id={`rev-${r.id}`} action={updateRevision} className="contents">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="dossier_id" value={id} />
                      <Input name="numero" defaultValue={r.numero ?? ""} form={`rev-${r.id}`} />
                    </form>
                  </td>
                  <td className="px-4 py-2">
                    <Input name="date" type="date" defaultValue={r.date ?? ""} form={`rev-${r.id}`} />
                  </td>
                  <td className="px-4 py-2">
                    <Input name="description" defaultValue={r.description ?? ""} form={`rev-${r.id}`} />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name="ordre"
                      className="tabular-nums w-20"
                      defaultValue={r.ordre ?? 0}
                      form={`rev-${r.id}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button type="submit" form={`rev-${r.id}`}>Enregistrer</Button>
                      <form action={supprimerRevision.bind(null, r.id, id)}>
                        <Button type="submit" variant="secondary">Supprimer</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {(revisions ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Aucune révision.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                <th className="px-4 py-2 font-medium">Poste</th>
                <th className="px-4 py-2 font-medium">Puissance</th>
                <th className="px-4 py-2 font-medium">Heures/an</th>
                <th className="px-4 py-2 font-medium">Fact. charge</th>
                <th className="px-4 py-2 font-medium">Conso (kWh/an)</th>
              </tr>
            </thead>
            <tbody>
              {eqs.map((e, i) => {
                const l = lignes[i];
                return (
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
                    <td className="px-4 py-2">
                      {l.poste ? (
                        <span className="inline-flex items-center gap-2">
                          {libellePoste(l.poste)}
                          {l.reposeSurValeurAConfirmer && <StatusChip status="a_confirmer" />}
                        </span>
                      ) : (
                        <StatusChip status="hors_categorie" />
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {e.puissance_valeur ?? "—"} {e.puissance_unite ?? ""}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{e.heures_par_an ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{e.facteur_charge ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{fmt(l.conso)}</td>
                  </tr>
                );
              })}
              {eqs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    Aucun équipement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bilan énergétique (US-31) — calculé par le code */}
      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3">Bilan énergétique</h2>
        <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
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
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        {libellePoste(p.poste)}
                        {p.nbAConfirmer > 0 && <StatusChip status="a_confirmer" />}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.kwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Math.round(p.pct)} %
                    </td>
                  </tr>
                ))}
                {bilan.horsCategorieKwh > 0 && (
                  <tr className="border-b border-border text-muted">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        Hors catégorie <StatusChip status="hors_categorie" />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(bilan.horsCategorieKwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {bilan.totalEquipementsKwh > 0
                        ? Math.round((bilan.horsCategorieKwh / bilan.totalEquipementsKwh) * 100)
                        : 0}{" "}
                      %
                    </td>
                  </tr>
                )}
                <tr className="font-semibold text-ink">
                  <td className="px-3 py-2">Total équipements (toutes énergies)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(bilan.totalEquipementsKwh)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">100 %</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="border border-border rounded-md bg-bg px-4 py-3">
              <div className="text-xs text-muted">Intensité énergétique</div>
              <div className="text-lg text-ink tabular-nums">
                {intensite !== null
                  ? `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 }).format(intensite)} kWh/m²`
                  : "Non disponible (superficie manquante)"}
              </div>
            </div>
            <div className="border border-border rounded-md bg-bg px-4 py-3">
              <div className="text-xs text-muted flex items-center gap-2">
                Gaz saisi (équivalent kWh), non additionné
                {gazKwh !== null && paramGaz && !paramGaz.confirme && <StatusChip status="a_confirmer" />}
              </div>
              <div className="text-lg text-ink tabular-nums">
                {dossier.gaz_quantite === null
                  ? "Non renseigné"
                  : gazKwh !== null
                    ? `${fmt(gazKwh)} kWh`
                    : "Non disponible"}
              </div>
              {gazSaisiNonConvertible && (
                <p className="text-xs text-[#9A6410] mt-1">
                  Facteur de conversion m³ manquant : à renseigner dans Paramètres (admin).
                </p>
              )}
              <p className="text-xs text-muted mt-1">
                Les équipements au gaz peuvent déjà être inclus dans les postes ci-dessus.
              </p>
            </div>
          </div>

          {(bilan.nbSansConso > 0 || bilan.nbHorsCategorie > 0 || bilan.nbAConfirmerTotal > 0) && (
            <ul className="text-xs text-muted space-y-1">
              {bilan.nbSansConso > 0 && (
                <li>{bilan.nbSansConso} équipement(s) sans conso (facteur, heures ou puissance manquant) — exclus du total.</li>
              )}
              {bilan.nbHorsCategorie > 0 && (
                <li>{bilan.nbHorsCategorie} équipement(s) hors catégorie (aucun type) — exclus du détail par poste.</li>
              )}
              {bilan.nbAConfirmerTotal > 0 && (
                <li>{bilan.nbAConfirmerTotal} équipement(s) reposent sur une valeur à confirmer.</li>
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
