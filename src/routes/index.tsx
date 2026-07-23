import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LogoTemp } from "@/components/logo-temp";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalIdentity, getLocalIdentity, setLocalIdentity } from "@/lib/local-identity";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Campfire — JDR assisté par IA" },
      { name: "description", content: "Jouez à des jeux de rôle en ligne avec l'IA comme maître du jeu." },
      { property: "og:title", content: "Campfire — JDR assisté par IA" },
      { property: "og:description", content: "Jouez à des jeux de rôle en ligne avec l'IA comme maître du jeu." },
    ],
  }),
  component: BootstrapPage,
});

type Phase = "loading" | "pseudo" | "error";

function BootstrapPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [pseudo, setPseudo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const local = getLocalIdentity();
        let { data: sessionData } = await supabase.auth.getSession();
        let user = sessionData.session?.user ?? null;

        // Reuse local identity when a matching Supabase session already exists.
        if (local && user && user.id === local.userId) {
          navigate({ to: "/home", replace: true });
          return;
        }

        // Local identity stored but session was lost (cleared cookies, etc.):
        // drop stale local data and fall through to pseudo creation.
        if (local && (!user || user.id !== local.userId)) {
          clearLocalIdentity();
        }

        // No session yet → create an anonymous one for the new player.
        if (!user) {
          const { error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) throw anonError;
          ({ data: sessionData } = await supabase.auth.getSession());
          user = sessionData.session?.user ?? null;
          if (!user) throw new Error("Session introuvable");
        }

        setPseudo("");
        setPhase("pseudo");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setPhase("error");
      }
    })();
  }, [navigate]);

  async function handlePseudoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = pseudo.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session introuvable");

      const { error: upErr } = await supabase
        .from("profiles")
        .update({ username: value })
        .eq("id", userId);
      if (upErr) {
        if (upErr.code === "23505") {
          throw new Error("Ce pseudo est déjà pris.");
        }
        throw upErr;
      }
      await supabase.auth.updateUser({ data: { username: value, pseudo_set: true } });
      setLocalIdentity({ userId, pseudo: value });
      navigate({ to: "/home", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading") {
    return (
      <MobileShell>
        <div className="flex flex-1 items-center justify-center">
          <LogoTemp />
        </div>
      </MobileShell>
    );
  }

  if (phase === "error") {
    return (
      <MobileShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <LogoTemp />
          <p className="text-center text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rpg-button"
          >
            <span className="font-display tracking-wide">Réessayer</span>
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <LogoTemp />
        <div className="w-full text-center">
          <h1 className="font-display text-2xl tracking-wide text-foreground">
            Choisis ton pseudo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Il sera visible par les autres aventuriers.
          </p>
        </div>
        <form onSubmit={handlePseudoSubmit} className="flex w-full flex-col gap-4">
          <input
            type="text"
            required
            autoFocus
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            className="rpg-input"
            placeholder="Aragorn"
            maxLength={32}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={saving || !pseudo.trim()} className="rpg-button disabled:opacity-50">
            <span className="font-display tracking-wide">
              {saving ? "..." : "Entrer dans Campfire"}
            </span>
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
