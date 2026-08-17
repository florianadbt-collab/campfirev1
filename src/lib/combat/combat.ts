import type { CombatBlock, CombatStatus } from "@/lib/ai/types";

/** Ennemi tel que persisté côté serveur (source de vérité). */
export type CombatEnemy = {
  id: string;
  name: string;
  level: number;
  max_hp: number;
  hp: number;
  status_label: string;
  is_defeated: boolean;
  sort_order: number;
};

export type Combat = {
  id: string;
  campaign_id: string;
  status: CombatStatus;
  round: number;
  turn_index: number;
  initiative: string[];
  active_participant: string | null;
};

export const COMBAT_END_STATUSES: CombatStatus[] = ["victory", "defeat", "flight", "interrupted"];

export function isCombatOver(status: CombatStatus): boolean {
  return COMBAT_END_STATUSES.includes(status);
}

export const COMBAT_END_LABEL: Record<CombatStatus, string> = {
  active: "Combat en cours",
  victory: "Victoire",
  defeat: "Défaite",
  flight: "Fuite",
  interrupted: "Combat interrompu",
};

/** Santé qualitative affichée aux joueurs (les PV réels restent en base). */
export function healthLabel(hp: number, maxHp: number): string {
  if (hp <= 0) return "À terre";
  const ratio = hp / Math.max(1, maxHp);
  if (ratio >= 0.95) return "En pleine forme";
  if (ratio >= 0.7) return "Légèrement blessé";
  if (ratio >= 0.4) return "Blessé";
  return "Gravement blessé";
}

/** Barre de santé en 10 segments. */
export function healthSegments(hp: number, maxHp: number): number {
  if (hp <= 0) return 0;
  return Math.max(1, Math.round((hp / Math.max(1, maxHp)) * 10));
}

/** Comparaison de menace entre le personnage et un ennemi. */
export function threatLabel(playerLevel: number, enemyLevel: number): string {
  const diff = enemyLevel - playerLevel;
  if (diff <= -3) return "Menace faible";
  if (diff <= -1) return "Plus faible que vous";
  if (diff === 0) return "De votre niveau";
  if (diff <= 2) return "Plus fort que vous";
  return "Menace redoutable";
}

/** Le bloc renvoyé par Gemini décrit-il un combat en cours ? */
export function combatIsActive(block: CombatBlock | null | undefined): boolean {
  return Boolean(block && block.active && block.status === "active" && block.enemies.length > 0);
}
