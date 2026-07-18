import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [gmPlays, setGmPlays] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom de la campagne est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("games")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        genre: genre || null,
        gm_plays: gmPlays,
      })
      .select("id")
      .single();
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCreatedId(data.id);
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

        {createdId ? (
          <div className="rounded-2xl border border-rpg/40 bg-card p-6 text-center space-y-3">
            <p className="font-display text-xl text-rpg">Partie créée !</p>
            <p className="text-sm text-muted-foreground">Identifiant de la partie :</p>
            <p className="break-all rounded-lg bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
              {createdId}
            </p>
          </div>
        ) : (
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
        )}

        <Link to="/" className="rpg-button">
          <ArrowLeft className="h-5 w-5 shrink-0 text-rpg" />
          <span className="font-display tracking-wide">Retour</span>
        </Link>
      </div>
    </MobileShell>
  );
}
