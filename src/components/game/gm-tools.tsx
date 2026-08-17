import { useState } from "react";
import { AlertTriangle, Clock, CloudSun, Loader2, MapPin, Sparkles, Theater } from "lucide-react";
import { AIService } from "@/lib/ai/ai-service";
import { IllustrationSlot } from "@/components/game/illustration";
import { PanelCard } from "@/components/game/panels";
import type { Ambiance } from "@/components/game/ambiance-bar";
import type { SceneResponse } from "@/lib/ai/types";

function tensionLabel(t: number) {
  if (t >= 75) return "Critique";
  if (t >= 50) return "Élevée";
  if (t >= 25) return "Modérée";
  return "Calme";
}

/** 🎭 Outils MJ — informations que seul le Maître du Jeu connaît. */
export function GmTools({
  campaignId,
  ambiance,
  scenes,
  turns,
}: {
  campaignId: string;
  ambiance: Ambiance;
  scenes: Partial<SceneResponse>[];
  turns: number;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const last = scenes.at(-1);
  const secrets = last?.gm_secrets ?? [];
  const offscreen = last?.offscreen_events ?? [];
  const clocks = [
    { label: "Tension dramatique", value: Math.min(100, ambiance.tension) },
    { label: "Menace en approche", value: Math.min(100, turns * 7) },
    { label: "Avancée de l'intrigue", value: Math.min(100, scenes.length * 12) },
  ];

  async function loadSummary() {
    setBusy(true);
    setError(null);
    const res = await AIService.summarizeCampaign({ campaignId });
    const data = res.data as { summary?: string; narration?: string } | null;
    const text = data?.summary ?? data?.narration ?? null;
    if (text) setSummary(text);
    else setError(res.errorMessage ?? "Résumé indisponible pour le moment.");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Theater className="h-3.5 w-3.5 shrink-0 text-rpg" /> Visible uniquement par le Maître du Jeu.
      </p>

      <PanelCard title="État du monde">
        <ul className="grid grid-cols-2 gap-2 text-sm">
          <Info icon={Clock} label="Heure" value={ambiance.world_time || "Inconnue"} />
          <Info icon={MapPin} label="Lieu" value={ambiance.location || "Inconnu"} />
          <Info icon={CloudSun} label="Météo" value={ambiance.weather || "Calme"} />
          <Info
            icon={AlertTriangle}
            label="Tension"
            value={`${tensionLabel(ambiance.tension)} (${ambiance.tension})`}
          />
        </ul>
        <p className="pt-2 text-xs text-muted-foreground">
          Ambiance générale : {last?.scene_mood || "à définir"} · {scenes.length} scène
          {scenes.length > 1 ? "s" : ""} jouée{scenes.length > 1 ? "s" : ""}.
        </p>
      </PanelCard>

      {last?.read_aloud && (
        <PanelCard title="📖 À lire aux joueurs">
          <p className="whitespace-pre-line text-sm italic text-foreground">{last.read_aloud}</p>
        </PanelCard>
      )}

      {last?.gm_notes && (
        <PanelCard title="Notes de simulation">
          <p className="whitespace-pre-line text-xs text-muted-foreground">{last.gm_notes}</p>
        </PanelCard>
      )}

      {secrets.length > 0 && (
        <PanelCard title="Secrets non révélés">
          <ul className="flex flex-col gap-1.5">
            {secrets.map((s, i) => (
              <li key={i} className="rounded-lg border border-rpg/20 bg-secondary px-2 py-1.5 text-xs text-foreground">
                {s}
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {offscreen.length > 0 && (
        <PanelCard title="Évènements hors champ">
          <ul className="flex flex-col gap-1.5">
            {offscreen.map((s, i) => (
              <li key={i} className="rounded-lg border border-rpg/20 bg-secondary px-2 py-1.5 text-xs text-foreground">
                {s}
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      <PanelCard title="Horloges de menace">
        <ul className="flex flex-col gap-2">
          {clocks.map((c) => (
            <li key={c.label}>
              <p className="pb-1 text-[11px] text-muted-foreground">
                {c.label} · {c.value}%
              </p>
              <span className="block h-2 overflow-hidden rounded-full bg-secondary">
                <span className="block h-full bg-rpg/70" style={{ width: `${Math.max(3, c.value)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </PanelCard>

      <IllustrationSlot
        kind="scene"
        campaignId={campaignId}
        auto
        prompt={last?.image_prompt || last?.scene_title || "fantasy landscape, cinematic"}
      />

      <PanelCard title="Notes privées du MJ">
        <textarea
          className="rpg-input min-h-24 resize-none text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Vos idées, pistes et rappels — visibles par vous seul."
        />
      </PanelCard>

      <PanelCard title="Résumé du World State">
        {summary ? (
          <p className="whitespace-pre-line text-xs text-muted-foreground">{summary}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Demandez au MJ IA une synthèse de la campagne : intrigues en cours, PNJ, tensions.
          </p>
        )}
        {error && <p className="pt-2 text-xs text-destructive">{error}</p>}
        <button
          type="button"
          onClick={loadSummary}
          disabled={busy}
          className="mt-2 flex items-center gap-1.5 rounded-full border border-rpg/30 bg-secondary px-3 py-1.5 text-[11px] text-rpg disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {summary ? "Actualiser le résumé" : "Générer le résumé"}
        </button>
      </PanelCard>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <li className="rounded-xl border border-rpg/20 bg-secondary px-2 py-1.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0 text-rpg" /> {label}
      </span>
      <span className="block truncate font-display text-sm text-foreground">{value}</span>
    </li>
  );
}
