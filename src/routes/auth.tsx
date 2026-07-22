import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogoTemp } from "@/components/logo-temp";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "signin" | "signup";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: AuthMode } => {
    const mode = search.mode;
    return { mode: mode === "signup" || mode === "signin" ? mode : "signin" };
  },
  head: () => ({
    meta: [
      { title: "Campfire — Connexion" },
      { name: "description", content: "Connectez-vous à Campfire." },
      { property: "og:title", content: "Campfire — Connexion" },
      { property: "og:description", content: "Connectez-vous à Campfire." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!username.trim()) throw new Error("Le nom d'utilisateur est requis.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.trim(),
              avatar_url: avatarUrl.trim() || null,
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw signInError;
        }
        navigate({ to: "/home", replace: true });
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        navigate({ to: "/home", replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-8 py-6">
        <div className="flex justify-center">
          <LogoTemp />
        </div>

        <div className="flex rounded-2xl border border-rpg/30 bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-display tracking-wide transition-colors ${
              mode === "signin" ? "bg-rpg/20 text-foreground" : "text-muted-foreground"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-display tracking-wide transition-colors ${
              mode === "signup" ? "bg-rpg/20 text-foreground" : "text-muted-foreground"
            }`}
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <>
              <Field label="Nom d'utilisateur">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rpg-input"
                  placeholder="Aragorn"
                />
              </Field>
              <Field label="Avatar (URL, optionnel)">
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="rpg-input"
                  placeholder="https://..."
                />
              </Field>
            </>
          )}
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rpg-input"
              autoComplete="email"
            />
          </Field>
          <Field label="Mot de passe">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rpg-input"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-rpg">{info}</p>}

          <button type="submit" disabled={loading} className="rpg-button disabled:opacity-50">
            <span className="font-display tracking-wide">
              {loading ? "..." : mode === "signup" ? "Créer le compte" : "Se connecter"}
            </span>
          </button>
        </form>

        <Link to="/" className="text-center text-sm text-muted-foreground hover:text-foreground">
          Retour
        </Link>
      </div>
    </MobileShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}