import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Play, Check, Trash2, QrCode, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { AIService } from "@/lib/ai/ai-service";
import { AIDebugPanel } from "@/components/ai-debug-panel";
import type { AIResult, SceneResponse } from "@/lib/ai/types";

function campaignQuery(id: string) {
  return {
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data: campaign, error: cErr } = await supabase
        .from("campaigns")
        .select("id, name, description, inspiration, genre, status, invite_code, owner_id, gm_plays")
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
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [inspiration, setInspiration] = useState(data.campaign.inspiration ?? "");
  const [savingInspiration, setSavingInspiration] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/campaigns/join?campaign=${id}`);
    }
  }, [id]);

  async function shareInvite() {
    const text = `Rejoignez « ${data.campaign.name} » sur Campfire — code ${data.campaign.invite_code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Campfire", text, url: joinUrl });
      else await navigator.clipboard.writeText(`${text}\n${joinUrl}`);
    } catch {
      /* partage annulé */
    }
  }

  function downloadQr() {
    const canvas = document.querySelector<HTMLCanvasElement>("#campfire-qr canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `campfire-${data.campaign.invite_code}.png`;
    link.click();
  }

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
    setAiError(null);

    const { data: characters } = await supabase
      .from("characters")
      .select("user_id, name, race, class_profession, level, backstory")
      .eq("campaign_id", id);

    const roster = (characters ?? []).map((c) => ({
      id: c.user_id,
      name: c.name || "Aventurier",
      role: c.user_id === data.campaign.owner_id ? "gm" : "player",
    }));

    const result = await AIService.startCampaign({
      campaignId: id,
      seed: {
        id,
        name: data.campaign.name,
        type: data.campaign.genre,
        universe: data.campaign.description,
        inspiration: data.campaign.inspiration,
        gmPlays: data.campaign.gm_plays,
      },
      characters: characters ?? [],
      roster,
    });

    setAiResult(result);
    if (result.ok && result.data) {
      setScene(result.data);
      const { error } = await supabase.from("campaigns").update({ status: "active" }).eq("id", id);
      if (!error) queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      setBusy(false);
      navigate({ to: "/campaigns/$id/play", params: { id } });
      return;
    } else {
      setAiError(result.errorMessage ?? "Le MJ IA est indisponible.");
    }
    setBusy(false);
  }

  const nonGmPlayers = data.players.filter((p) => p.role !== "gm");
  const allReady = nonGmPlayers.length > 0 && nonGmPlayers.every((p) => p.status === "ready");

  async function deleteCampaign() {
    setBusy(true);
    setDeleteError(null);
    const tables = ["dice_rolls", "dice_requests", "messages", "campaign_memory", "characters", "campaign_players"] as const;
    for (const table of tables) {
      await supabase.from(table).delete().eq("campaign_id", id);
    }
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    setBusy(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    navigate({ to: "/home" });
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

        {isOwner ? (
          <label className="flex flex-col gap-2 rounded-2xl border border-rpg/25 bg-card p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Inspiration (facultatif)
            </span>
            <textarea
              rows={3}
              value={inspiration}
              onChange={(e) => {
                setInspiration(e.target.value);
                setSavingInspiration("idle");
              }}
              className="rpg-input resize-none"
              placeholder="Quelles œuvres, univers ou ambiances inspirent cette campagne ? Ex. Final Fantasy, One Piece, Dragon Quest..."
            />
            <span className="text-[11px] text-muted-foreground">
              Ces références servent à orienter l'ambiance et le style de l'univers.
            </span>
            <button
              type="button"
              disabled={savingInspiration === "saving"}
              onClick={async () => {
                setSavingInspiration("saving");
                await supabase
                  .from("campaigns")
                  .update({ inspiration: inspiration.trim() || null })
                  .eq("id", id);
                await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
                setSavingInspiration("saved");
              }}
              className="self-start rounded-xl border border-rpg/40 bg-rpg/10 px-3 py-1.5 text-[11px] text-rpg disabled:opacity-50"
            >
              {savingInspiration === "saving"
                ? "..."
                : savingInspiration === "saved"
                  ? "Inspiration enregistrée"
                  : "Enregistrer l'inspiration"}
            </button>
          </label>
        ) : (
          data.campaign.inspiration && (
            <p className="text-xs text-muted-foreground">
              Inspirations : {data.campaign.inspiration}
            </p>
          )
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

        {joinUrl && (
          <section
            id="campfire-qr"
            className="flex flex-col items-center gap-3 rounded-2xl border border-rpg/30 bg-card p-4"
          >
            <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-rpg">
              <QrCode className="h-4 w-4" /> QR Code de la campagne
            </h2>
            <span className="rounded-xl bg-white p-2">
              <QRCodeCanvas value={joinUrl} size={148} includeMargin={false} />
            </span>
            <p className="text-center text-[11px] text-muted-foreground">
              Scannez pour rejoindre directement le lobby.
            </p>
            <div className="grid w-full grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(joinUrl)}
                className="rounded-xl border border-rpg/30 bg-secondary px-2 py-2 text-[11px] text-foreground"
              >
                Copier
              </button>
              <button
                type="button"
                onClick={downloadQr}
                className="rounded-xl border border-rpg/30 bg-secondary px-2 py-2 text-[11px] text-foreground"
              >
                Télécharger
              </button>
              <button
                type="button"
                onClick={shareInvite}
                className="flex items-center justify-center gap-1 rounded-xl border border-rpg/40 bg-rpg/10 px-2 py-2 text-[11px] text-rpg"
              >
                <Share2 className="h-3.5 w-3.5" /> Partager
              </button>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg tracking-wide text-foreground">
            Participants ({data.players.length})
          </h2>
          <Link
            to="/campaigns/$id/character"
            params={{ id: data.campaign.id }}
            className="mb-1 flex items-center justify-center gap-2 rounded-xl border border-rpg/40 bg-secondary px-4 py-3 font-display tracking-wide text-foreground"
          >
            {isReady ? "Modifier mon personnage" : "Créer mon personnage"}
          </Link>
          {data.campaign.status === "active" && (
            <Link
              to="/campaigns/$id/play"
              params={{ id: data.campaign.id }}
              className="mb-1 flex items-center justify-center gap-2 rounded-xl border border-rpg bg-rpg/10 px-4 py-3 font-display tracking-wide text-rpg"
            >
              Rejoindre la partie en cours
            </Link>
          )}
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
          <>
          <button
            type="button"
            onClick={startCampaign}
            disabled={busy || (!allReady && !aiError)}
            className="rpg-button disabled:opacity-50"
          >
            <Play className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">
              {busy
                ? "Le MJ prépare la scène…"
                : aiError
                  ? "Réessayer"
                  : data.campaign.status === "active"
                    ? "Relancer une scène"
                    : allReady
                      ? "Lancer la campagne"
                      : "En attente des joueurs…"}
            </span>
          </button>
          {aiError && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {aiError}
            </p>
          )}
          <AIDebugPanel result={aiResult} />
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 font-display tracking-wide text-destructive"
          >
            <Trash2 className="h-4 w-4 shrink-0" /> Supprimer la campagne
          </button>
          </>
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

        {scene && (
          <section className="flex flex-col gap-3 rounded-2xl border border-rpg/30 bg-card p-4">
            <h2 className="font-display text-xl tracking-wide text-foreground">{scene.scene_title}</h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{scene.narration}</p>
            {scene.suggested_actions.length > 0 && (
              <ul className="flex flex-col gap-2">
                {scene.suggested_actions.map((a) => (
                  <li
                    key={a}
                    className="rounded-xl border border-rpg/20 bg-secondary px-3 py-2 text-sm text-foreground"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {confirmDelete && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-4 backdrop-blur">
            <div className="w-full max-w-sm rounded-3xl border border-destructive/40 bg-card p-5">
              <h2 className="font-display text-lg tracking-wide text-foreground">Supprimer définitivement ?</h2>
              <p className="pt-2 text-sm text-muted-foreground">
                La campagne « {data.campaign.name} », ses personnages, son journal et tous ses messages seront
                effacés. Cette action est irréversible.
              </p>
              {deleteError && <p className="pt-2 text-sm text-destructive">{deleteError}</p>}
              <div className="grid grid-cols-2 gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl border border-rpg/30 bg-secondary px-4 py-3 font-display tracking-wide text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={deleteCampaign}
                  disabled={busy}
                  className="rounded-xl border border-destructive/60 bg-destructive/20 px-4 py-3 font-display tracking-wide text-destructive disabled:opacity-50"
                >
                  {busy ? "Suppression…" : "Supprimer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </MobileShell>
  );
}