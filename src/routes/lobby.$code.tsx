import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Crown, Share2, User, ScrollText, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";

export const Route = createFileRoute("/lobby/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Campfire — Salon ${params.code}` },
      { name: "description", content: "Salle d'attente d'une partie de jeu de rôle." },
    ],
  }),
  component: LobbyPage,
});

type GameRow = {
  id: string;
  name: string;
  invite_code: string;
  gm_device_id: string | null;
  status: string;
  gm_plays: boolean;
};

type Participant = {
  id: string;
  display_name: string;
  is_gm: boolean;
  status: string;
  device_id: string;
  joined_at: string;
};

type CharacterLite = {
  id: string;
  device_id: string;
  name: string;
  is_ready: boolean;
};

function LobbyPage() {
  const { code } = Route.useParams();
  const [game, setGame] = useState<GameRow | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [characters, setCharacters] = useState<CharacterLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data: g, error: gErr } = await supabase
        .from("games")
        .select("id, name, invite_code, gm_device_id, status, gm_plays")
        .eq("invite_code", code)
        .maybeSingle();
      if (cancelled) return;
      if (gErr || !g) {
        setError(gErr?.message ?? "Partie introuvable.");
        setLoading(false);
        return;
      }
      setGame(g as GameRow);

      const { data: parts } = await supabase
        .from("participants")
        .select("id, display_name, is_gm, status, device_id, joined_at")
        .eq("game_id", g.id)
        .order("joined_at", { ascending: true });
      if (cancelled) return;
      setParticipants((parts as Participant[]) ?? []);

      const { data: chars } = await supabase
        .from("characters")
        .select("id, device_id, name, is_ready")
        .eq("game_id", g.id);
      if (cancelled) return;
      setCharacters((chars as CharacterLite[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!game) return;
    const channel = supabase
      .channel(`lobby:${game.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `game_id=eq.${game.id}` },
        (payload) => {
          setParticipants((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Participant;
              if (prev.some((p) => p.id === row.id)) return prev;
              return [...prev, row].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Participant;
              return prev.map((p) => (p.id === row.id ? row : p));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as Participant;
              return prev.filter((p) => p.id !== row.id);
            }
            return prev;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        (payload) => {
          setGame((prev) => (prev ? { ...prev, ...(payload.new as GameRow) } : prev));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `game_id=eq.${game.id}` },
        (payload) => {
          setCharacters((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as CharacterLite;
              if (prev.some((c) => c.id === row.id)) return prev;
              return [...prev, row];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as CharacterLite;
              return prev.map((c) => (c.id === row.id ? { ...c, ...row } : c));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as CharacterLite;
              return prev.filter((c) => c.id !== row.id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id]);

  const isGM = !!game && !!deviceId && game.gm_device_id === deviceId;

  const characterByDevice = useMemo(() => {
    const map = new Map<string, CharacterLite>();
    for (const c of characters) map.set(c.device_id, c);
    return map;
  }, [characters]);

  function playerNeedsCharacter(p: Participant): boolean {
    if (!game) return false;
    if (!p.is_gm) return true;
    return !!game.gm_plays;
  }

  const allReady =
    participants.length > 0 &&
    participants.every((p) => {
      if (!playerNeedsCharacter(p)) return true;
      return characterByDevice.get(p.device_id)?.is_ready === true;
    });

  const myCharacter = deviceId ? characterByDevice.get(deviceId) : undefined;
  const iNeedCharacter = !!game && (!isGM || game.gm_plays);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/lobby/${code}`;
  }, [code]);

  async function handleShare() {
    const text = `Rejoins ma partie Campfire avec le code ${code} : ${shareUrl}`;
    try {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        clipboard?: { writeText: (t: string) => Promise<void> };
      }) : null;
      if (nav?.share) {
        await nav.share({
          title: "Campfire",
          text,
          url: shareUrl,
        });
        setShareStatus("Partagé !");
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(text);
        setShareStatus("Copié dans le presse-papier !");
      }
    } catch {
      setShareStatus("Partage annulé.");
    }
    setTimeout(() => setShareStatus(null), 2500);
  }

  async function startAdventure() {
    if (!game) return;
    if (!allReady) return;
    setStarting(true);
    const { error: updErr } = await supabase
      .from("games")
      .update({ status: "in_progress" })
      .eq("id", game.id);
    setStarting(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
  }

  if (loading) {
    return (
      <MobileShell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Chargement du salon…</p>
        </div>
      </MobileShell>
    );
  }

  if (error || !game) {
    return (
      <MobileShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-xl text-destructive">
            {error ?? "Partie introuvable"}
          </p>
          <Link to="/" className="rpg-button">
            <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Retour à l'accueil</span>
          </Link>
        </div>
      </MobileShell>
    );
  }

  const qrValue = shareUrl || code;

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-6 py-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Salle d'attente
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">
            {game.name}
          </h1>
          {game.status === "in_progress" && (
            <p className="mt-2 rounded-lg border border-rpg/40 bg-rpg/10 px-3 py-2 text-sm text-rpg">
              L'aventure a commencé !
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-rpg/30 bg-card p-5 space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG value={qrValue} size={168} level="M" includeMargin={false} />
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Code d'invitation
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[0.4em] text-foreground">
                {game.invite_code}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleShare} className="rpg-button">
            <Share2 className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Partager</span>
          </button>
          {shareStatus && (
            <p className="text-center text-xs text-muted-foreground">{shareStatus}</p>
          )}
        </div>

        {iNeedCharacter && (
          <Link
            to="/character/$code"
            params={{ code }}
            className="rpg-button"
          >
            <ScrollText className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">
              {myCharacter?.is_ready
                ? "Modifier mon personnage"
                : myCharacter
                  ? "Continuer mon personnage"
                  : "Créer mon personnage"}
            </span>
          </Link>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-foreground">
              Joueurs ({participants.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              {
                participants.filter((p) =>
                  !playerNeedsCharacter(p) ? true : characterByDevice.get(p.device_id)?.is_ready,
                ).length
              }
              /{participants.length} prêts
            </span>
          </div>
          <ul className="space-y-2">
            {participants.map((p) => {
              const isMe = p.device_id === deviceId;
              const needs = playerNeedsCharacter(p);
              const char = characterByDevice.get(p.device_id);
              const ready = !needs || char?.is_ready === true;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        p.is_gm
                          ? "flex h-9 w-9 items-center justify-center rounded-full bg-rpg/20 text-rpg"
                          : "flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground"
                      }
                    >
                      {p.is_gm ? <Crown className="h-5 w-5" /> : <User className="h-5 w-5" />}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {p.display_name}
                        {isMe && (
                          <span className="ml-2 text-xs text-muted-foreground">(toi)</span>
                        )}
                      </span>
                      {char?.name && (
                        <span className="text-xs italic text-muted-foreground">
                          {char.name}
                        </span>
                      )}
                      <span
                        className={
                          p.is_gm
                            ? "text-xs font-semibold uppercase tracking-widest text-rpg"
                            : "text-xs uppercase tracking-widest text-muted-foreground"
                        }
                      >
                        {p.is_gm ? "Maître du jeu" : "Joueur"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ready ? (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {needs ? "Personnage prêt" : "Prêt"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                        <Clock className="h-3.5 w-3.5" />
                        En préparation
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
            {participants.length === 0 && (
              <li className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun joueur pour le moment.
              </li>
            )}
          </ul>
        </div>

        {isGM ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={startAdventure}
              disabled={starting || game.status === "in_progress" || !allReady}
              className="rpg-button disabled:opacity-50"
            >
              <span className="font-display tracking-wide">
                {game.status === "in_progress"
                  ? "Aventure en cours"
                  : starting
                    ? "Lancement…"
                    : "Commencer l'aventure"}
              </span>
            </button>
            {!allReady && game.status !== "in_progress" && (
              <p className="text-center text-xs text-muted-foreground">
                En attente que tous les joueurs valident leur personnage.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-center">
            <p className="font-display text-sm uppercase tracking-widest text-muted-foreground">
              En attente du MJ
            </p>
          </div>
        )}

        <Link to="/" className="rpg-button">
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Quitter</span>
        </Link>
      </div>
    </MobileShell>
  );
}