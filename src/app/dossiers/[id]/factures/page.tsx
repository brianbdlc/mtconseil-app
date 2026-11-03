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
import { updateFacture, lireFactureAction, confirmerFacture } from "../../actions";
import { Button, Input, Label, Select, StatusChip } from "@/components/ui";

const BUCKET = "factures";

type FactureRow = Facture & {
  fournisseur: string | null;
  conso_confiance: string | null;
  source: string;
  storage_path: string | null;
  nom_original: string | null;
};

const COLS =
  "id, energie, fournisseur, periode_debut, periode_fin, conso_valeur, conso_unite, conso_confiance, source, confirme, storage_path, nom_original";

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
