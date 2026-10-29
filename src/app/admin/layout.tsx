import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";

// Garde-fou UI : seul un admin accède à /admin/*. L'écriture reste de toute façon bloquée par
// la RLS (is_admin()) côté base — ceci évite d'afficher une page qui échouerait.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profil } = user
    ? await supabase.from("profiles").select("role, actif").eq("id", user.id).single()
    : { data: null };

  if (!profil || profil.role !== "admin" || profil.actif !== true) {
    redirect("/dossiers");
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="max-w-[1120px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
