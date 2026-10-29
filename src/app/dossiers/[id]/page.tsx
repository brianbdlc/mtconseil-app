import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEquipement, updateBatiment } from "../actions";
import {
  bilanEnergetique,
  gazEnKwh,
  intensiteKwhM2,
  libellePoste,
  ligneEquipement,
  type LigneBilan,
} from "@/lib/calc";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";

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
            <a href={`/dossiers/${id}/export`}>
              <Button variant="secondary">Exporter .docx</Button>
            </a>
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
              Gaz naturel (saisie manuelle, remplacée par les factures en Phase 6).
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
