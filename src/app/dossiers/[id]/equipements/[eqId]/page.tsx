import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateEquipement, lirePlaqueAction, validerChamp } from "../../../actions";
import { UNITES, libellePoste, ligneEquipement } from "@/lib/calc";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";

// Chip d'état d'un champ IA : validé > confiance de lecture > à valider.
function etatChamp(validated: boolean, confiance: string | null): string {
  if (validated) return "valide";
  return confiance ?? "non_valide";
}

export default async function EquipementPage({
  params,
}: {
  params: Promise<{ id: string; eqId: string }>;
}) {
  const { id, eqId } = await params;
  const supabase = await createClient();

  const { data: eq } = await supabase
    .from("equipements")
    .select("*, type:valeurs_defaut(poste, confirme, facteur_charge)")
    .eq("id", eqId)
    .single();
  if (!eq) notFound();

  // Liste des types pour le sélecteur (poste dérivé + facteur par défaut).
  const { data: types } = await supabase
    .from("valeurs_defaut")
    .select("id, type, poste, facteur_charge")
    .order("type", { ascending: true });

  // Conso calculée par le CODE (source unique) à partir du type joint + surcharge éventuelle.
  const ligne = ligneEquipement(eq);
  const facteurTypeDefaut = eq.type?.facteur_charge ?? null;

  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, nom_affichage, nom_original")
    .eq("equipement_id", eqId)
    .order("prise_le", { ascending: true });

  const vignettes: { nom: string; url: string }[] = [];
  if (photos && photos.length) {
    const { data: signed } = await supabase.storage
      .from("photos")
      .createSignedUrls(photos.map((p) => p.storage_path), 3600);
    for (let i = 0; i < photos.length; i++) {
      const url = signed?.[i]?.signedUrl;
      if (url) vignettes.push({ nom: photos[i].nom_affichage ?? photos[i].nom_original ?? "", url });
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <Link href={`/dossiers/${id}`} className="text-xs text-muted hover:text-ink">
        ← Dossier
      </Link>

      <h1 className="text-[22px] font-semibold text-ink">Fiche équipement</h1>

      {/* Photos assignées + lecture de plaque (gate Loi 25 : déclenchée explicitement) */}
      <section className="border border-border rounded-lg bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Photos</h2>
          <form action={lirePlaqueAction.bind(null, eqId, id)}>
            <Button type="submit" variant="secondary" disabled={vignettes.length === 0}>
              Lire la plaque
            </Button>
          </form>
        </div>
        {vignettes.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune photo assignée. <Link href={`/dossiers/${id}/photos`} className="text-primary hover:underline">Ajouter des photos</Link>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {vignettes.map((v, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={v.url}
                alt={v.nom}
                className="w-28 h-28 object-cover rounded-md border border-border"
              />
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          L&apos;IA propose ; chaque champ reste non validé tant que vous ne l&apos;avez pas confirmé.
          N&apos;utiliser « Lire la plaque » que sur des photos anonymisées (Loi 25).
        </p>
      </section>

      <form action={updateEquipement} className="space-y-4">
        <input type="hidden" name="id" value={eqId} />
        <input type="hidden" name="dossier_id" value={id} />

        <div>
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" name="nom" defaultValue={eq.nom ?? ""} />
        </div>

        {/* Champs IA : valeur proposée + pastille + Valider par champ (jamais en bloc). */}
        <div>
          <Label htmlFor="marque">
            Marque <StatusChip status={etatChamp(eq.marque_validated, eq.marque_confiance)} />
          </Label>
          <div className="flex gap-2">
            <Input id="marque" name="marque" defaultValue={eq.marque ?? ""} />
            {!eq.marque_validated && eq.marque_confiance && (
              <Button type="submit" variant="secondary" formAction={validerChamp.bind(null, eqId, id, "marque")}>
                Valider
              </Button>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="modele">
            Modèle <StatusChip status={etatChamp(eq.modele_validated, eq.modele_confiance)} />
          </Label>
          <div className="flex gap-2">
            <Input id="modele" name="modele" defaultValue={eq.modele ?? ""} />
            {!eq.modele_validated && eq.modele_confiance && (
              <Button type="submit" variant="secondary" formAction={validerChamp.bind(null, eqId, id, "modele")}>
                Valider
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="puissance_valeur">
                Puissance{" "}
                <StatusChip status={etatChamp(eq.puissance_validated, eq.puissance_confiance)} />
              </Label>
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
              <Select id="puissance_unite" name="puissance_unite" defaultValue={eq.puissance_unite ?? ""}>
                <option value="">—</option>
                {UNITES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {!eq.puissance_validated && eq.puissance_confiance && (
            <Button
              type="submit"
              variant="secondary"
              className="mt-2"
              formAction={validerChamp.bind(null, eqId, id, "puissance")}
            >
              Valider la puissance
            </Button>
          )}
        </div>

        <div>
          <Label htmlFor="annee">
            Année <StatusChip status={etatChamp(eq.annee_validated, eq.annee_confiance)} />
          </Label>
          <div className="flex gap-2">
            <Input
              id="annee"
              name="annee"
              type="number"
              step="1"
              className="font-mono"
              defaultValue={eq.annee ?? ""}
            />
            {!eq.annee_validated && eq.annee_confiance && (
              <Button type="submit" variant="secondary" formAction={validerChamp.bind(null, eqId, id, "annee")}>
                Valider
              </Button>
            )}
          </div>
        </div>

        {/* Type (poste dérivé) + facteur par défaut. Vide = hors catégorie. */}
        <div className="border border-border rounded-md bg-bg px-4 py-3 space-y-3">
          <div>
            <Label htmlFor="type_id">Type d&apos;équipement</Label>
            <Select id="type_id" name="type_id" defaultValue={eq.type_id ?? ""}>
              <option value="">— Hors catégorie —</option>
              {(types ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.type} ({libellePoste(t.poste)})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              {eq.type_id
                ? `Poste : ${libellePoste(eq.type?.poste ?? "")} · facteur par défaut : ${
                    facteurTypeDefaut ?? "manquant"
                  }`
                : "Aucun type : exclu du détail par poste, mais compté au total."}
            </p>
          </div>
          {eq.facteur_charge !== null && (
            <p className="text-xs text-[#9A6410]">
              Surcharge active : le facteur par défaut du type est remplacé. Pour adopter le facteur
              du type, videz la surcharge ci-dessous ; pour le conserver, indiquez une raison.
            </p>
          )}
        </div>

        {/* Entrées de calcul (code) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="heures_par_an">Heures / an</Label>
            <Input
              id="heures_par_an"
              name="heures_par_an"
              className="tabular-nums"
              defaultValue={eq.heures_par_an ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="facteur_charge">Facteur de charge (surcharge)</Label>
            <Input
              id="facteur_charge"
              name="facteur_charge"
              className="tabular-nums"
              placeholder={facteurTypeDefaut !== null ? String(facteurTypeDefaut) : "0 – 1"}
              defaultValue={eq.facteur_charge ?? ""}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="facteur_charge_raison">Raison de la surcharge (requise si surcharge d&apos;un type)</Label>
          <Input
            id="facteur_charge_raison"
            name="facteur_charge_raison"
            defaultValue={eq.facteur_charge_raison ?? ""}
          />
        </div>

        {/* Champs saisis par l'ingénieur (US-19, US-20) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="etat">État</Label>
            <Input id="etat" name="etat" defaultValue={eq.etat ?? ""} />
          </div>
          <div>
            <Label htmlFor="emplacement">Emplacement</Label>
            <Input id="emplacement" name="emplacement" defaultValue={eq.emplacement ?? ""} />
          </div>
        </div>

        <div>
          <Label htmlFor="dessert">Dessert (ce que l&apos;équipement alimente)</Label>
          <Input id="dessert" name="dessert" defaultValue={eq.dessert ?? ""} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="rendement">Rendement (saisie manuelle)</Label>
            <Input
              id="rendement"
              name="rendement"
              type="number"
              step="any"
              className="font-mono"
              defaultValue={eq.rendement ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="rendement_source">Source du rendement (lien)</Label>
            <Input
              id="rendement_source"
              name="rendement_source"
              type="url"
              placeholder="https://…"
              defaultValue={eq.rendement_source ?? ""}
            />
          </div>
        </div>
        {eq.rendement_source && (
          <a
            href={eq.rendement_source}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            {eq.rendement_source}
          </a>
        )}

        <div className="border border-border rounded-md bg-bg px-4 py-3">
          <div className="text-xs text-muted">Consommation annuelle (calculée par le code)</div>
          <div className="text-lg text-ink tabular-nums">
            {ligne.conso !== null
              ? `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(ligne.conso)} kWh/an`
              : "— (champ incomplet)"}
          </div>
          {ligne.reposeSurValeurAConfirmer && (
            <p className="text-xs text-[#9A6410] mt-1">Basé sur une valeur à confirmer (facteur du type).</p>
          )}
        </div>

        <Button type="submit">Enregistrer</Button>
      </form>
    </div>
  );
}
