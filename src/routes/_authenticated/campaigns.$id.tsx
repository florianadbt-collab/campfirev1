import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Play, Check } from "lucide-react";
import { useEffect, useState } from "react";
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
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => setUserId(u.user?.id ?? null));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_players", filter: `campaign_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["campaign", id] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["campaign", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.campaign.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const isOwner = userId === data.campaign.owner_id;
  const me = data.players.find((p) => p.user_id === userId);
  const isReady = me?.status === "ready";

  async function toggleReady() {
    if (!userId || !me) return;
    setBusy(true);
    const nextStatus = isReady ? "connected" : "ready";
    const { error } = await supabase
      .from("campaign_players")
      .update({ status: nextStatus })
      .eq("campaign_id", id)
      .eq("user_id", userId);
    if (!error) queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    setBusy(false);
  }

  async function startCampaign() {
    setBusy(true);
    const { error } = await supabase
      .from("campaigns")
      .update({ status: "active" })
      .eq("id", id);
    if (!error) queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    setBusy(false);
  }

  const nonGmPlayers = data.players.filter((p) => p.role !== "gm");
  const allReady = nonGmPlayers.length > 0 && nonGmPlayers.every((p) => p.status === "ready");

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

        {isOwner && (
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
        )}

        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg tracking-wide text-foreground">
            Participants ({data.players.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {data.players.map((p) => {
              const profile = p.profile;
              const isGm = p.role === "gm";
              const ready = p.status === "ready";
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
                  {isGm ? (
                    <span className="rounded-full border border-rpg/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rpg">
                      MJ
                    </span>
                  ) : (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        ready
                          ? "border-rpg/60 bg-rpg/10 text-rpg"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {ready ? "Prêt" : "Pas prêt"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {isOwner ? (
          <button
            type="button"
            onClick={startCampaign}
            disabled={busy || !allReady || data.campaign.status === "active"}
            className="rpg-button disabled:opacity-50"
          >
            <Play className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">
              {data.campaign.status === "active"
                ? "Partie démarrée"
                : allReady
                  ? "Démarrer la partie"
                  : "En attente des joueurs…"}
            </span>
          </button>
        ) : me ? (
          <button
            type="button"
            onClick={toggleReady}
            disabled={busy}
            className="rpg-button disabled:opacity-50"
          >
            <Check className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">
              {isReady ? "Annuler prêt" : "Je suis prêt"}
            </span>
          </button>
        ) : null}
      </section>
    </MobileShell>
  );
}