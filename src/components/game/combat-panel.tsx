import { Crosshair, Skull, Swords } from "lucide-react";
import { healthLabel, healthSegments, threatLabel, type CombatEnemy } from "@/lib/combat/combat";

/** Bandeau COMBAT — même vérité publique sur tous les appareils. */
export function CombatBanner({
  round,
  activeName,
}: {
  round: number;
  activeName: string | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-3 py-2">
      <Swords className="h-4 w-4 shrink-0 text-destructive" />
      <span className="font-display text-xs uppercase tracking-widest text-destructive">Combat</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        Round {round}
        {activeName ? ` · au tour de ${activeName}` : ""}
      </span>
    </div>
  );
}

/**
 * Ennemis présents + ciblage.
 * Les joueurs voient l'état qualitatif ; le MJ voit les PV exacts.
 */
export function EnemyList({
  enemies,
  playerLevel,
  targetId,
  onTarget,
  showExactHp = false,
}: {
  enemies: CombatEnemy[];
  playerLevel: number;
  targetId: string | null;
  onTarget: (id: string) => void;
  showExactHp?: boolean;
}) {
  if (enemies.length === 0) return null;
  return (
    <section className="rounded-2xl border border-destructive/30 bg-card/70 p-3">
      <header className="flex items-center gap-2 pb-2">
        <Crosshair className="h-4 w-4 shrink-0 text-destructive" />
        <h2 className="font-display text-sm uppercase tracking-wider text-destructive">Ennemis</h2>
      </header>
      <ul className="flex flex-col gap-2">
        {enemies.map((e) => {
          const filled = healthSegments(e.hp, e.max_hp);
          const selected = targetId === e.id;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onTarget(e.id)}
                aria-pressed={selected}
                disabled={e.is_defeated}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-destructive/70 bg-destructive/10"
                    : "border-rpg/20 bg-secondary"
                } ${e.is_defeated ? "opacity-50" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {e.is_defeated && <Skull className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />}
                    {e.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-rpg/25 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Niv. {e.level}
                  </span>
                </span>
                <span className="flex items-center gap-2 pt-1.5">
                  <span className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: 10 }, (_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-[2px] ${
                          i < filled ? "bg-destructive/80" : "bg-muted"
                        }`}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {e.status_label || healthLabel(e.hp, e.max_hp)}
                    {showExactHp ? ` · ${e.hp}/${e.max_hp} PV` : ""}
                  </span>
                </span>
                <span className="block pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {threatLabel(playerLevel, e.level)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="pt-2 text-[11px] text-muted-foreground">
        {targetId
          ? "Cible sélectionnée — votre action la visera."
          : "Touchez un ennemi pour le prendre pour cible."}
      </p>
    </section>
  );
}
