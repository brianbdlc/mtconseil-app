"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { enregistrerOptima, confirmerOptima } from "../actions";
import { Button, Label, StatusChip } from "@/components/ui";

const BUCKET = "optima";

// Annexe Optima (US-50/US-51) : UN seul PDF par dossier, inséré tel quel. L'app ne le lit NI ne
// le recalcule. Self-contained (miroir FacturesPage) : lit/écrit l'état via le client navigateur.
export function OptimaSection({ dossierId }: { dossierId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [path, setPath] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const { data } = await supabase
      .from("dossiers")
      .select("optima_path, optima_confirme")
      .eq("id", dossierId)
      .single();
    setPath(data?.optima_path ?? null);
    setConfirme(data?.optima_confirme ?? false);
    if (data?.optima_path) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(data.optima_path, 3600);
      setUrl(signed?.signedUrl ?? null);
    } else {
      setUrl(null);
    }
  }, [supabase, dossierId]);

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
      // sha256 natif navigateur sur les octets du PDF (provenance de l'annexe, hors calcul).
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const sha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const storagePath = `${dossierId}/optima.pdf`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;

      await enregistrerOptima(dossierId, storagePath, sha256); // re-upload dé-confirme
      await recharger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "échec du téléversement");
    } finally {
      setBusy(false);
    }
  }

  async function confirmer() {
    setBusy(true);
    try {
      await confirmerOptima(dossierId);
      await recharger();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-ink">Rapport Optima (annexe)</h2>
        <p className="text-xs text-muted">
          PDF inséré tel quel en annexe du rapport final. L&apos;app ne le lit ni ne le recalcule.
        </p>
      </div>

      <div className="border border-border rounded-lg bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            {path && url ? (
              <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
                optima.pdf
              </a>
            ) : (
              <span>Aucun PDF téléversé.</span>
            )}
            {path && <StatusChip status={confirme ? "valide" : "non_valide"} />}
          </div>
          {path && !confirme && (
            <Button type="button" disabled={busy} onClick={confirmer}>
              Confirmer
            </Button>
          )}
        </div>

        <div>
          <Label htmlFor="optima-file">{path ? "Remplacer le PDF" : "Téléverser le PDF Optima"}</Label>
          <input
            id="optima-file"
            type="file"
            accept="application/pdf"
            onChange={onFile}
            disabled={busy}
            className="text-sm"
          />
          {path && (
            <p className="text-xs text-muted mt-1">Remplacer le fichier annule la confirmation.</p>
          )}
        </div>

        {erreur && <div className="text-sm text-error">{erreur}</div>}
      </div>
    </section>
  );
}
