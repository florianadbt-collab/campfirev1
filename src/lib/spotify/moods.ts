/**
 * Catalogue d'ambiances Campfire (client-safe).
 * Gemini renvoie une commande musicale structurée, Campfire la traduit
 * en recherche Spotify côté serveur.
 */
export type MusicMood =
  | "exploration"
  | "village"
  | "ville"
  | "taverne"
  | "voyage"
  | "mystere"
  | "tension"
  | "enquete"
  | "combat"
  | "combat_majeur"
  | "boss"
  | "victoire"
  | "defaite"
  | "tragedie"
  | "repos";

export interface MusicCommand {
  type: "music";
  action: "change" | "keep" | "stop";
  mood: MusicMood;
  genre?: string;
  /** 1 à 5 */
  intensity?: number;
  search_query?: string;
}

export const MOODS: Record<MusicMood, { label: string; query: string; intensity: number }> = {
  exploration: { label: "Exploration", query: "fantasy exploration ambient soundtrack", intensity: 2 },
  village: { label: "Village", query: "medieval village folk ambience music", intensity: 1 },
  ville: { label: "Ville", query: "fantasy city marketplace soundtrack", intensity: 2 },
  taverne: { label: "Taverne", query: "medieval tavern lute folk music", intensity: 2 },
  voyage: { label: "Voyage", query: "epic travelling adventure soundtrack", intensity: 3 },
  mystere: { label: "Mystère", query: "dark mysterious ambient fantasy music", intensity: 2 },
  tension: { label: "Tension", query: "suspense tense orchestral underscore", intensity: 3 },
  enquete: { label: "Enquête", query: "investigation noir mystery instrumental", intensity: 2 },
  combat: { label: "Combat", query: "epic fantasy battle orchestral", intensity: 4 },
  combat_majeur: { label: "Combat majeur", query: "epic war battle choir orchestral", intensity: 5 },
  boss: { label: "Boss", query: "epic boss battle music orchestral choir", intensity: 5 },
  victoire: { label: "Victoire", query: "heroic victory fanfare orchestral", intensity: 3 },
  defaite: { label: "Défaite", query: "sad defeat orchestral requiem", intensity: 2 },
  tragedie: { label: "Tragédie", query: "tragic emotional strings soundtrack", intensity: 2 },
  repos: { label: "Repos", query: "calm campfire night ambient music", intensity: 1 },
};

export const MOOD_KEYS = Object.keys(MOODS) as MusicMood[];

export function normalizeMood(value: unknown): MusicMood | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[éèê]/g, "e")
    .replace(/\s+/g, "_");
  const aliases: Record<string, MusicMood> = {
    epic_combat: "combat",
    battle: "combat",
    major_combat: "combat_majeur",
    boss_fight: "boss",
    rest: "repos",
    city: "ville",
    town: "village",
    tavern: "taverne",
    travel: "voyage",
    mystery: "mystere",
    investigation: "enquete",
    victory: "victoire",
    defeat: "defaite",
    tragedy: "tragedie",
  };
  if (key in MOODS) return key as MusicMood;
  return aliases[key] ?? null;
}
