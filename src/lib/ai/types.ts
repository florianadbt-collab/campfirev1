/**
 * Contrats partagés client <-> moteur IA (gemini-engine).
 * Ces types sont volontairement "ouverts" : les blocs de contexte des phases
 * futures (World State, Clocks, NPC Registry...) sont déjà déclarés et
 * transitent tels quels jusqu'au moteur, sans changer la signature publique.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type AITask =
  | "createCampaign"
  | "startCampaign"
  | "playTurn"
  | "generateCharacter"
  | "importCharacter"
  | "generatePortrait"
  | "generateSceneImage"
  | "generateMusic"
  | "summarizeCampaign"
  | "generateNpc"
  | "generateLocation"
  | "generateQuest";

export interface CampaignSeed {
  id?: string;
  name: string;
  type?: string | null;
  universe?: string | null;
  gmPlays?: boolean;
}

export type CharacterBrief = {
  name: string;
  race?: string | null;
  class_profession?: string | null;
  level?: number | null;
  backstory?: string | null;
}

/** Blocs de contexte réservés aux phases suivantes du moteur Campfire. */
export interface AIWorldContext {
  campaignSeed?: CampaignSeed;
  canonicalWorldState?: Json;
  stateDelta?: Json;
  playerIntent?: Json;
  worldTimeline?: Json;
  activeClocks?: Json;
  npcRegistry?: Json;
  factionRegistry?: Json;
  secretKnowledge?: Json;
}

export interface AIRequest {
  task: AITask;
  campaignId?: string;
  /** Données spécifiques à la tâche (ex: liste des personnages). */
  payload?: { [key: string]: Json };
  context?: AIWorldContext;
  /** Pièces jointes multimodales (data URL) — import de fiche par exemple. */
  attachments?: { name: string; mimeType: string; dataUrl: string }[];
  /** Persiste la réponse dans la table `messages` quand c'est pertinent. */
  persist?: boolean;
  debug?: boolean;
}

export type SceneResponse = {
  scene_title: string;
  narration: string;
  scene_mood: string;
  music_query: string;
  image_prompt: string;
  suggested_actions: string[];
  /** Barre d'ambiance — alimentée par le MJ IA. */
  location?: string;
  world_time?: string;
  weather?: string;
  tension?: number;
  /** Répliques ponctuelles, affichées en bulles. */
  dialogues?: { speaker: string; line: string }[];
  /** Test de dés demandé par le MJ avant de poursuivre. */
  dice_request?: {
    formula: string;
    threshold: number;
    reason: string;
    ability?: string;
  } | null;
}

export interface AIDebugInfo {
  task: AITask;
  model: string;
  prompt: string;
  raw: string;
  durationMs: number;
  error?: string;
}

export interface AIResult<T extends Json = Json> {
  ok: boolean;
  task: AITask;
  data: T | null;
  /** Code stable : ai_unavailable | ai_rate_limited | ai_no_credits | ai_bad_json | ai_error */
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
  debug?: AIDebugInfo;
  simulated?: boolean;
}