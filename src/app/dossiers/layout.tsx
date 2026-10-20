import Link from "next/link";
import { signOut } from "./actions";

export default function DossiersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-6">
        <Link href="/dossiers" className="font-semibold text-ink">
          MT Conseil
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-muted hover:text-ink cursor-pointer"
          >
            Déconnexion
          </button>
        </form>
      </header>
      <main className="max-w-[1120px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
