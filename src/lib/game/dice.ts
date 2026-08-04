/** Lancer de dés Campfire — formules type "1d20+3", "2d6", "1d20-1". */
export type DiceRoll = {
  formula: string;
  dice: number[];
  bonus: number;
  total: number;
};

export function parseFormula(formula: string): { count: number; faces: number; bonus: number } {
  const m = /^\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(formula || "");
  if (!m) return { count: 1, faces: 20, bonus: 0 };
  return {
    count: Math.min(10, Math.max(1, Number(m[1] || 1))),
    faces: Math.min(100, Math.max(2, Number(m[2] || 20))),
    bonus: Number((m[3] ?? "0").replace(/\s/g, "")) || 0,
  };
}

export function rollFormula(formula: string): DiceRoll {
  const { count, faces, bonus } = parseFormula(formula);
  const dice = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * faces));
  const sum = dice.reduce((a, b) => a + b, 0);
  return { formula, dice, bonus, total: sum + bonus };
}
