"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { grouperPhotos, type PhotoLite } from "@/lib/photos";
import { assignerGroupe, createEquipement } from "../../actions";
import { Button, Input, Label, Select } from "@/components/ui";

type Photo = PhotoLite & { storage_path: string };
type Equipement = { id: string; nom: string | null };

const BUCKET = "photos";

// EXIF stocke la date en "YYYY:MM:DD HH:MM:SS" (heure locale, sans fuseau). On la rend
// parseable par Date.parse (grouperPhotos) ; seuls les écarts relatifs comptent pour le tri.
function exifDateToISO(desc: string | undefined): string | null {
  const m = desc?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m.map((x) => Number(x));
  const d = new Date(Y, Mo - 1, D, H, Mi, S);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function PhotosPage() {
  const { id: dossierId } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const [{ data: ph }, { data: eq }] = await Promise.all([
      supabase
        .from("photos")
        .select("id, storage_path, nom_original, prise_le")
        .eq("dossier_id", dossierId)
        .is("equipement_id", null)
        .order("prise_le", { ascending: true }),
      supabase.from("equipements").select("id, nom").eq("dossier_id", dossierId),
    ]);
    const liste = (ph ?? []) as Photo[];
    setPhotos(liste);
    setEquipements((eq ?? []) as Equipement[]);

    if (liste.length) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(liste.map((p) => p.storage_path), 3600);
      const map: Record<string, string> = {};
      for (const s of signed ?? []) if (s.signedUrl) map[s.path!] = s.signedUrl;
      setUrls(map);
    }
  }, [supabase, dossierId]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permet de re-sélectionner les mêmes fichiers
    if (!files.length) return;
    setErreur(null);

    // Skip-existing : on liste les chemins déjà présents dans le dossier et on saute ceux-là.
    const { data: existantes } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("dossier_id", dossierId);
    const dejaLa = new Set((existantes ?? []).map((p) => p.storage_path));

    const { heicTo, isHeic } = await import("heic-to");
    const ExifReader = (await import("exifreader")).default;

    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // EXIF lu sur le fichier D'ORIGINE, avant conversion (exifreader gère le HEIC iPhone,
        // contrairement à exifr qui rejette les ftyp > 50 octets des HEIC iOS récents).
        let priseLe: string | null = null;
        try {
          const tags = ExifReader.load(await file.arrayBuffer());
          priseLe = exifDateToISO(
            tags.DateTimeOriginal?.description ??
              tags.CreateDate?.description ??
              tags.DateTime?.description,
          );
        } catch {}

        // HEIC → JPEG côté navigateur (prévisualisation + image lisible pour Claude).
        // isHeic inspecte les octets (le type MIME du navigateur est vide pour les HEIC).
        let blob: Blob = file;
        let nom = file.name;
        if ((await isHeic(file)) || /\.hei[cf]$/i.test(file.name)) {
          blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
          nom = file.name.replace(/\.hei[cf]$/i, ".jpg");
        }

        const path = `${dossierId}/${nom}`;
        if (dejaLa.has(path)) {
          setProgress({ done: i + 1, total: files.length });
          continue; // skip-existing
        }

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: false,
        });
        if (upErr && !/exists/i.test(upErr.message)) throw upErr;

        const { error: insErr } = await supabase.from("photos").insert({
          dossier_id: dossierId,
          storage_path: path,
          nom_original: file.name,
          prise_le: priseLe,
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

  const groupes = useMemo(() => grouperPhotos(photos), [photos]);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/dossiers/${dossierId}`} className="text-xs text-muted hover:text-ink">
          ← Dossier
        </Link>
        <h1 className="text-[22px] font-semibold text-ink mt-2">Photos</h1>
      </div>

      <section className="border border-border rounded-lg bg-surface p-4 space-y-3">
        <Label htmlFor="files">Téléverser des photos (HEIC accepté)</Label>
        <input
          id="files"
          type="file"
          accept="image/*,.heic,.heif"
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
        <p className="text-xs text-muted">
          Les fichiers déjà présents sont ignorés (reprise). Les HEIC sont convertis en JPEG dans le
          navigateur.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-[15px] font-semibold text-ink">
          Groupes proposés (par heure de prise de vue)
        </h2>
        {groupes.length === 0 && (
          <p className="text-sm text-muted">Aucune photo non assignée.</p>
        )}
        {groupes.map((groupe, i) => (
          <GroupeCard
            key={groupe.map((p) => p.id).join("-")}
            index={i}
            photos={groupe as Photo[]}
            urls={urls}
            equipements={equipements}
            dossierId={dossierId}
            onAssigned={recharger}
          />
        ))}
      </section>

      <section className="border-t border-border pt-4">
        <form action={createEquipement}>
          <input type="hidden" name="dossier_id" value={dossierId} />
          <Button type="submit" variant="secondary">
            + Créer un équipement sans photo
          </Button>
        </form>
      </section>
    </div>
  );
}

function GroupeCard({
  index,
  photos,
  urls,
  equipements,
  dossierId,
  onAssigned,
}: {
  index: number;
  photos: Photo[];
  urls: Record<string, string>;
  equipements: Equipement[];
  dossierId: string;
  onAssigned: () => Promise<void>;
}) {
  const [cible, setCible] = useState<string>(""); // "" = nouvel équipement
  const [nouvelNom, setNouvelNom] = useState("");
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function confirmer() {
    setBusy(true);
    try {
      await assignerGroupe({
        dossierId,
        equipementId: cible || null,
        nouvelEquipementNom: cible ? null : nouvelNom,
        photos: photos.map((p) => ({
          id: p.id,
          nom_affichage: noms[p.id] ?? p.nom_original,
        })),
      });
      await onAssigned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
      <div className="text-xs text-muted">
        Groupe {index + 1} — {photos.length} photo{photos.length > 1 ? "s" : ""}
      </div>

      <div className="flex flex-wrap gap-4">
        {photos.map((p) => (
          <div key={p.id} className="w-40 space-y-1">
            {urls[p.storage_path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[p.storage_path]}
                alt={p.nom_original ?? ""}
                className="w-40 h-40 object-cover rounded-md border border-border"
              />
            ) : (
              <div className="w-40 h-40 rounded-md border border-border bg-bg" />
            )}
            <Input
              value={noms[p.id] ?? p.nom_original ?? ""}
              onChange={(e) => setNoms((m) => ({ ...m, [p.id]: e.target.value }))}
              className="text-xs"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label htmlFor={`eq-${index}`}>Équipement</Label>
          <Select
            id={`eq-${index}`}
            value={cible}
            onChange={(e) => setCible(e.target.value)}
          >
            <option value="">+ Nouvel équipement</option>
            {equipements.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.nom ?? "—"}
              </option>
            ))}
          </Select>
        </div>
        {!cible && (
          <div className="w-56">
            <Label htmlFor={`nom-${index}`}>Nom du nouvel équipement</Label>
            <Input
              id={`nom-${index}`}
              value={nouvelNom}
              onChange={(e) => setNouvelNom(e.target.value)}
              placeholder="Nouvel équipement"
            />
          </div>
        )}
        <Button type="button" onClick={confirmer} disabled={busy}>
          {busy ? "…" : "Confirmer et assigner"}
        </Button>
      </div>
    </div>
  );
}
