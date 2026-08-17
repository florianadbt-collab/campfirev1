import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { generateInviteCode } from "@/lib/invite-code";

export const Route = createFileRoute("/_authenticated/campaigns/create")({
  head: () => ({
    meta: [
      { title: "Campfire — Nouvelle campagne" },
      { name: "description", content: "Créez une campagne Campfire." },
    ],
  }),
  component: CreateCampaignPage,
});

const CAMPAIGN_TYPES = [
  "Libre",
  "Héroïque",
  "Survie",
  "Enquête",
  "Horreur",
  "Mystère",
  "Exploration",
  "Politique",
  "Sandbox",
] as const;

function CreateCampaignPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [world, setWorld] = useState("");
  const [inspiration, setInspiration] = useState("");
  const [campaignType, setCampaignType] = useState<string>(CAMPAIGN_TYPES[0]);
  const [universe, setUniverse] = useState("");
  const [gmPlays, setGmPlays] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
          description: universe.trim() || null,
          inspiration: inspiration.trim() || null,
          genre: [campaignType, world.trim()].filter(Boolean).join(" — "),
          gm_plays: gmPlays,
          status: "waiting",
          invite_code: inviteCode,
        })
        .select("id, name, invite_code")
        .single();
      if (cErr) throw cErr;

      const { error: pErr } = await supabase.from("campaign_players").insert({
        campaign_id: campaign.id,
        user_id: userId,
        role: "gm",
      });
      if (pErr) throw pErr;

      setCreated({ id: campaign.id, name: campaign.name, code: campaign.invite_code });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (created) {
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
          <h1 className="font-display text-xl tracking-wide text-foreground">Campagne créée</h1>
        </header>

        <section className="flex flex-1 flex-col gap-6">
          <div className="rounded-2xl border border-rpg/30 bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Nom de la campagne</p>
            <p className="mt-1 font-display text-2xl text-foreground">{created.name}</p>
          </div>

          <button
            type="button"
            onClick={copyCode}
            className="flex items-center justify-between rounded-2xl border border-rpg/30 bg-card px-4 py-4"
          >
            <div className="flex flex-col text-left">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Code d'invitation
              </span>
              <span className="font-display text-3xl tracking-[0.4em] text-foreground">
                {created.code}
              </span>
            </div>
            <span className="flex items-center gap-1 text-xs text-rpg">
              <Copy className="h-4 w-4" />
              {copied ? "Copié" : "Copier"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate({ to: "/campaigns/$id", params: { id: created.id } })}
            className="rpg-button"
          >
            <span className="font-display tracking-wide">Ouvrir la salle d'attente</span>
          </button>
        </section>
      </MobileShell>
    );
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
            Nom du monde (optionnel)
          </span>
          <input value={world} onChange={(e) => setWorld(e.target.value)} className="rpg-input" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Type de campagne
          </span>
          <select
            value={campaignType}
            onChange={(e) => setCampaignType(e.target.value)}
            className="rpg-input"
          >
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Description de l'univers
          </span>
          <textarea
            rows={4}
            maxLength={300}
            value={universe}
            onChange={(e) => setUniverse(e.target.value)}
            className="rpg-input resize-none"
          />
          <span className="self-end text-[10px] text-muted-foreground">{universe.length}/300</span>
        </label>

        <div className="flex items-center justify-between rounded-2xl border border-rpg/30 bg-card px-4 py-3">
          <span className="text-sm text-foreground">Le MJ participe également comme joueur</span>
          <button
            type="button"
            role="switch"
            aria-checked={gmPlays}
            onClick={() => setGmPlays((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
              gmPlays ? "border-rpg bg-rpg/30" : "border-rpg/30 bg-background"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-rpg transition-all ${
                gmPlays ? "left-6" : "left-1 opacity-50"
              }`}
            />
          </button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Inspiration (facultatif)
          </span>
          <textarea
            rows={4}
            value={inspiration}
            onChange={(e) => setInspiration(e.target.value)}
            className="rpg-input resize-none"
            placeholder="Quelles œuvres, univers ou ambiances inspirent cette campagne ? Ex. Final Fantasy, One Piece, Dragon Quest..."
          />
          <span className="text-[11px] text-muted-foreground">
            Ces références servent à orienter l'ambiance et le style de l'univers. La description reste prioritaire.
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button type="submit" disabled={loading} className="rpg-button disabled:opacity-50">
          <span className="font-display tracking-wide">{loading ? "..." : "Créer la campagne"}</span>
        </button>
      </form>
    </MobileShell>
  );
}