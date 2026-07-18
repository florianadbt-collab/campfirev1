import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "RPG Table — Rejoindre une partie" },
      { name: "description", content: "Rejoignez une partie de jeu de rôle existante." },
      { property: "og:title", content: "RPG Table — Rejoindre une partie" },
      { property: "og:description", content: "Rejoignez une partie de jeu de rôle existante." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  return (
    <MobileShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Rejoindre une partie
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entrez le code de la partie pour la rejoindre.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Logique métier à venir ici.
          </p>
        </div>

        <Link
          to="/"
          className="rpg-button"
        >
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Retour</span>
        </Link>
      </div>
    </MobileShell>
  );
}
