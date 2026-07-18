import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "RPG Table — Créer une partie" },
      { name: "description", content: "Créez une nouvelle partie de jeu de rôle." },
      { property: "og:title", content: "RPG Table — Créer une partie" },
      { property: "og:description", content: "Créez une nouvelle partie de jeu de rôle." },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  return (
    <MobileShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Créer une partie
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Préparez votre campagne et invitez vos joueurs.
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
