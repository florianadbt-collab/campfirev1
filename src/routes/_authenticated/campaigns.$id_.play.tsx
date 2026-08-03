import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AIService } from "@/lib/ai/ai-service";
import { AIDebugPanel } from "@/components/ai-debug-panel";
import {
  AbilitiesPanel,
  ComingSoonSlot,
  InventoryPanel,
  JournalPanel,
  PartyPanel,
  StatsPanel,
} from "@/components/game/panels";
import { sheetFromRow, EMPTY_SHEET } from "@/lib/character-sheet";
import type { AIResult, SceneResponse } from "@/lib/ai/types";

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
  const endRef = useRef<HTMLDivElement>(null);

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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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

  async function send(text: string) {
    const value = text.trim();
    if (!value || !userId || busy) return;
    setBusy(true);
    setError(null);
    setIntent("");

    const { error: insertError } = await supabase.from("messages").insert({
      campaign_id: id,
      user_id: userId,
      role: "player",
      content: value,
    });
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["play", id] });

    const result = await AIService.playTurn({
      campaignId: id,
      intent: { text: value, character: mySheet.name || null },
    });
    setAiResult(result);
    if (!result.ok) setError(result.errorMessage ?? "Le MJ IA est indisponible.");
    queryClient.invalidateQueries({ queryKey: ["play", id] });
    setBusy(false);
  }

  const suggestions = Array.isArray(lastScene?.suggested_actions) ? lastScene!.suggested_actions : [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col bg-background">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-rpg/20 bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          to="/campaigns/$id"
          params={{ id }}
          aria-label="Quitter la partie"
          className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-base tracking-wide text-foreground sm:text-lg">
            {data?.campaign?.name ?? "Campagne"}
          </h1>
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {lastScene?.scene_title ?? data?.campaign?.genre ?? "Aventure"}
          </p>
        </div>
        <Link
          to="/campaigns/$id/character"
          params={{ id }}
          aria-label="Ma fiche"
          className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
        >
          <User className="h-5 w-5" />
        </Link>
      </header>

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
          <ComingSoonSlot kind="combat" />
        </aside>

        {/* Zone centrale */}
        <main className={`flex min-w-0 flex-col gap-4 ${tab === "recit" ? "" : "hidden"} lg:flex`}>
          {gameQ.isLoading && (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-rpg" />
            </div>
          )}
          <ol className="flex flex-col gap-4">
            {messages.map((m) => {
              const meta = (m.metadata ?? {}) as Record<string, unknown>;
              const isGm = m.role === "gm";
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
          <ComingSoonSlot kind="map" />
          <ComingSoonSlot kind="spotify" />
        </aside>
      </div>

      {/* Barre inférieure : actions et dés */}
      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-rpg/20 bg-background/95 px-4 py-3 backdrop-blur">
        {suggestions.length > 0 && (
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
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(intent);
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
        >
          <textarea
            className="rpg-input max-h-32 min-h-12 resize-none"
            rows={1}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Que faites-vous ?"
          />
          <button
            type="submit"
            disabled={busy || !intent.trim()}
            aria-label="Envoyer"
            className="shrink-0 rounded-xl border border-rpg/40 bg-card p-3 text-rpg disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
        <ComingSoonSlot kind="dice" />
      </footer>
    </div>
  );
}
