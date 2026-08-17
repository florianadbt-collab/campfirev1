import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dices, Hand, X } from "lucide-react";
import { parseFormula, type DiceRoll } from "@/lib/game/dice";
import { resolveDice } from "@/lib/game/dice.functions";
import type { DiceMode } from "@/lib/game/dice-contract";

export type DiceRequest = { formula: string; threshold: number; reason: string; ability?: string };

/** « (Dextérité, +2) », « (Force, -1) » ou « (Sagesse, aucun modificateur) ». */
export function abilityModifierLabel(request: { formula: string; ability?: string }): string {
  const bonus = parseFormula(request.formula).bonus;
  const mod = bonus > 0 ? `+${bonus}` : bonus < 0 ? String(bonus) : "aucun modificateur";
  const ability = request.ability?.trim();
  return ability ? `(${ability}, ${mod})` : `(${mod})`;
}

export type DiceOutcome = DiceRoll & {
  threshold: number;
  success: boolean;
  manual: boolean;
  critical: "success" | "failure" | null;
};

function outcomeLabel(o: DiceOutcome) {
  if (o.critical === "success") return "RÉUSSITE CRITIQUE";
  if (o.critical === "failure") return "ÉCHEC CRITIQUE";
  return o.success ? "RÉUSSITE" : "ÉCHEC";
}

function signed(n: number) {
  return n > 0 ? `+ ${n}` : n < 0 ? `− ${Math.abs(n)}` : "+ 0";
}

/** Dé animé : rotation courte puis chiffres qui défilent, léger sur mobile. */
function DieVisual({
  faces,
  rolling,
  value,
  critical,
}: {
  faces: number;
  rolling: boolean;
  value: number | null;
  critical: "success" | "failure" | null;
}) {
  const [flicker, setFlicker] = useState(1);

  useEffect(() => {
    if (!rolling) return;
    const timer = window.setInterval(() => setFlicker(1 + Math.floor(Math.random() * faces)), 70);
    return () => window.clearInterval(timer);
  }, [rolling, faces]);

  const tone =
    critical === "success"
      ? "border-rpg text-rpg shadow-[0_0_28px_-6px_var(--rpg)]"
      : critical === "failure"
        ? "border-destructive/70 text-destructive"
        : "border-rpg/50 text-foreground";

  return (
    <div className="grid place-items-center py-2">
      <div
        className={`grid h-28 w-28 place-items-center rounded-[28%] border-2 bg-secondary/70 transition-all duration-300 ${tone} ${
          rolling ? "animate-[dice-tumble_0.5s_linear_infinite]" : "scale-105"
        }`}
        style={{ clipPath: "polygon(50% 0%, 95% 27%, 95% 73%, 50% 100%, 5% 73%, 5% 27%)" }}
      >
        <span className="font-display text-4xl tabular-nums">{rolling ? flicker : (value ?? "?")}</span>
      </div>
      <p className="pt-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">D{faces}</p>
    </div>
  );
}

/**
 * Résolution d'un test. Le mode (virtuel / physique) vient des paramètres du
 * joueur : la question n'est jamais reposée à chaque jet.
 * Le résultat est toujours calculé et validé côté serveur.
 */
export function DiceRollerDialog({
  request,
  mode,
  campaignId,
  onResolved,
  onCancel,
}: {
  request: DiceRequest;
  mode: DiceMode;
  campaignId?: string;
  onResolved: (outcome: DiceOutcome) => void;
  onCancel: () => void;
}) {
  const resolve = useServerFn(resolveDice);
  const { count, faces } = parseFormula(request.formula);
  const [phase, setPhase] = useState<"rolling" | "input" | "result">(
    mode === "virtual" ? "rolling" : "input",
  );
  const [values, setValues] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const [outcome, setOutcome] = useState<DiceOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function submit(payloadMode: DiceMode, dice?: number[]) {
    setBusy(true);
    setError(null);
    const shownAt = Date.now();
    const result = await resolve({
      data: {
        ...(campaignId ? { campaignId } : {}),
        formula: request.formula,
        threshold: request.threshold,
        ...(request.ability ? { ability: request.ability } : {}),
        reason: request.reason,
        mode: payloadMode,
        ...(dice ? { values: dice } : {}),
      },
    });
    if (!result.ok) {
      setError(result.message);
      setPhase("input");
      setBusy(false);
      return;
    }
    // On laisse l'animation vivre un court instant, sans jamais bloquer le jeu.
    const wait = payloadMode === "virtual" ? Math.max(0, 850 - (Date.now() - shownAt)) : 0;
    window.setTimeout(() => {
      setOutcome({
        formula: result.formula,
        dice: result.dice,
        bonus: result.bonus,
        total: result.total,
        threshold: result.threshold,
        success: result.success,
        manual: result.manual,
        critical: result.critical,
      });
      setPhase("result");
      setBusy(false);
    }, wait);
  }

  // Mode virtuel : le lancer part tout seul, le joueur n'a rien à choisir.
  useEffect(() => {
    if (mode !== "virtual" || started.current) return;
    started.current = true;
    void submit("virtual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const raw = outcome ? outcome.dice.reduce((a, b) => a + b, 0) : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/85 p-4 backdrop-blur sm:place-items-center">
      <div className="w-full max-w-sm rounded-3xl border border-rpg/30 bg-card p-5">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg tracking-wide text-foreground">
              {mode === "virtual" ? "Jet de dés" : `${request.formula.toUpperCase()} requis`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {request.reason} · {request.formula} {abilityModifierLabel(request)} · seuil {request.threshold}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="shrink-0 rounded-full border border-rpg/30 p-1.5 text-rpg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {phase === "rolling" && (
          <div className="flex flex-col items-center gap-1">
            <DieVisual faces={faces} rolling value={null} critical={null} />
            <p className="text-sm text-muted-foreground">Les dés roulent…</p>
          </div>
        )}

        {phase === "input" && (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 rounded-2xl border border-rpg/25 bg-secondary px-3 py-2 text-xs text-muted-foreground">
              <Hand className="h-4 w-4 shrink-0 text-rpg" />
              Lance {count > 1 ? `tes ${count} dés` : "ton dé"} puis indique le résultat brut.
            </p>
            <div className="flex gap-2">
              {values.map((v, i) => (
                <input
                  key={i}
                  className="rpg-input text-center"
                  inputMode="numeric"
                  autoFocus={i === 0}
                  value={v}
                  min={1}
                  max={faces}
                  aria-label={`Dé ${i + 1} (1 à ${faces})`}
                  placeholder={`1-${faces}`}
                  onChange={(e) =>
                    setValues((cur) =>
                      cur.map((x, idx) => (idx === i ? e.target.value.replace(/[^\d]/g, "") : x)),
                    )
                  }
                />
              ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="button"
              disabled={busy || values.some((v) => !v)}
              onClick={() => void submit("physical", values.map(Number))}
              className="rpg-button disabled:opacity-50"
            >
              <span className="font-display tracking-wide">{busy ? "..." : "Valider"}</span>
            </button>
            <p className="text-[11px] text-muted-foreground">
              Campfire vérifie que le résultat est possible pour un d{faces} et applique les modificateurs.
            </p>
          </div>
        )}

        {phase === "result" && outcome && (
          <div className="flex flex-col gap-3">
            <DieVisual faces={faces} rolling={false} value={raw} critical={outcome.critical} />
            <div className="flex flex-col items-center gap-0.5 font-display text-foreground">
              <p className="text-sm text-muted-foreground">
                {outcome.dice.join(" + ")} {signed(outcome.bonus)}
                {request.ability ? ` · ${request.ability}` : ""}
              </p>
              <p className="text-4xl tabular-nums text-rpg">= {outcome.total}</p>
              <p
                className={`pt-1 text-sm tracking-[0.2em] ${
                  outcome.success ? "text-rpg" : "text-destructive"
                }`}
              >
                {outcomeLabel(outcome)}
              </p>
              <p className="text-[11px] tracking-normal text-muted-foreground">
                Difficulté {outcome.threshold}
                {outcome.manual ? " · dés physiques" : " · dés virtuels"}
              </p>
            </div>
            <button type="button" onClick={() => onResolved(outcome)} className="rpg-button">
              <span className="font-display tracking-wide">Poursuivre le récit</span>
            </button>
          </div>
        )}

        {phase !== "input" && error && <p className="pt-2 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
