import { useState } from "react";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import { AIService } from "@/lib/ai/ai-service";

export type IllustrationKind = "scene" | "npc" | "objet" | "creature" | "evenement";

const LABEL: Record<IllustrationKind, string> = {
  scene: "Illustration du lieu",
  npc: "Portrait du PNJ",
  objet: "Objet important",
  creature: "Créature",
  evenement: "Événement majeur",
};

/** Emplacement d'illustration — génération d'image branchée sur le moteur IA. */
export function IllustrationSlot({
  kind,
  prompt,
  campaignId,
  initialUrl = null,
}: {
  kind: IllustrationKind;
  prompt: string;
  campaignId?: string;
  initialUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const result =
      kind === "npc"
        ? await AIService.generatePortrait({ prompt })
        : await AIService.generateSceneImage({ campaignId, prompt });
    const image = (result.data as { image_url?: string | null } | null)?.image_url ?? null;
    if (image) setUrl(image);
    else setError("Illustration indisponible pour le moment.");
    setBusy(false);
  }

  return (
    <figure className="overflow-hidden rounded-2xl border border-rpg/25 bg-card/60">
      <div className="relative grid aspect-video w-full place-items-center bg-secondary">
        {url ? (
          <img src={url} alt={LABEL[kind]} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-7 w-7 text-rpg/50" />
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-rpg" />
          </div>
        )}
      </div>
      <figcaption className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2">
        <span className="min-w-0">
          <span className="block truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {LABEL[kind]}
          </span>
          {error && <span className="block truncate text-[11px] text-destructive">{error}</span>}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="flex shrink-0 items-center gap-1 rounded-full border border-rpg/30 bg-secondary px-2.5 py-1 text-[11px] text-rpg disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> Générer
        </button>
      </figcaption>
    </figure>
  );
}