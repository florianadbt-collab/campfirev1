import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy } from "lucide-react";
import { useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";

function campaignQuery(id: string) {
  return {
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data: campaign, error: cErr } = await supabase
        .from("campaigns")
        .select("id, name, description, genre, status, invite_code, owner_id, gm_plays")
        .eq("id", id)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!campaign) throw new Error("Campagne introuvable");

      const { data: players, error: pErr } = await supabase
        .from("campaign_players")
        .select("user_id, role, status")
        .eq("campaign_id", id);
      if (pErr) throw pErr;

      const userIds = (players ?? []).map((p) => p.user_id);
      let profilesById: Record<string, { id: string; username: string; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles, error: prErr } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", userIds);
        if (prErr) throw prErr;
        for (const pr of profiles ?? []) profilesById[pr.id] = pr;
      }
      const enriched = (players ?? []).map((p) => ({ ...p, profile: profilesById[p.user_id] ?? null }));
      return { campaign, players: enriched };
    },
  };
}

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campfire — Campagne" },
      { name: "description", content: "Détail de la campagne." },
    ],
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(campaignQuery(params.id));
  },
  component: CampaignPage,
});

function CampaignPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(campaignQuery(id));
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.campaign.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
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
        <h1 className="font-display text-xl tracking-wide text-foreground">{data.campaign.name}</h1>
      </header>

      <section className="flex flex-col gap-4">
        {data.campaign.genre && (
          <p className="text-xs uppercase tracking-wider text-rpg">{data.campaign.genre}</p>
        )}
        {data.campaign.description && (
          <p className="text-sm text-muted-foreground">{data.campaign.description}</p>
        )}

        <button
          type="button"
          onClick={copyCode}
          className="flex items-center justify-between rounded-2xl border border-rpg/30 bg-card px-4 py-3"
        >
          <div className="flex flex-col text-left">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Code d'invitation
            </span>
            <span className="font-display text-2xl tracking-[0.4em] text-foreground">
              {data.campaign.invite_code}
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs text-rpg">
            <Copy className="h-4 w-4" />
            {copied ? "Copié" : "Copier"}
          </span>
        </button>

        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg tracking-wide text-foreground">
            Joueurs ({data.players.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {data.players.map((p) => {
              const profile = p.profile;
              return (
                <li
                  key={p.user_id}
                  className="flex items-center justify-between rounded-2xl border border-rpg/20 bg-card/70 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 overflow-hidden rounded-full border border-rpg/30 bg-card">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-display text-sm text-rpg">
                          {(profile?.username ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="font-display tracking-wide text-foreground">
                      {profile?.username ?? "—"}
                    </span>
                  </div>
                  <span className="text-xs uppercase tracking-wider text-rpg">{p.role}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </MobileShell>
  );
}