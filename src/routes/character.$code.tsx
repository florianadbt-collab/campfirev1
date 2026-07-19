import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2, Upload, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/character/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Campfire — Mon personnage (${params.code})` },
      { name: "description", content: "Crée ou modifie ta fiche de personnage." },
    ],
  }),
  component: CharacterPage,
});

type NamedEntry = { name: string; value: string };

type CharacterDraft = {
  portrait_url: string | null;
  name: string;
  race: string;
  class_profession: string;
  level: number;
  physical_description: string;
  backstory: string;
  inventory: string[];
  abilities: string[];
  attributes: NamedEntry[];
  notes: string;
};

const emptyDraft = (): CharacterDraft => ({
  portrait_url: null,
  name: "",
  race: "",
  class_profession: "",
  level: 1,
  physical_description: "",
  backstory: "",
  inventory: [],
  abilities: [],
  attributes: [],
  notes: "",
});

// Architecture prête pour un remplissage automatique par IA :
// il suffira d'appeler applyDraft(partial) après analyse d'une image ou d'un PDF.
function mergeDraft(current: CharacterDraft, incoming: Partial<CharacterDraft>): CharacterDraft {
  return { ...current, ...incoming };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v : String(v ?? ""))).filter((v) => v.length > 0);
}

function toAttributes(value: unknown): NamedEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (v && typeof v === "object" && "name" in v) {
        const obj = v as { name?: unknown; value?: unknown };
        return { name: String(obj.name ?? ""), value: String(obj.value ?? "") };
      }
      return { name: "", value: "" };
    })
    .filter((a) => a.name.length > 0 || a.value.length > 0);
}

async function fileToDataUrl(file: File, maxSize = 512): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  // Downscale via canvas to keep DB payload light.
  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function CharacterPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [deviceId, setDeviceId] = useState("");
  const [gameId, setGameId] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft());
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: game, error: gErr } = await supabase
        .from("games")
        .select("id")
        .eq("invite_code", code)
        .maybeSingle();
      if (cancelled) return;
      if (gErr || !game) {
        setError(gErr?.message ?? "Partie introuvable.");
        setLoading(false);
        return;
      }
      setGameId(game.id);
      const { data: existing } = await supabase
        .from("characters")
        .select("*")
        .eq("game_id", game.id)
        .eq("device_id", deviceId)
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        setCharacterId(existing.id);
        setIsReady(existing.is_ready);
        setDraft({
          portrait_url: existing.portrait_url,
          name: existing.name ?? "",
          race: existing.race ?? "",
          class_profession: existing.class_profession ?? "",
          level: existing.level ?? 1,
          physical_description: existing.physical_description ?? "",
          backstory: existing.backstory ?? "",
          inventory: toStringArray(existing.inventory),
          abilities: toStringArray(existing.abilities),
          attributes: toAttributes(existing.attributes),
          notes: existing.notes ?? "",
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, deviceId]);

  function update<K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) {
    setDraft((d) => mergeDraft(d, { [key]: value } as Partial<CharacterDraft>));
  }

  async function handlePortrait(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await fileToDataUrl(file);
      update("portrait_url", data);
    } catch {
      setError("Impossible de charger l'image.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function persist(ready: boolean): Promise<boolean> {
    if (!gameId) return false;
    if (ready && !draft.name.trim()) {
      setError("Le nom du personnage est obligatoire pour valider.");
      return false;
    }
    setError(null);
    setSaving(true);
    const payload = {
      game_id: gameId,
      device_id: deviceId,
      portrait_url: draft.portrait_url,
      name: draft.name.trim(),
      race: draft.race.trim() || null,
      class_profession: draft.class_profession.trim() || null,
      level: Number.isFinite(draft.level) ? draft.level : 1,
      physical_description: draft.physical_description.trim() || null,
      backstory: draft.backstory.trim() || null,
      inventory: draft.inventory.filter((s) => s.trim().length > 0),
      abilities: draft.abilities.filter((s) => s.trim().length > 0),
      attributes: draft.attributes.filter((a) => a.name.trim() || a.value.trim()),
      notes: draft.notes.trim() || null,
      is_ready: ready,
    };
    let result;
    if (characterId) {
      result = await supabase.from("characters").update(payload).eq("id", characterId).select("id").single();
    } else {
      result = await supabase.from("characters").insert(payload).select("id").single();
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return false;
    }
    if (result.data) setCharacterId(result.data.id);
    setIsReady(ready);
    // Refléter dans le lobby via le status du participant.
    await supabase
      .from("participants")
      .update({ status: ready ? "ready" : "connected" })
      .eq("game_id", gameId)
      .eq("device_id", deviceId);
    setStatus(ready ? "Personnage prêt !" : "Modifications enregistrées.");
    setTimeout(() => setStatus(null), 2500);
    return true;
  }

  async function handleValidate() {
    const ok = await persist(true);
    if (ok) navigate({ to: "/lobby/$code", params: { code } });
  }

  if (loading) {
    return (
      <MobileShell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Chargement de la fiche…</p>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-6 py-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Fiche</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">Mon personnage</h1>
          {isReady && (
            <p className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              Personnage prêt
            </p>
          )}
        </div>

        <section className="rounded-2xl border border-rpg/30 bg-card p-4 space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
              {draft.portrait_url ? (
                <img src={draft.portrait_url} alt="Portrait" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Aucun
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rpg-button"
              >
                <Upload className="h-4 w-4 shrink-0 text-rpg" />
                <span className="font-display text-sm tracking-wide">Portrait</span>
              </button>
              <button
                type="button"
                disabled
                title="Bientôt disponible"
                className="rpg-button opacity-50"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-rpg" />
                <span className="font-display text-sm tracking-wide">Générer avec l'IA</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handlePortrait}
                className="hidden"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-name">Nom du personnage <span className="text-rpg">*</span></Label>
            <Input id="c-name" value={draft.name} maxLength={80} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c-race">Race</Label>
              <Input id="c-race" value={draft.race} maxLength={40} onChange={(e) => update("race", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-level">Niveau</Label>
              <Input
                id="c-level"
                type="number"
                min={1}
                value={draft.level}
                onChange={(e) => update("level", Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-class">Classe / Profession</Label>
            <Input
              id="c-class"
              value={draft.class_profession}
              maxLength={60}
              onChange={(e) => update("class_profession", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-desc">Description physique</Label>
            <Textarea
              id="c-desc"
              rows={3}
              value={draft.physical_description}
              onChange={(e) => update("physical_description", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-back">Histoire</Label>
            <Textarea
              id="c-back"
              rows={4}
              value={draft.backstory}
              onChange={(e) => update("backstory", e.target.value)}
            />
          </div>
        </section>

        <DynamicStringList
          title="Inventaire"
          items={draft.inventory}
          onChange={(items) => update("inventory", items)}
          placeholder="Épée, potion, corde…"
        />

        <DynamicStringList
          title="Capacités"
          items={draft.abilities}
          onChange={(items) => update("abilities", items)}
          placeholder="Vision nocturne, esquive…"
        />

        <DynamicAttributes
          items={draft.attributes}
          onChange={(items) => update("attributes", items)}
        />

        <div className="space-y-2">
          <Label htmlFor="c-notes">Notes libres</Label>
          <Textarea
            id="c-notes"
            rows={4}
            value={draft.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {status && (
          <p className="rounded-lg border border-rpg/40 bg-rpg/10 px-3 py-2 text-center text-sm text-rpg">
            {status}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleValidate}
            disabled={saving}
            className="rpg-button disabled:opacity-50"
          >
            <span className="font-display tracking-wide">
              {saving ? "Enregistrement…" : isReady ? "Mettre à jour et valider" : "Valider mon personnage"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => persist(false)}
            disabled={saving}
            className="rpg-button disabled:opacity-50"
          >
            <span className="font-display tracking-wide">Enregistrer un brouillon</span>
          </button>
          <Link to="/lobby/$code" params={{ code }} className="rpg-button">
            <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
            <span className="font-display tracking-wide">Retour au salon</span>
          </Link>
        </div>
      </div>
    </MobileShell>
  );
}

function DynamicStringList({
  title,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="flex items-center gap-1 rounded-lg border border-rpg/40 bg-rpg/10 px-2 py-1 text-xs font-medium text-rpg"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-destructive"
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-center text-xs text-muted-foreground">
            Aucun élément.
          </li>
        )}
      </ul>
    </section>
  );
}

function DynamicAttributes({
  items,
  onChange,
}: {
  items: NamedEntry[];
  onChange: (items: NamedEntry[]) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-foreground">Caractéristiques</h2>
        <button
          type="button"
          onClick={() => onChange([...items, { name: "", value: "" }])}
          className="flex items-center gap-1 rounded-lg border border-rpg/40 bg-rpg/10 px-2 py-1 text-xs font-medium text-rpg"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((attr, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <Input
              value={attr.name}
              placeholder="Nom (ex: Force)"
              className="flex-1"
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...next[idx], name: e.target.value };
                onChange(next);
              }}
            />
            <Input
              value={attr.value}
              placeholder="Valeur"
              className="w-24"
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...next[idx], value: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-destructive"
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-center text-xs text-muted-foreground">
            Ajoute librement les caractéristiques de ton univers.
          </li>
        )}
      </ul>
    </section>
  );
}