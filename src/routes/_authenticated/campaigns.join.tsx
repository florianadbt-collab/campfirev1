import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/campaigns/join")({
  head: () => ({
    meta: [
      { title: "Campfire — Rejoindre une campagne" },
      { name: "description", content: "Rejoignez une campagne avec un code d'invitation." },
    ],
  }),
  component: JoinCampaignPage,
});

function JoinCampaignPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cleaned = code.trim().toUpperCase();
      if (!cleaned) throw new Error("Entrez un code.");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Non connecté");

      const { data: found, error: findErr } = await supabase.rpc("find_campaign_by_invite_code", {
        _code: cleaned,
      });
      if (findErr) throw findErr;
      const campaign = Array.isArray(found) ? found[0] : found;
      if (!campaign) throw new Error("Aucune campagne trouvée avec ce code.");

      const { error: insertErr } = await supabase
        .from("campaign_players")
        .upsert(
          { campaign_id: campaign.id, user_id: userId, role: "player", status: "connected" },
          { onConflict: "campaign_id,user_id" },
        );
      if (insertErr) throw insertErr;

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
        <h1 className="font-display text-xl tracking-wide text-foreground">Rejoindre</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col justify-center gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Code d'invitation
          </span>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="rpg-input text-center font-display text-2xl tracking-[0.4em]"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button type="submit" disabled={loading} className="rpg-button disabled:opacity-50">
          <span className="font-display tracking-wide">{loading ? "..." : "Rejoindre"}</span>
        </button>
      </form>
    </MobileShell>
  );
}