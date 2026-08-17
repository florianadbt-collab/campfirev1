import { parseFormula, type DiceRoll } from "./dice";

/**
 * Tirage aléatoire cryptographique, côté serveur uniquement.
 * Le navigateur ne décide jamais du résultat d'un dé virtuel.
 */
function secureInt(faces: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / faces) * faces;
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= limit);
  return 1 + (value % faces);
}

/** Lancer virtuel : Campfire tire les dés. */
export function serverRoll(formula: string): DiceRoll {
  const { count, faces, bonus } = parseFormula(formula);
  const dice = Array.from({ length: count }, () => secureInt(faces));
  const sum = dice.reduce((a, b) => a + b, 0);
  return { formula, dice, bonus, total: sum + bonus };
}

/**
 * Lancer physique : le joueur saisit ce qu'il a obtenu sur ses vrais dés.
 * Le serveur refuse toute valeur impossible (ex : 27 sur un d20) et applique
 * lui-même les modificateurs.
 */
export function validatePhysicalRoll(
  formula: string,
  values: number[],
): { ok: true; roll: DiceRoll } | { ok: false; message: string } {
  const { count, faces, bonus } = parseFormula(formula);
  const dice = values.map((v) => Math.trunc(Number(v)));
  if (dice.length !== count) {
    return { ok: false, message: `Ce test demande ${count} dé(s) à ${faces} faces.` };
  }
  if (dice.some((d) => !Number.isFinite(d) || d < 1 || d > faces)) {
    return { ok: false, message: `Résultat impossible : un d${faces} donne un nombre entre 1 et ${faces}.` };
  }
  const sum = dice.reduce((a, b) => a + b, 0);
  return { ok: true, roll: { formula, dice, bonus, total: sum + bonus } };
}
