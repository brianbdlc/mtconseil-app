import { createClient } from "@/lib/supabase/server";
import { updateTemplate } from "@/app/dossiers/actions";
import { Button, Label } from "@/components/ui";

// Textes fixes du modèle de rapport (méthodologie, ASHRAE, risques SSE génériques). Admin-only
// (RLS is_admin()). Chaque enregistrement incrémente la version ; chaque rapport gèle le texte réel
// + son n° dans son snapshot.
export default async function ModelePage() {
  const supabase = await createClient();

  const { data: modele } = await supabase
    .from("report_templates")
    .select("id, methodologie, norme_ashrae, risques_sse, version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!modele) {
    return <p className="text-sm text-muted">Aucun modèle initialisé.</p>;
  }

  const champs = [
    { name: "methodologie", label: "Méthodologie", valeur: modele.methodologie },
    { name: "norme_ashrae", label: "Norme ASHRAE", valeur: modele.norme_ashrae },
    { name: "risques_sse", label: "Risques SSE génériques", valeur: modele.risques_sse },
  ] as const;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-ink">Modèle de rapport</h1>
          <span className="text-sm text-muted tabular-nums">Version {modele.version}</span>
        </div>
        <p className="text-sm text-muted mt-1">
          Réservé aux administrateurs. Enregistrer incrémente le n° de version. Chaque rapport gèle
          le texte et la version utilisés au moment de sa soumission.
        </p>
      </div>

      <form action={updateTemplate} className="border border-border rounded-lg bg-surface p-4 space-y-4">
        <input type="hidden" name="id" value={modele.id} />
        {champs.map((c) => (
          <div key={c.name}>
            <Label htmlFor={c.name}>{c.label}</Label>
            <textarea
              id={c.name}
              name={c.name}
              rows={5}
              defaultValue={c.valeur ?? ""}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink"
            />
          </div>
        ))}
        <Button type="submit">Enregistrer (nouvelle version)</Button>
      </form>
    </div>
  );
}
