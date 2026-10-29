import type { ComponentProps } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" }) {
  const base =
    "inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
  const style =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-hover"
      : "bg-surface text-ink border border-n300 hover:bg-n100";
  return <button className={`${base} ${style} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`h-9 w-full px-3 text-sm bg-surface text-ink border border-border rounded-md outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`h-9 w-full px-3 text-sm bg-surface text-ink border border-border rounded-md outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`block text-xs font-medium text-muted mb-1 ${className}`}
      {...props}
    />
  );
}

// Primitive produit : pastille d'état. Couvre les statuts de dossier et, à terme,
// les états de champ (validé/à confirmer/non validé — lisible/partiel/illisible).
const CHIP: Record<string, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-n100 text-muted border-border" },
  soumis: {
    label: "Soumis",
    cls: "bg-primary-soft text-primary border-primary",
  },
  approuve: {
    label: "Approuvé",
    cls: "bg-[#e8f3ec] text-success border-success",
  },
  exporte: { label: "Exporté", cls: "bg-[#e8f3ec] text-success border-success" },
  a_corriger: {
    label: "À corriger",
    cls: "bg-[#fbeeec] text-error border-error",
  },
  // États de champ IA (Phase 2) : confiance de lecture + statut de validation.
  lisible: { label: "Lisible", cls: "bg-[#e8f3ec] text-success border-success" },
  partiel: { label: "Partiel", cls: "bg-[#fdf3e6] text-[#9a6700] border-[#d9a441]" },
  illisible: { label: "Illisible", cls: "bg-[#fbeeec] text-error border-error" },
  non_valide: { label: "À valider", cls: "bg-n100 text-muted border-border" },
  valide: { label: "Validé", cls: "bg-[#e8f3ec] text-success border-success" },
  // Phase 3 (DESIGN.md:31-32) : ambre "à confirmer", rouge "à traiter".
  a_confirmer: { label: "À confirmer", cls: "bg-[#fdf3e6] text-[#9A6410] border-[#d9a441]" },
  hors_categorie: { label: "À traiter", cls: "bg-[#fbeeec] text-error border-error" },
};

export function StatusChip({ status }: { status: string }) {
  const s = CHIP[status] ?? { label: status, cls: "bg-n100 text-muted border-border" };
  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded-full border text-[11px] font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
