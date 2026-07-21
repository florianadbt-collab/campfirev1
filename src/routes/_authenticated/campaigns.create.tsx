import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { generateInviteCode } from "@/lib/invite-code";

const GENRES = ["Médiéval-fantastique", "Science-fiction", "Cyberpunk", "Horreur", "Post-apocalyptique", "Contemporain", "Autre"];

export const Route = createFileRoute("/_authenticated/campaigns/create")({
  head: () => ({
    meta: [
      { title: "Campfire — Nouvelle campagne" },
      { name: "description", content: "Créez une campagne Campfire." },
    ],
  }),
  component: CreateCampaignPage,
});

function CreateCampaignPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [gmPlays, setGmPlays] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Non connecté");

      const inviteCode = generateInviteCode(6);
      const { data: campaign, error: cErr } = await supabase
        .from("campaigns")
        .insert({
          owner_id: userId,
          name: name.trim(),
          description: description.trim() || null,
          genre,
          gm_plays: gmPlays,
          invite_code: inviteCode,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;

      const { error: pErr } = await supabase.from("campaign_players").insert({
        campaign_id: campaign.id,
        user_id: userId,
        role: "gm",
      });
      if (pErr) throw pErr;

      navigate({ to: "/campaigns/$id", params: { id: campaign.id }, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  return (
    <MobileShell>
      <header className="flex items-center gap-3 pb-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/home" })}
          className="rounded-full border border-rpg/30 bg-card p-2 text-rpg"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl tracking-wide text-foreground">Nouvelle campagne</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nom de la campagne
          </span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="rpg-input" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Description de l'univers
          </span>
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rpg-input resize-none"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Genre / Ambiance
          </span>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="rpg-input">
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between rounded-2xl border border-rpg/30 bg-card px-4 py-3">
          <span className="text-sm text-foreground">Le MJ joue aussi</span>
          <input
            type="checkbox"
            checked={gmPlays}
            onChange={(e) => setGmPlays(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-rpg)]"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button type="submit" disabled={loading} className="rpg-button disabled:opacity-50">
          <span className="font-display tracking-wide">{loading ? "..." : "Créer la campagne"}</span>
        </button>
      </form>
    </MobileShell>
  );
}