/**
 * Contrats partagés de la couche d'immersion (client + serveur).
 * Ces données décrivent la mémoire du monde : elles ne remplacent jamais
 * la narration, elles la nourrissent.
 */

export type MemoryVisibility = "public" | "gm" | "private";

export type MemoryKind =
  | "event"
  | "world_event"
  | "location"
  | "faction"
  | "quest"
  | "reputation"
  | "npc_secret"
  | "note";

export interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  visibility: string;
  importance: string;
  campaign_day: number;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NpcRow {
  id: string;
  name: string;
  role_label: string;
  faction: string;
  personality: string;
  speech_style: string;
  appearance: string;
  status: string;
  location: string;
  is_alive: boolean;
  first_seen_day: number;
  last_seen_day: number;
}

export interface NpcRelationRow {
  id: string;
  npc_id: string;
  user_id: string | null;
  trust: number;
  suspicion: number;
  hostility: number;
  stance: string;
  opinion: string;
  last_event: string;
}

export interface ConditionRow {
  id: string;
  user_id: string;
  label: string;
  severity: string;
  is_active: boolean;
}

export interface WorldTime {
  day: number;
  time_of_day: string;
  weather: string;
  location: string;
}

export const DEFAULT_WORLD_TIME: WorldTime = {
  day: 1,
  time_of_day: "",
  weather: "",
  location: "",
};

/**
 * Posture narrative d'un PNJ envers un personnage.
 * Volontairement qualitative : aucun chiffre n'est montré aux joueurs.
 */
export function stanceFrom(trust: number, suspicion: number, hostility: number): string {
  if (hostility >= 60) return "hostile";
  if (hostility >= 30) return "menaçant";
  if (suspicion >= 50 && trust < 30) return "méfiant";
  if (trust >= 70) return "loyal";
  if (trust >= 40) return "amical";
  if (trust >= 15) return "confiant";
  if (suspicion >= 25) return "réservé";
  return "neutre";
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Lecture humaine d'un souvenir, pour les panneaux MJ et joueurs. */
export function memoryTitle(row: MemoryRow): string {
  const name = row.metadata?.["name"];
  return typeof name === "string" && name ? name : row.content.slice(0, 60);
}
