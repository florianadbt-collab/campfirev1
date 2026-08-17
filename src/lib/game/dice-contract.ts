/** Contrats de jets partagés client <-> serveur (aucun code serveur ici). */
export type DiceMode = "virtual" | "physical";

export type ResolveDiceInput = {
  campaignId?: string;
  formula: string;
  threshold: number;
  ability?: string;
  reason?: string;
  mode: DiceMode;
  /** Uniquement en mode physique : les faces obtenues sur les vrais dés. */
  values?: number[];
};

export type DiceOutcomePayload =
  | { ok: false; message: string }
  | {
      ok: true;
      formula: string;
      dice: number[];
      bonus: number;
      total: number;
      threshold: number;
      success: boolean;
      manual: boolean;
      critical: "success" | "failure" | null;
      ability?: string;
    };

/** Réussite / échec critique : uniquement sur un d20 unique. */
export function criticalOf(formula: string, dice: number[]): "success" | "failure" | null {
  if (!/d\s*20/i.test(formula) || dice.length !== 1) return null;
  if (dice[0] === 20) return "success";
  if (dice[0] === 1) return "failure";
  return null;
}
