import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, PenLine, Play, RefreshCw, RotateCcw, Send, Theater } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AIService } from "@/lib/ai/ai-service";
import { AIDebugPanel } from "@/components/ai-debug-panel";
import {
  AbilitiesPanel,
  InventoryPanel,
  JournalPanel,
  PartyPanel,
  StatsPanel,
} from "@/components/game/panels";
import { AmbianceBar } from "@/components/game/ambiance-bar";
import { GameMenus } from "@/components/game/game-menus";
import { MusicPlayer } from "@/components/game/music-player";
import { IllustrationSlot } from "@/components/game/illustration";
import { DiceRollerDialog, type DiceOutcome, type DiceRequest } from "@/components/game/dice-roller";
import { TurnBanner, canPlayerAct, sequentialTurn, turnStateFrom } from "@/components/game/turn-banner";
import { sheetFromRow, EMPTY_SHEET } from "@/lib/character-sheet";
import type { AIResult, SceneResponse } from "@/lib/ai/types";
import { spotifyAmbiance } from "@/lib/spotify/spotify.functions";
import type { MusicCommand } from "@/lib/spotify/moods";

export const Route = createFileRoute("/_authenticated/campaigns/$id_/play")({
  head: () => ({
    meta: [
      { title: "Campfire — Partie en cours" },
      { name: "description", content: "Vivez votre campagne narrée par le MJ IA de Campfire." },
      { property: "og:title", content: "Campfire — Partie en cours" },
      { property: "og:description", content: "Narration, personnages et journal de campagne en direct." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayPage,
});

type Tab = "perso" | "recit" | "journal";

function PlayPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("recit");
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [dice, setDice] = useState<DiceRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [gmMode, setGmMode] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const gameQ = useQuery({
    queryKey: ["play", id],
    queryFn: async () => {
      const [{ data: campaign }, { data: messages }, { data: characters }, { data: players }] =
        await Promise.all([
          supabase
            .from("campaigns")
            .select("id, name, genre, description, gm_plays, owner_id, status")
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("messages")
            .select("id, role, content, metadata, user_id, created_at")
            .eq("campaign_id", id)
            .order("created_at", { ascending: true }),
          supabase.from("characters").select("*").eq("campaign_id", id),
          supabase.from("campaign_players").select("user_id, role, status").eq("campaign_id", id),
        ]);
      return {
        campaign,
        messages: messages ?? [],
        characters: characters ?? [],
        players: players ?? [],
      };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`play-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `campaign_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["play", id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["play", id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_players", filter: `campaign_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["play", id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaigns", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["play", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  /** Filet de sécurité : on resynchronise dès que l'écran redevient actif. */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["play", id] });
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [id, queryClient]);

  const data = gameQ.data;
  const messages = data?.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, tab]);

  const mySheet = useMemo(() => {
    const row = (data?.characters ?? []).find((c) => c.user_id === userId);
    return row ? sheetFromRow(row as unknown as Record<string, unknown>) : EMPTY_SHEET;
  }, [data?.characters, userId]);

  const party = useMemo(() => {
    const byUser = new Map((data?.characters ?? []).map((c) => [c.user_id, c]));
    return (data?.players ?? []).map((p) => {
      const c = byUser.get(p.user_id);
      return {
        user_id: p.user_id,
        name: c?.name || "Personnage sans nom",
        portrait_url: c?.portrait_url ?? null,
        role: p.role,
      };
    });
  }, [data?.characters, data?.players]);

  const journal = useMemo(
    () =>
      messages
        .filter((m) => m.role === "gm")
        .map((m) => {
          const meta = (m.metadata ?? {}) as Record<string, unknown>;
          return {
            id: m.id,
            title: typeof meta["scene_title"] === "string" ? (meta["scene_title"] as string) : "Scène",
            text: m.content,
          };
        }),
    [messages],
  );

  const lastScene = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "gm") continue;
      const meta = (m.metadata ?? {}) as Partial<SceneResponse>;
      return meta;
    }
    return undefined;
  }, [messages]);

  const scenes = useMemo(
    () =>
      messages
        .filter((m) => m.role === "gm")
        .map((m) => (m.metadata ?? {}) as Partial<SceneResponse>),
    [messages],
  );

  const isGm = data?.campaign?.owner_id === userId;
  const gmView = Boolean(isGm) && gmMode;

  const roster = useMemo(
    () => party.map((p) => ({ id: p.user_id, name: p.name, role: p.role })),
    [party],
  );
  const names = useMemo(() => new Map(party.map((p) => [p.user_id, p.name])), [party]);

  /** Ordre de jeu stable : mêmes joueurs, même ordre, sur tous les appareils. */
  const turnOrder = useMemo(() => {
    const owner = data?.campaign?.owner_id;
    const gmPlays = data?.campaign?.gm_plays ?? false;
    const withSheet = new Set((data?.characters ?? []).map((c) => c.user_id));
    return party
      .filter((p) => withSheet.has(p.user_id))
      .filter((p) => gmPlays || p.user_id !== owner)
      .map((p) => p.user_id)
      .sort();
  }, [party, data?.campaign?.owner_id, data?.campaign?.gm_plays, data?.characters]);

  const actionsPlayed = useMemo(
    () => messages.filter((m) => m.role === "player").length,
    [messages],
  );

  const turn = useMemo(
    () => sequentialTurn(turnStateFrom(lastScene), turnOrder, actionsPlayed),
    [lastScene, turnOrder, actionsPlayed],
  );
  /**
   * Ambiance Spotify : seul l'appareil du MJ pilote la lecture.
   * Une erreur Spotify n'interrompt jamais la partie.
   */
  const musicRef = useRef<string>("");
  useEffect(() => {
    if (!isGm) return;
    const command = lastScene?.music_command as MusicCommand | undefined | null;
    if (!command || command.action !== "change") return;
    const key = `${command.mood}:${messages.length}`;
    if (musicRef.current === command.mood) return;
    musicRef.current = command.mood;
    void spotifyAmbiance({ data: { command } })
      .then((r) => console.info("[spotify] ambiance", key, r.message))
      .catch(() => undefined);
  }, [isGm, lastScene, messages.length]);

  const myTurn = canPlayerAct(turn, userId);
  const canAct = myTurn || gmView;

  /** Lance (ou relance) la scène d'introduction. */
  async function startIntro() {
    const campaign = data?.campaign;
    if (!campaign || busy) return;
    setBusy(true);
    setError(null);
    const characters = (data?.characters ?? []).map((c) => ({
      name: c.name || "Aventurier",
      race: c.race,
      class_profession: c.class_profession,
      level: c.level,
      backstory: c.backstory,
    }));
    const result = await AIService.startCampaign({
      campaignId: id,
      seed: {
        id,
        name: campaign.name,
        type: campaign.genre,
        universe: campaign.description,
        gmPlays: campaign.gm_plays,
      },
      characters,
      roster,
    });
    setAiResult(result);
    if (!result.ok) setError(result.errorMessage ?? "Le MJ IA est indisponible.");
    else await supabase.from("campaigns").update({ status: "active" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["play", id] });
    setBusy(false);
  }

  /** Démarrage automatique : le MJ n'a rien à cliquer. */
  useEffect(() => {
    if (startedRef.current) return;
    if (!data?.campaign || !userId) return;
    if (data.campaign.owner_id !== userId) return;
    if (messages.length > 0) return;
    startedRef.current = true;
    void startIntro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.campaign, userId, messages.length]);

  /** Recommencer la campagne depuis zéro — décision du MJ. */
  async function restartCampaign() {
    if (!window.confirm("Effacer tout le récit et recommencer la campagne depuis le début ?")) return;
    setBusy(true);
    await supabase.from("messages").delete().eq("campaign_id", id);
    await supabase.from("campaign_memory").delete().eq("campaign_id", id);
    await queryClient.invalidateQueries({ queryKey: ["play", id] });
    setAiResult(null);
    setBusy(false);
    startedRef.current = true;
    void startIntro();
  }

  async function send(text: string, roll?: DiceOutcome, silent = false) {
    const value = text.trim();
    if (!value || !userId || busy) return;
    setBusy(true);
    setError(null);
    setIntent("");

    const { error: insertError } = silent
      ? { error: null }
      : await supabase.from("messages").insert({
      campaign_id: id,
      user_id: userId,
      role: "player",
      content: roll
        ? `${value}\n(Jet ${roll.formula} : ${roll.total} vs ${roll.threshold} — ${
            roll.critical === "success"
              ? "réussite critique"
              : roll.critical === "failure"
                ? "échec critique"
                : roll.success
                  ? "réussite"
                  : "échec"
          })`
        : value,
    });
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["play", id] });

    const result = await AIService.playTurn({
      campaignId: id,
      roster,
      intent: {
        text: value,
        user_id: userId,
        character: mySheet.name || null,
        ...(roll
          ? {
              roll: {
                formula: roll.formula,
                total: roll.total,
                threshold: roll.threshold,
                success: roll.success,
                manual: roll.manual,
                critical: roll.critical,
              },
            }
          : {}),
      },
    });
    setAiResult(result);
    if (!result.ok) setError(result.errorMessage ?? "Le MJ IA est indisponible.");
    const scene = result.data as SceneResponse | null;
    if (scene?.dice_request?.formula) {
      setPendingAction(value);
      setDice(scene.dice_request);
    }
    queryClient.invalidateQueries({ queryKey: ["play", id] });
    setBusy(false);
  }

  /** ▶ Continuer la scène — le MJ laisse simplement la scène évoluer. */
  function advanceScene() {
    void send("ADVANCE_SCENE", undefined, true);
  }

  const suggestions = Array.isArray(lastScene?.suggested_actions) ? lastScene!.suggested_actions : [];
  const ambiance = {
    location: lastScene?.location ?? "",
    world_time: lastScene?.world_time ?? "",
    weather: lastScene?.weather ?? "",
    tension: typeof lastScene?.tension === "number" ? lastScene.tension : 20,
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col bg-background">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-rpg/20 bg-background/95 px-4 py-3 backdrop-blur">
        <GameMenus
          campaignId={id}
          sheet={mySheet}
          scenes={scenes}
          journal={journal}
          party={party}
          isGm={gmView}
          ambiance={ambiance}
          turns={messages.length}
          {...(lastScene?.music_query ? { musicSuggestion: lastScene.music_query } : {})}
        />
        <div className="min-w-0">
          <h1 className="truncate font-display text-base tracking-wide text-foreground sm:text-lg">
            {data?.campaign?.name ?? "Campagne"}
          </h1>
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {lastScene?.scene_title ?? data?.campaign?.genre ?? "Aventure"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["play", id] })}
            aria-label="Recharger la partie"
            title="Recharger la partie"
            className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${gameQ.isFetching ? "animate-spin" : ""}`} />
          </button>
          {isGm && (
            <button
              type="button"
              onClick={() => setGmMode((m) => !m)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-rpg/40 bg-card px-2.5 py-1.5 text-[11px] text-rpg"
            >
              {gmView ? <Theater className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {gmView ? "Mode MJ" : "Mode personnage"}
            </button>
          )}
          <ul className="hidden -space-x-2 sm:flex">
            {party.slice(0, 4).map((m) => (
              <li
                key={m.user_id}
                title={m.name}
                className="h-8 w-8 overflow-hidden rounded-full border border-rpg/40 bg-secondary"
              >
                {m.portrait_url ? (
                  <img src={m.portrait_url} alt={m.name} className="h-full w-full object-cover" />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <AmbianceBar ambiance={ambiance} />

      {/* Onglets mobile */}
      <nav className="grid grid-cols-3 gap-1 border-b border-rpg/15 px-4 py-2 lg:hidden">
        {(
          [
            ["perso", "Personnage"],
            ["recit", "Récit"],
            ["journal", "Journal"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-xl px-2 py-2 text-xs uppercase tracking-wider ${
              tab === value ? "bg-rpg/10 text-rpg" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,17rem)]">
        {/* Colonne gauche */}
        <aside className={`flex flex-col gap-3 ${tab === "perso" ? "" : "hidden"} lg:flex`}>
          <StatsPanel attributes={mySheet.attributes} level={mySheet.level} />
          <InventoryPanel items={mySheet.inventory} />
          <AbilitiesPanel items={mySheet.abilities} />
          {gmView && (
            <MusicPlayer
              canControl
              {...(lastScene?.music_query ? { suggestion: lastScene.music_query } : {})}
            />
          )}
        </aside>

        {/* Zone centrale */}
        <main className={`flex min-w-0 flex-col gap-4 ${tab === "recit" ? "" : "hidden"} lg:flex`}>
          {gmView && lastScene?.read_aloud && (
            <p className="rounded-2xl border border-rpg/30 bg-rpg/5 p-3 text-sm italic text-foreground">
              📖 À lire aux joueurs : {lastScene.read_aloud}
            </p>
          )}
          {gameQ.isLoading && (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-rpg" />
            </div>
          )}
          <ol className="flex flex-col gap-4">
            {messages.map((m) => {
              const meta = (m.metadata ?? {}) as Record<string, unknown>;
              const isGm = m.role === "gm";
              const dialogues = Array.isArray(meta["dialogues"])
                ? (meta["dialogues"] as { speaker?: string; line?: string }[])
                : [];
              return (
                <li
                  key={m.id}
                  className={
                    isGm
                      ? "rounded-2xl border border-rpg/25 bg-card/70 p-4"
                      : "ml-auto max-w-[85%] rounded-2xl border border-rpg/15 bg-secondary px-4 py-2.5"
                  }
                >
                  {isGm && typeof meta["scene_title"] === "string" && (
                    <h2 className="pb-2 font-display text-lg tracking-wide text-foreground">
                      {meta["scene_title"] as string}
                    </h2>
                  )}
                  <p
                    className={`whitespace-pre-line text-sm ${
                      isGm ? "leading-relaxed text-foreground/90" : "text-foreground"
                    }`}
                  >
                    {m.content}
                  </p>
                  {dialogues.length > 0 && (
                    <ul className="flex flex-col gap-2 pt-3">
                      {dialogues.map((d, i) => (
                        <li
                          key={i}
                          className="rounded-2xl rounded-bl-sm border border-rpg/30 bg-secondary px-3 py-2"
                        >
                          <p className="truncate font-display text-[11px] uppercase tracking-wider text-rpg">
                            {d.speaker}
                          </p>
                          <p className="text-sm italic text-foreground">« {d.line} »</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {busy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-rpg" /> Le MJ écrit la suite…
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <AIDebugPanel result={aiResult} />
          <div ref={endRef} />
        </main>

        {/* Colonne droite */}
        <aside className={`flex flex-col gap-3 ${tab === "journal" ? "" : "hidden"} lg:flex`}>
          <JournalPanel entries={journal} />
          <PartyPanel members={party} />
          {gmView && (
            <IllustrationSlot
              kind="scene"
              campaignId={id}
              auto
              prompt={lastScene?.image_prompt || lastScene?.scene_title || "fantasy landscape"}
            />
          )}
        </aside>
      </div>

      {/* Barre inférieure : actions et dés */}
      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-rpg/20 bg-background/95 px-4 py-3 backdrop-blur">
        <TurnBanner turn={turn} userId={gmView ? null : userId} names={names} />
        {gmView && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={advanceScene}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-rpg/40 bg-rpg/10 px-3 py-2.5 text-sm text-rpg disabled:opacity-50"
            >
              <Play className="h-4 w-4 shrink-0" /> Continuer la scène
            </button>
            <button
              type="button"
              onClick={restartCampaign}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4 shrink-0" /> Recommencer
            </button>
          </div>
        )}
        {suggestions.length > 0 && canAct && (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((s) => (
              <li key={s} className="shrink-0">
                <button
                  type="button"
                  onClick={() => send(s)}
                  disabled={busy}
                  className="rounded-full border border-rpg/30 bg-card px-3 py-1.5 text-xs text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              </li>
            ))}
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => document.getElementById("free-action")?.focus()}
                className="flex items-center gap-1 rounded-full border border-rpg/40 bg-rpg/10 px-3 py-1.5 text-xs text-rpg"
              >
                <PenLine className="h-3.5 w-3.5" /> Action libre
              </button>
            </li>
          </ul>
        )}
        {canAct && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(intent);
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
        >
          <textarea
            id="free-action"
            className="rpg-input max-h-32 min-h-12 resize-none"
            rows={1}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Que fait votre personnage ?"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="submit"
              disabled={busy || !intent.trim()}
              aria-label="Envoyer"
              className="rounded-xl border border-rpg/40 bg-card p-3 text-rpg disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
        )}
      </footer>

      {dice && (
        <DiceRollerDialog
          request={dice}
          onCancel={() => {
            setDice(null);
            setPendingAction(null);
          }}
          onResolved={(outcome) => {
            const text = pendingAction ?? `Je tente : ${dice.reason}`;
            setDice(null);
            setPendingAction(null);
            void send(text, outcome);
          }}
        />
      )}
    </div>
  );
}
