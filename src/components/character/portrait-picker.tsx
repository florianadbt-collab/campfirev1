import { useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react";

/** Portrait : upload, glisser-déposer, génération IA. */
export function PortraitPicker({
  url,
  busy,
  onFile,
  onClear,
  onGenerate,
}: {
  url: string | null;
  busy?: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onGenerate?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Portrait</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`relative grid aspect-square w-full max-w-44 place-items-center overflow-hidden rounded-2xl border border-dashed bg-card/60 ${
          over ? "border-rpg" : "border-rpg/40"
        }`}
      >
        {url ? (
          <img src={url} alt="Portrait du personnage" className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-2 px-4 py-8 text-center"
          >
            <ImagePlus className="h-7 w-7 text-rpg" />
            <span className="font-display text-sm tracking-wide text-foreground">
              Déposer une image
            </span>
            <span className="text-[11px] text-muted-foreground">ou toucher pour choisir</span>
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-rpg" />
          </div>
        )}
        {url && !busy && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Retirer le portrait"
            className="absolute right-2 top-2 rounded-full border border-rpg/40 bg-background/80 p-1.5 text-rpg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border border-rpg/30 bg-card px-3 py-2 text-xs tracking-wide text-foreground"
        >
          Choisir une image
        </button>
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-xl border border-rpg/40 bg-rpg/10 px-3 py-2 text-xs text-rpg disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> Générer par IA
          </button>
        )}
      </div>
    </div>
  );
}
