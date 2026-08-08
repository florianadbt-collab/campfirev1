import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  FileUp,
  Loader2,
  PenLine,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { supabase } from "@/integrations/supabase/client";
import { AIService } from "@/lib/ai/ai-service";
import { AIDebugPanel } from "@/components/ai-debug-panel";
import { PortraitPicker } from "@/components/character/portrait-picker";
import { AreaField, AttributeEditor, ListEditor, TextField } from "@/components/character/sheet-fields";
import { uploadPortrait } from "@/lib/portraits";
import {
  EMPTY_SHEET,
  sheetFromAI,
  sheetFromRow,
  sheetToRow,
  type CharacterSheet,
} from "@/lib/character-sheet";
import type { AIResult, CampaignSeed } from "@/lib/ai/types";

export const Route = createFileRoute("/_authenticated/campaigns/$id_/character")({
  head: () => ({
    meta: [
      { title: "Campfire — Création de personnage" },
      {
        name: "description",
        content:
          "Créez votre personnage Campfire : manuellement, en important une fiche, ou avec le MJ IA.",
      },
      { property: "og:title", content: "Campfire — Création de personnage" },
      {
        property: "og:description",
        content: "Trois façons de donner vie à votre personnage dans Campfire.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CharacterPage,
});

type Method = "manual" | "import" | "ai";

const METHODS: { id: Method; icon: typeof PenLine; title: string; text: string; desc: string }[] = [
  {
    id: "manual",
    icon: PenLine,
    title: "Créer manuellement",
    text: "Je remplis moi-même toute la fiche.",
    desc: "Nom, portrait, classe, histoire, attributs, inventaire — tout est modifiable.",
  },
  {
    id: "import",
    icon: FileUp,
    title: "Importer un personnage",
    text: "PDF, Markdown, JSON, TXT, fiche D&D ou Pathfinder.",
    desc: "Le MJ IA lit le document et remplit les champs sans jamais rien inventer.",
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "Créer avec le MJ IA",
    text: "Décrivez une idée… ou laissez vide.",
    desc: "Un personnage cohérent avec le monde, le ton et les factions de la campagne.",
  },
];

const TEXT_EXT = ["txt", "md", "markdown", "json", "csv", "rtf"];

function CharacterPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const campaignQ = useQuery({
    queryKey: ["campaign-seed", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, genre, description, gm_plays, status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const characterQ = useQuery({
    queryKey: ["my-character", id, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("campaign_id", id)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [method, setMethod] = useState<Method | null>(null);
  const [sheet, setSheet] = useState<CharacterSheet>(EMPTY_SHEET);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    const row = characterQ.data;
    if (row && loadedId !== row.id) {
      setSheet(sheetFromRow(row as unknown as Record<string, unknown>));
      setLoadedId(row.id);
      setMethod("manual");
    }
  }, [characterQ.data, loadedId]);

  const seed: CampaignSeed | undefined = useMemo(() => {
    const c = campaignQ.data;
    if (!c) return undefined;
    return { id: c.id, name: c.name, type: c.genre, universe: c.description, gmPlays: c.gm_plays };
  }, [campaignQ.data]);

  const locked = campaignQ.data?.status === "active";

  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handlePortrait(file: File) {
    if (!userId) return;
    setPortraitBusy(true);
    setError(null);
    try {
      const url = await uploadPortrait(file, userId);
      setSheet((s) => ({ ...s, portrait_url: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de téléverser le portrait.");
    }
    setPortraitBusy(false);
  }

  async function generatePortraitFor(target: CharacterSheet) {
    setPortraitBusy(true);
    setError(null);
    const prompt = [
      target.name,
      target.race,
      target.class_profession,
      target.physical_description,
      seed?.universe ?? "",
    ]
      .filter(Boolean)
      .join(", ");
    const result = await AIService.generatePortrait({ prompt: prompt || "adventurer portrait" });
    const url = (result.data as { image_url?: string | null } | null)?.image_url ?? null;
    if (url) setSheet((s) => ({ ...s, portrait_url: url }));
    else setError(result.errorMessage ?? "Le portrait n'a pas pu être généré.");
    setPortraitBusy(false);
  }

  /** Régénération du portrait seul : la fiche n'est jamais modifiée. */
  function generatePortrait() {
    void generatePortraitFor(sheet);
  }

  /** Relance la génération IA (mode "Surprends-moi") tant que le personnage n'est pas validé. */
  async function surprise() {
    if (!id) return;
    setBusy(true);
    setError(null);
    const result = await AIService.generateCharacter({
      campaignId: id,
      description: "",
      ...(seed ? { seed } : {}),
    });
    setBusy(false);
    if (result.ok && result.data) {
      const newSheet = sheetFromAI(result.data);
      setSheet(newSheet);
      setAiResult(result);
      void generatePortraitFor(newSheet);
    } else {
      setError(result.errorMessage ?? "La génération a échoué.");
    }
  }


  async function save() {
    if (!userId) return;
    if (!sheet.name.trim()) {
      setError("Donnez au moins un nom à votre personnage.");
      return;
    }
    setBusy(true);
    setError(null);
    const row = { ...sheetToRow(sheet), campaign_id: id, user_id: userId, is_ready: true };
    const { error: err } = loadedId
      ? await supabase.from("characters").update(row).eq("id", loadedId)
      : await supabase.from("characters").insert(row);

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await supabase
      .from("campaign_players")
      .update({ status: "ready" })
      .eq("campaign_id", id)
      .eq("user_id", userId);

    queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    queryClient.invalidateQueries({ queryKey: ["my-character", id, userId] });
    setSaved(true);
    setBusy(false);
    navigate({ to: "/campaigns/$id", params: { id } });
  }

  return (
    <MobileShell>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 pb-6">
        {method && !loadedId ? (
          <button
            type="button"
            onClick={() => setMethod(null)}
            className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
            aria-label="Retour aux méthodes"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            to="/campaigns/$id"
            params={{ id }}
            className="shrink-0 rounded-full border border-rpg/30 bg-card p-2 text-rpg"
            aria-label="Retour à la campagne"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="truncate font-display text-xl font-bold tracking-wide text-foreground">
          Mon personnage
        </h1>
      </header>

      {error && (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {method === null && <MethodPicker onPick={setMethod} />}

      {method === "import" && !loadedId && (
        <ImportPanel
          campaignId={id}
          seed={seed}
          onResult={(s, r) => {
            setSheet(s);
            setAiResult(r);
            setMethod("manual");
          }}
          onError={setError}
        />
      )}

      {method === "ai" && !loadedId && (
        <AiPanel
          campaignId={id}
          seed={seed}
          onResult={(s, r) => {
            setSheet(s);
            setAiResult(r);
            setMethod("manual");
            // Fiche validée -> portrait illustré généré automatiquement.
            void generatePortraitFor(s);
          }}
          onError={setError}
        />
      )}

      {method === "manual" && (
        <SheetEditor
          sheet={sheet}
          setSheet={setSheet}
          onPortrait={handlePortrait}
          portraitBusy={portraitBusy}
          onGeneratePortrait={generatePortrait}
          onSurprise={surprise}
          locked={locked}
          busy={busy}
          saved={saved}
          onSave={save}
        />
      )}

      <div className="pt-4">
        <AIDebugPanel result={aiResult} />
      </div>
    </MobileShell>
  );
}

function MethodPicker({ onPick }: { onPick: (m: Method) => void }) {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Choisissez comment donner vie à votre personnage. Rien n'est définitif : tout reste
        modifiable tant que la campagne n'a pas commencé.
      </p>
      <ul className="flex flex-col gap-3">
        {METHODS.map((m) => {
          const Icon = m.icon;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPick(m.id)}
                className="w-full rounded-2xl border border-rpg/30 bg-card p-4 text-left transition-colors hover:border-rpg active:scale-[0.995]"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rpg/30 bg-secondary text-rpg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg tracking-wide text-foreground">{m.title}</h2>
                    <p className="mt-1 text-sm text-foreground/90">{m.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ImportPanel({
  campaignId,
  seed,
  onResult,
  onError,
}: {
  campaignId: string;
  seed?: CampaignSeed;
  onResult: (sheet: CharacterSheet, result: AIResult) => void;
  onError: (msg: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function analyse() {
    if (!file) return;
    setBusy(true);
    onError(null);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    let documentText = "";
    let attachments: { name: string; mimeType: string; dataUrl: string }[] | undefined;
    try {
      if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) {
        documentText = await file.text();
      } else {
        attachments = [
          { name: file.name, mimeType: file.type || "application/pdf", dataUrl: await fileToDataUrl(file) },
        ];
      }
    } catch {
      onError("Impossible de lire ce fichier.");
      setBusy(false);
      return;
    }

    const result = await AIService.importCharacter({
      campaignId,
      documentText,
      ...(attachments ? { attachments } : {}),
      ...(seed ? { seed } : {}),
    });
    setBusy(false);
    if (result.ok && result.data) onResult(sheetFromAI(result.data), result);
    else onError(result.errorMessage ?? "L'analyse du document a échoué.");
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <PanelHeader
        icon={FileUp}
        title="Importer un personnage"
        text="PDF, Markdown, JSON, TXT, fiche D&D ou Pathfinder."
      />
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
          if (f) setFile(f);
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center ${
            over ? "border-rpg" : "border-rpg/40"
          }`}
        >
          <Upload className="h-7 w-7 text-rpg" />
          <span className="font-display tracking-wide text-foreground">
            Déposer ou choisir un fichier
          </span>
          <span className="text-xs text-muted-foreground">PDF, MD, JSON, TXT, image</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.md,.markdown,.json,.txt,.csv,.rtf,image/*"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <div className="rounded-2xl border border-rpg/30 bg-card p-4">
          <p className="truncate font-display tracking-wide text-foreground">{file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} Ko</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Les informations absentes du document restent vides : le MJ IA n'invente rien.
      </p>
      <button
        type="button"
        onClick={analyse}
        disabled={!file || busy}
        className="mt-auto rpg-button py-4 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-rpg" />
        ) : (
          <Sparkles className="h-5 w-5 shrink-0 text-rpg" />
        )}
        <span className="font-display tracking-wide">
          {busy ? "Lecture de la fiche…" : "Analyser la fiche"}
        </span>
      </button>
    </section>
  );
}

function AiPanel({
  campaignId,
  seed,
  onResult,
  onError,
}: {
  campaignId: string;
  seed?: CampaignSeed;
  onResult: (sheet: CharacterSheet, result: AIResult) => void;
  onError: (msg: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    onError(null);
    const result = await AIService.generateCharacter({
      campaignId,
      description: text,
      ...(seed ? { seed } : {}),
    });
    setBusy(false);
    if (result.ok && result.data) onResult(sheetFromAI(result.data), result);
    else onError(result.errorMessage ?? "La génération a échoué.");
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <PanelHeader
        icon={Sparkles}
        title="Créer avec le MJ IA"
        text="Décrivez qui vous aimeriez jouer — ou ne renseignez rien."
      />
      <textarea
        className="rpg-input min-h-40 resize-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ancien chevalier devenu mercenaire, protecteur, rongé par la culpabilité… (facultatif)"
      />
      <ul className="flex flex-wrap gap-2">
        {["Monde", "Type de campagne", "Ton", "Factions", "Difficulté", "Classes disponibles"].map(
          (t) => (
            <li
              key={t}
              className="rounded-full border border-rpg/30 px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
            >
              {t}
            </li>
          ),
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        Le personnage généré doit sembler avoir toujours appartenu à cet univers. Vous pourrez
        ensuite tout modifier.
      </p>
      <button type="button" onClick={generate} disabled={busy} className="mt-auto rpg-button py-4 disabled:opacity-50">
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-rpg" />
        ) : (
          <Wand2 className="h-5 w-5 shrink-0 text-rpg" />
        )}
        <span className="font-display tracking-wide">
          {busy ? "Le MJ imagine…" : text.trim() ? "Générer mon personnage" : "Surprends-moi"}
        </span>
      </button>
    </section>
  );
}

function SheetEditor({
  sheet,
  setSheet,
  onPortrait,
  portraitBusy,
  onGeneratePortrait,
  onSurprise,
  locked,
  busy,
  saved,
  onSave,
}: {
  sheet: CharacterSheet;
  setSheet: React.Dispatch<React.SetStateAction<CharacterSheet>>;
  onPortrait: (f: File) => void;
  portraitBusy: boolean;
  onGeneratePortrait: () => void;
  onSurprise: () => void;
  locked: boolean;
  busy: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const set =
    <K extends keyof CharacterSheet>(key: K) =>
    (value: CharacterSheet[K]) =>
      setSheet((s) => ({ ...s, [key]: value }));

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PortraitPicker
        url={sheet.portrait_url}
        busy={portraitBusy}
        onFile={onPortrait}
        onGenerate={onGeneratePortrait}
        onClear={() => set("portrait_url")(null)}
      />

      <div className="flex flex-col gap-3">
        <TextField label="Nom" value={sheet.name} onChange={set("name")} placeholder="Ysolde de Farren" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Race / peuple" value={sheet.race} onChange={set("race")} placeholder="Humaine" />
          <TextField
            label="Classe / métier"
            value={sheet.class_profession}
            onChange={set("class_profession")}
            placeholder="Éclaireuse"
          />
        </div>
        <TextField
          label="Niveau"
          value={String(sheet.level)}
          onChange={(v) => set("level")(Number(v.replace(/\D/g, "")) || 1)}
        />
      </div>

      <section className="flex flex-col gap-2 rounded-2xl border border-rpg bg-rpg/5 p-4">
        <h2 className="font-display text-lg tracking-wide text-rpg">Motivation du personnage</h2>
        <p className="text-sm text-foreground/90">Pourquoi votre personnage est-il ici ?</p>
        <textarea
          className="rpg-input min-h-28 resize-none"
          value={sheet.motivation}
          onChange={(e) => set("motivation")(e.target.value)}
          placeholder="Une dette, une vengeance, une promesse…"
        />
        <p className="text-[11px] text-muted-foreground">
          Cette motivation est privée : seul le MJ IA la connaît. Il pourra s'en servir pour des
          dilemmes, alliances ou quêtes personnelles, sans jamais vous forcer la main.
        </p>
      </section>

      <div className="flex flex-col gap-3">
        <AreaField
          label="Description physique"
          value={sheet.physical_description}
          onChange={set("physical_description")}
          placeholder="Silhouette, regard, cicatrices, style…"
        />
        <AreaField
          label="Historique"
          value={sheet.backstory}
          onChange={set("backstory")}
          rows={5}
          placeholder="D'où vient-il ? Que fuit-il ?"
        />
        <AreaField label="Traits" value={sheet.traits} onChange={set("traits")} rows={3} />
        <AreaField label="Personnalité" value={sheet.personality} onChange={set("personality")} rows={3} />
        <AreaField label="Valeurs" value={sheet.values} onChange={set("values")} rows={3} />
        <AreaField label="Défauts" value={sheet.flaws} onChange={set("flaws")} rows={3} />
      </div>

      <AttributeEditor items={sheet.attributes} onChange={set("attributes")} />
      <ListEditor
        label="Compétences"
        items={sheet.abilities}
        onChange={set("abilities")}
        placeholder="Discrétion"
      />
      <ListEditor
        label="Inventaire de départ"
        items={sheet.inventory}
        onChange={set("inventory")}
        placeholder="Corde de chanvre"
      />

      <p className="text-xs text-muted-foreground">
        {locked
          ? "La campagne a commencé : vos modifications restent possibles mais visibles du MJ IA."
          : "Tous les champs restent modifiables tant que la campagne n'a pas commencé."}
      </p>

      <button type="button" onClick={onSave} disabled={busy} className="rpg-button py-4 disabled:opacity-50">
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-rpg" />
        ) : (
          <Check className="h-5 w-5 shrink-0 text-rpg" />
        )}
        <span className="font-display tracking-wide">
          {busy ? "Enregistrement…" : saved ? "Enregistré" : "Valider mon personnage"}
        </span>
      </button>
    </section>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof PenLine;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rpg/30 bg-secondary text-rpg">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg tracking-wide text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
