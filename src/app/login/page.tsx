"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setMsg("Identifiants invalides.");
      return;
    }
    router.push("/dossiers");
    router.refresh();
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/confirm?next=/auth/update-password`,
    });
    setBusy(false);
    setMsg(
      error
        ? "Erreur lors de l'envoi."
        : "Si ce compte existe, un courriel de récupération a été envoyé.",
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-[22px] font-semibold text-ink mb-1">MT Conseil</h1>
        <p className="text-sm text-muted mb-6">Audit énergétique — accès interne</p>

        <form onSubmit={mode === "login" ? signIn : forgot} className="space-y-4">
          <div>
            <Label htmlFor="email">Courriel</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode === "login" && (
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {msg && <p className="text-sm text-muted">{msg}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "…"
              : mode === "login"
                ? "Se connecter"
                : "Envoyer le lien"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 text-xs text-primary hover:underline cursor-pointer"
          onClick={() => {
            setMsg(null);
            setMode(mode === "login" ? "forgot" : "login");
          }}
        >
          {mode === "login"
            ? "Mot de passe oublié ?"
            : "← Retour à la connexion"}
        </button>
      </div>
    </main>
  );
}
