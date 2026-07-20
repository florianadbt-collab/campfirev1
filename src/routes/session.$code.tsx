import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Users, Sparkles, Crown, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { buildCampaignContext, type CampaignAIContext } from "@/lib/ai-context";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Tables"]["games"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];
type Character = Database["public"]["Tables"]["characters"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];

export const Route = createFileRoute("/session/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Campfire — Session ${params.code}` },
      { name: "description", content: "Session en cours de la partie." },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [deviceId, setDeviceId] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<CampaignAIContext | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: g, error: gErr } = await supabase
        .from("games")
        .select("*")
        .eq("invite_code", code)
        .maybeSingle();
      if (cancelled) return;
      if (gErr || !g) {
        setError(gErr?.message ?? "Partie introuvable.");
        setLoading(false);
        return;
      }
      setGame(g);

      const [{ data: parts }, { data: chars }, { data: sess }] = await Promise.all([
        supabase
          .from("participants")
          .select("*")
          .eq("game_id", g.id)
          .order("joined_at", { ascending: true }),
        supabase.from("characters").select("*").eq("game_id", g.id),
        supabase
          .from("sessions")
          .select("*")
          .eq("game_id", g.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setParticipants((parts as Participant[]) ?? []);
      setCharacters((chars as Character[]) ?? []);
      setSession((sess as Session) ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const isGM = !!game && !!deviceId && game.gm_device_id === deviceId;

  useEffect(() => {
    if (!loading && game && deviceId && !isGM) {
      navigate({ to: "/lobby/$code", params: { code } });
    }
  }, [loading, game, deviceId, isGM, code, navigate]);

  const readyCharacters = useMemo(
    () => characters.filter((c) => c.is_ready),
    [characters],
  );

  async function handleGenerateIntro() {
    if (!game || !session) return;
    setPreparing(true);
    setPreview(null);

    const context = buildCampaignContext({
      game,
      session,
      participants,
      characters: readyCharacters,
      history: (session.history as unknown[]) ?? [],
    });

    // Persist the prepared context so the AI step can pick it up later.
    const { error: upErr } = await supabase
      .from("sessions")
      .update({ ai_context: context as unknown as never, status: "awaiting_intro" })
      .eq("id", session.id);

    setPreparing(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    setSession({ ...session, ai_context: context as never, status: "awaiting_intro" });
    setPreview(context);
  }

  if (loading) {
    return (
      <MobileShell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Chargement de la session…</p>
        </div>
      </MobileShell>
    );
  }

  if (error || !game || !session) {
    return (
      <MobileShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-xl text-destructive">
            {error ?? "Session introuvable"}
          </p>
          <Link to="/lobby/$code" params={{ code }} className="rpg-button">
            <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Retour au salon</span>
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-6 py-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Session en cours
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">
            {game.name}
          </h1>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-rpg/40 bg-rpg/10 px-3 py-0.5 text-xs uppercase tracking-widest text-rpg">
            <Crown className="h-3.5 w-3.5" />
            Vue MJ
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs uppercase tracking-widest">Joueurs</span>
            </div>
            <p className="mt-2 font-display text-2xl text-foreground">
              {participants.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ScrollText className="h-4 w-4" />
              <span className="text-xs uppercase tracking-widest">Statut</span>
            </div>
            <p className="mt-2 font-display text-sm text-foreground">
              {session.status === "awaiting_intro"
                ? "En attente de l'intro"
                : session.status === "active"
                  ? "Active"
                  : session.status}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg text-foreground">Univers</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {game.description?.trim()
              ? game.description
              : "Aucun résumé d'univers renseigné."}
          </p>
          {game.genre && (
            <p className="mt-3 text-xs uppercase tracking-widest text-rpg">
              {game.genre}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-lg text-foreground">
            Personnages ({readyCharacters.length})
          </h2>
          <ul className="space-y-2">
            {readyCharacters.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <p className="font-medium text-foreground">{c.name || "Sans nom"}</p>
                <p className="text-xs text-muted-foreground">
                  {[c.race, c.class_profession].filter(Boolean).join(" · ") ||
                    "Profil libre"}
                  {" — "}Niveau {c.level}
                </p>
              </li>
            ))}
            {readyCharacters.length === 0 && (
              <li className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun personnage prêt.
              </li>
            )}
          </ul>
        </div>

        <button
          type="button"
          onClick={handleGenerateIntro}
          disabled={preparing}
          className="rpg-button disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">
            {preparing ? "Préparation…" : "Générer l'introduction"}
          </span>
        </button>

        {preview && (
          <div className="rounded-2xl border border-rpg/30 bg-card p-4">
            <p className="font-display text-sm uppercase tracking-widest text-rpg">
              Contexte prêt pour l'IA
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Le contexte de la campagne a été enregistré dans la session et sera
              transmis au moteur IA à l'étape suivante.
            </p>
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-background/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}

        <Link to="/lobby/$code" params={{ code }} className="rpg-button">
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Retour au salon</span>
        </Link>
      </div>
    </MobileShell>
  );
}