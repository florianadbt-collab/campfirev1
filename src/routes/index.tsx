import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogoTemp } from "@/components/logo-temp";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campfire — JDR assisté par IA" },
      { name: "description", content: "Jouez à des jeux de rôle en ligne avec l'IA comme maître du jeu." },
      { property: "og:title", content: "Campfire — JDR assisté par IA" },
      { property: "og:description", content: "Jouez à des jeux de rôle en ligne avec l'IA comme maître du jeu." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/home", replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) {
    return (
      <MobileShell>
        <div className="flex flex-1 items-center justify-center">
          <LogoTemp />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <LogoTemp />
        <p className="text-center text-sm text-muted-foreground">
          Bienvenue autour du feu. Créez votre héros et rejoignez l'aventure.
        </p>
        <div className="flex w-full flex-col gap-4">
          <Link to="/auth" search={{ mode: "signin" }} className="rpg-button">
            <span className="font-display tracking-wide">Se connecter</span>
          </Link>
          <Link to="/auth" search={{ mode: "signup" }} className="rpg-button">
            <span className="font-display tracking-wide">Créer un compte</span>
          </Link>
        </div>
      </div>
    </MobileShell>
  );
}
