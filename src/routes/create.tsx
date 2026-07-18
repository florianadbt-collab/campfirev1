import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import {
  generateInviteCode,
  getDeviceId,
  getStoredName,
  setStoredName,
} from "@/lib/device";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GENRES = [
  "Fantasy",
  "Science-fiction",
  "Horreur",
  "Cyberpunk",
  "Post-apocalyptique",
  "Médiéval",
  "Contemporain",
  "Steampunk",
];

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "RPG Table — Créer une partie" },
      { name: "description", content: "Créez une nouvelle partie de jeu de rôle." },
      { property: "og:title", content: "RPG Table — Créer une partie" },
      { property: "og:description", content: "Créez une nouvelle partie de jeu de rôle." },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [gmName, setGmName] = useState(getStoredName());
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [gmPlays, setGmPlays] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom de la campagne est obligatoire.");
      return;
    }
    if (!gmName.trim()) {
      setError("Ton pseudo de MJ est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const deviceId = getDeviceId();
    setStoredName(gmName.trim());

    // Try a few times in case of code collision.
    let inviteCode = "";
    let gameId: string | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode(6);
      const { data, error: insertError } = await supabase
        .from("games")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          genre: genre || null,
          gm_plays: gmPlays,
          invite_code: code,
          gm_device_id: deviceId,
          status: "lobby",
        })
        .select("id, invite_code")
        .single();
      if (!insertError && data) {
        gameId = data.id;
        inviteCode = data.invite_code as string;
        break;
      }
      lastError = insertError?.message ?? "Erreur inconnue";
      if (insertError && !insertError.message.toLowerCase().includes("invite_code")) {
        break;
      }
    }

    if (!gameId || !inviteCode) {
      setLoading(false);
      setError(lastError ?? "Impossible de créer la partie.");
      return;
    }

    // Add the GM as a participant.
    const { error: partError } = await supabase.from("participants").insert({
      game_id: gameId,
      device_id: deviceId,
      display_name: gmName.trim(),
      is_gm: true,
      status: "connected",
    });
    setLoading(false);
    if (partError) {
      setError(partError.message);
      return;
    }
    navigate({ to: "/lobby/$code", params: { code: inviteCode } });
  }

  return (
    <MobileShell>
      <div className="flex flex-1 flex-col gap-6 py-4">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Créer une partie
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Préparez votre campagne et invitez vos joueurs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="space-y-2">
              <Label htmlFor="name">
                Nom de la campagne <span className="text-rpg">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Les Chroniques d'Eldoria"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gm-name">
                Ton pseudo (MJ) <span className="text-rpg">*</span>
              </Label>
              <Input
                id="gm-name"
                value={gmName}
                onChange={(e) => setGmName(e.target.value)}
                maxLength={40}
                placeholder="Maître du jeu"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description de l'univers</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                placeholder="Un royaume oublié, hanté par d'anciennes prophéties…"
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">Genre / Ambiance</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger id="genre">
                  <SelectValue placeholder="Choisir un genre" />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <Label htmlFor="gm-plays" className="cursor-pointer">
                Le MJ joue aussi
              </Label>
              <Switch id="gm-plays" checked={gmPlays} onCheckedChange={setGmPlays} />
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="rpg-button disabled:opacity-50">
              <span className="font-display tracking-wide">
                {loading ? "Création…" : "Créer la partie"}
              </span>
            </button>
          </form>

        <Link to="/" className="rpg-button">
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Retour</span>
        </Link>
      </div>
    </MobileShell>
  );
}
