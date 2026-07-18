import { createFileRoute, Link } from "@tanstack/react-router";
import { Swords, Users } from "lucide-react";
import { LogoTemp } from "@/components/logo-temp";
import { MobileShell } from "@/components/mobile-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campfire — Accueil" },
      { name: "description", content: "Rejoignez ou créez une partie de jeu de rôle." },
      { property: "og:title", content: "Campfire — Accueil" },
      { property: "og:description", content: "Rejoignez ou créez une partie de jeu de rôle." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <MobileShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <LogoTemp />

        <div className="flex w-full flex-col gap-4">
          <Link
            to="/create"
            className="rpg-button"
            activeOptions={{ exact: true }}
          >
            <Swords className="h-6 w-6 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Créer une partie</span>
          </Link>

          <Link
            to="/join"
            className="rpg-button"
            activeOptions={{ exact: true }}
          >
            <Users className="h-6 w-6 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Rejoindre une partie</span>
          </Link>
        </div>
      </div>
    </MobileShell>
  );
}
