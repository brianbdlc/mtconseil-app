"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  totalFacturesKwh,
  verifierFactures,
  type Facture,
} from "@/lib/factures";
import {
  updateFacture,
  lireFactureAction,
  confirmerFacture,
  updateDegresJours,
  supprimerDegresJours,
  enregistrerGraphique,
} from "../../actions";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";
import { VerrouFiche } from "@/components/verrou-fiche";

const BUCKET = "factures";

type FactureRow = Facture & {
  fournisseur: string | null;
  conso_confiance: string | null;
  source: string;
  storage_path: string | null;
  nom_original: string | null;
};

const COLS =
  "id, energie, fournisseur, periode_debut, periode_fin, conso_valeur, conso_unite, montant, conso_confiance, source, confirme, storage_path, nom_original";

function fmt(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(n);
}

export default function FacturesPage() {
  const { id: dossierId } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [facteurGaz, setFacteurGaz] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const [{ data: fs }, { data: param }] = await Promise.all([
      supabase.from("factures").select(COLS).eq("dossier_id", dossierId).order("created_at", { ascending: true }),
      supabase.from("parametres").select("valeur").eq("cle", "facteur_conversion_gaz").maybeSingle(),
    ]);
    const liste = (fs ?? []) as FactureRow[];
    setFactures(liste);
    setFacteurGaz(param?.valeur ?? null);

    const chemins = liste.map((f) => f.storage_path).filter((p): p is string => !!p);
    if (chemins.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(chemins, 3600);
      const map: Record<string, string> = {};
      for (const s of signed ?? []) if (s.signedUrl) map[s.path!] = s.signedUrl;
      setUrls(map);
    } else {
      setUrls({});
    }
  }, [supabase, dossierId]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setErreur(null);

    // Skip-existing : saute les fichiers déjà présents pour ce dossier (reprise).
    const { data: existantes } = await supabase
      .from("factures")
      .select("storage_path")
      .eq("dossier_id", dossierId);
    const dejaLa = new Set((existantes ?? []).map((f) => f.storage_path).filter(Boolean));

    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const path = `${dossierId}/${file.name}`;
        if (dejaLa.has(path)) {
          setProgress({ done: i + 1, total: files.length });
          continue;
        }
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr && !/exists/i.test(upErr.message)) throw upErr;

        const { error: insErr } = await supabase.from("factures").insert({
          dossier_id: dossierId,
          storage_path: path,
          nom_original: file.name,
        });
        if (insErr) throw insErr;
        dejaLa.add(path);
      } catch (err) {
        setErreur(`${file.name} : ${err instanceof Error ? err.message : "échec"}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    await recharger();
  }

  const doutes = useMemo(() => verifierFactures(factures), [factures]);
  const total = useMemo(() => totalFacturesKwh(factures, facteurGaz), [factures, facteurGaz]);
  const doutesParFacture = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const d of doutes) (m[d.factureId] ??= []).push(d.message);
    return m;
  }, [doutes]);

  async function ajouterManuelle() {
    const fd = new FormData();
    fd.set("dossier_id", dossierId);
    await updateFacture(fd); // crée une ligne vide (non confirmée, saisie à compléter)
    await recharger();
  }

  return (
    <div className="space-y-8">
      <VerrouFiche ressource={`facture:${dossierId}`} />
      <div>
        <Link href={`/dossiers/${dossierId}`} className="text-xs text-muted hover:text-ink">
          ← Dossier
        </Link>
        <h1 className="text-[22px] font-semibold text-ink mt-2">Factures d'énergie</h1>
        <p className="text-sm text-muted">
          L'IA propose, le code vérifie, vous confirmez. Seules les factures confirmées alimentent le
          contrôle de cohérence du rapport.
        </p>
      </div>

      <section className="border border-border rounded-lg bg-surface p-4 space-y-3">
        <Label htmlFor="files">Téléverser des factures (PDF ou image)</Label>
        <input
          id="files"
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={onFiles}
          disabled={progress !== null}
          className="text-sm"
        />
        {progress && (
          <div className="text-sm text-muted">
            Téléversement… {progress.done}/{progress.total}
          </div>
        )}
        {erreur && <div className="text-sm text-error">{erreur}</div>}
        <p className="text-xs text-muted">Les fichiers déjà présents sont ignorés (reprise).</p>
      </section>

      <section className="flex items-center justify-between border border-border rounded-lg bg-bg px-4 py-3">
        <span className="text-sm text-muted">Total des factures confirmées</span>
        <span className="text-sm font-semibold text-ink tabular-nums">
          {total === null ? "— (aucune confirmée)" : `${fmt(total)} kWh`}
        </span>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">
            {factures.length} facture{factures.length > 1 ? "s" : ""}
          </h2>
          <Button type="button" variant="secondary" onClick={ajouterManuelle}>
            + Facture manuelle
          </Button>
        </div>
        {factures.length === 0 && <p className="text-sm text-muted">Aucune facture.</p>}
        {factures.map((f) => (
          <FactureCard
            key={f.id}
            facture={f}
            dossierId={dossierId}
            url={f.storage_path ? urls[f.storage_path] : undefined}
            doutes={doutesParFacture[f.id] ?? []}
            onChanged={recharger}
          />
        ))}
      </section>

      <DegresJoursSection dossierId={dossierId} />
      <GraphiquesSection dossierId={dossierId} />
    </div>
  );
}

// ───────────────────── Degrés-jours (US-55) : saisie manuelle, descriptif ─────────────────────
type DegresJourRow = { id: string; mois: string | null; valeur: number | null };

function DegresJoursSection({ dossierId }: { dossierId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<DegresJourRow[]>([]);
  const [busy, setBusy] = useState(false);

  const recharger = useCallback(async () => {
    const { data } = await supabase
      .from("degres_jours")
      .select("id, mois, valeur")
      .eq("dossier_id", dossierId)
      .order("mois", { ascending: true });
    setRows((data ?? []) as DegresJourRow[]);
  }, [supabase, dossierId]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await recharger();
    } finally {
      setBusy(false);
    }
  }

  async function enregistrer(formData: FormData) {
    formData.set("dossier_id", dossierId);
    await run(() => updateDegresJours(formData));
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Degrés-jours</h2>
        <p className="text-xs text-muted">
          Saisie manuelle. Un relevé par mois, mis en regard de la consommation dans les graphiques.
        </p>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="px-4 py-2 font-medium">Mois</th>
              <th className="px-4 py-2 font-medium">Degrés-jours</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-2">
                  <form id={`dj-${d.id}`} action={enregistrer} className="contents">
                    <input type="hidden" name="id" value={d.id} />
                    <Input name="mois" type="date" defaultValue={d.mois ?? ""} form={`dj-${d.id}`} />
                  </form>
                </td>
                <td className="px-4 py-2">
                  <Input name="valeur" className="tabular-nums" defaultValue={d.valeur ?? ""} form={`dj-${d.id}`} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <Button type="submit" form={`dj-${d.id}`} disabled={busy}>
                      Enregistrer
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => run(() => supprimerDegresJours(d.id, dossierId))}
                    >
                      Supprimer
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  Aucun relevé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={enregistrer}>
        <Button type="submit" variant="secondary" disabled={busy}>
          + Ajouter un relevé
        </Button>
      </form>
    </section>
  );
}

// ───────── Graphiques degrés-jours (US-55) : images PNG collées d'Optima (hors calcul) ─────────
function GraphiquesSection({ dossierId }: { dossierId: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Graphiques degrés-jours</h2>
        <p className="text-xs text-muted">
          Image PNG par énergie, collée d&apos;Optima. L&apos;app ne la produit ni ne la recalcule.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <GraphiqueUpload dossierId={dossierId} energie="elec" titre="Électricité" />
        <GraphiqueUpload dossierId={dossierId} energie="gaz" titre="Gaz naturel" />
      </div>
    </section>
  );
}

function GraphiqueUpload({
  dossierId,
  energie,
  titre,
}: {
  dossierId: string;
  energie: "elec" | "gaz";
  titre: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const colonne = energie === "elec" ? "graphique_dj_elec_path" : "graphique_dj_gaz_path";
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const { data } = await supabase.from("dossiers").select(colonne).eq("id", dossierId).single();
    const path = (data as Record<string, string | null> | null)?.[colonne] ?? null;
    if (path) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      setUrl(signed?.signedUrl ?? null);
    } else {
      setUrl(null);
    }
  }, [supabase, dossierId, colonne]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErreur(null);
    setBusy(true);
    try {
      const path = `${dossierId}/graphique_dj_${energie}.png`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "image/png", upsert: true });
      if (upErr) throw upErr;
      await enregistrerGraphique(dossierId, energie, path);
      await recharger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "échec du téléversement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-surface p-4 space-y-3">
      <Label htmlFor={`graph-${energie}`}>{titre}</Label>
      {url && <img src={url} alt={`Graphique ${titre}`} className="max-w-full rounded border border-border" />}
      <input
        id={`graph-${energie}`}
        type="file"
        accept="image/png,image/*"
        onChange={onFile}
        disabled={busy}
        className="text-sm"
      />
      {erreur && <div className="text-sm text-error">{erreur}</div>}
    </div>
  );
}

function FactureCard({
  facture,
  dossierId,
  url,
  doutes,
  onChanged,
}: {
  facture: FactureRow;
  dossierId: string;
  url: string | undefined;
  doutes: string[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function enregistrer(formData: FormData) {
    formData.set("id", facture.id);
    formData.set("dossier_id", dossierId);
    await run(() => updateFacture(formData));
  }

  return (
    <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          {facture.storage_path && url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
              {facture.nom_original ?? "fichier"}
            </a>
          ) : (
            <span>{facture.source === "manuel" ? "Saisie manuelle" : "—"}</span>
          )}
          {facture.conso_confiance && <StatusChip status={facture.conso_confiance} />}
          <StatusChip status={facture.confirme ? "valide" : "non_valide"} />
        </div>
        <div className="flex items-center gap-2">
          {facture.storage_path && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => lireFactureAction(facture.id, dossierId))}
            >
              Lire avec l'IA
            </Button>
          )}
          {!facture.confirme && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => run(() => confirmerFacture(facture.id, dossierId))}
            >
              Confirmer
            </Button>
          )}
        </div>
      </div>

      {doutes.length > 0 && (
        <ul className="text-xs text-[#9A6410] list-disc ml-5">
          {doutes.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}

      <form action={enregistrer} className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor={`energie-${facture.id}`}>Énergie</Label>
          <Select id={`energie-${facture.id}`} name="energie" defaultValue={facture.energie ?? ""}>
            <option value="">—</option>
            <option value="elec">Électricité</option>
            <option value="gaz">Gaz naturel</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`fournisseur-${facture.id}`}>Fournisseur</Label>
          <Input id={`fournisseur-${facture.id}`} name="fournisseur" defaultValue={facture.fournisseur ?? ""} />
        </div>
        <div>
          <Label htmlFor={`unite-${facture.id}`}>Unité</Label>
          <Select id={`unite-${facture.id}`} name="conso_unite" defaultValue={facture.conso_unite ?? ""}>
            <option value="">—</option>
            <option value="kWh">kWh</option>
            <option value="m3">m³</option>
            <option value="GJ">GJ</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`debut-${facture.id}`}>Début de période</Label>
          <Input id={`debut-${facture.id}`} name="periode_debut" type="date" defaultValue={facture.periode_debut ?? ""} />
        </div>
        <div>
          <Label htmlFor={`fin-${facture.id}`}>Fin de période</Label>
          <Input id={`fin-${facture.id}`} name="periode_fin" type="date" defaultValue={facture.periode_fin ?? ""} />
        </div>
        <div>
          <Label htmlFor={`conso-${facture.id}`}>Consommation</Label>
          <Input id={`conso-${facture.id}`} name="conso_valeur" className="tabular-nums" defaultValue={facture.conso_valeur ?? ""} />
        </div>
        <div>
          <Label htmlFor={`montant-${facture.id}`}>Montant ($)</Label>
          <Input id={`montant-${facture.id}`} name="montant" className="tabular-nums" defaultValue={facture.montant ?? ""} />
        </div>
        <div className="col-span-2 md:col-span-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="confirme" defaultChecked={facture.confirme} />
            Confirmée (entre dans le total)
          </label>
          <Button type="submit" variant="secondary" disabled={busy}>
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  );
}
