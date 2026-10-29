import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/dossiers/actions";

// En-tête partagé (dossiers, valeurs par défaut, paramètres admin). Le lien Paramètres
// n'apparaît que pour un admin.
export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, actif")
      .eq("id", user.id)
      .single();
    isAdmin = data?.role === "admin" && data.actif === true;
  }

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-6">
      <nav className="flex items-center gap-5">
        <Link href="/dossiers" className="font-semibold text-ink">
          MT Conseil
        </Link>
        <Link href="/dossiers" className="text-sm text-muted hover:text-ink">
          Dossiers
        </Link>
        <Link href="/valeurs-defaut" className="text-sm text-muted hover:text-ink">
          Valeurs par défaut
        </Link>
        {isAdmin && (
          <Link href="/admin/parametres" className="text-sm text-muted hover:text-ink">
            Paramètres
          </Link>
        )}
      </nav>
      <form action={signOut}>
        <button type="submit" className="text-xs text-muted hover:text-ink cursor-pointer">
          Déconnexion
        </button>
      </form>
    </header>
  );
}
