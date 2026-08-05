import { useState } from "react";
import { Dices, Hand, X } from "lucide-react";
import { rollFormula, type DiceRoll } from "@/lib/game/dice";

export type DiceRequest = { formula: string; threshold: number; reason: string; ability?: string };

export type DiceOutcome = DiceRoll & {
  threshold: number;
  success: boolean;
  manual: boolean;
  critical: "success" | "failure" | null;
};

/** Réussite / échec critique : uniquement sur un d20 unique. */
function criticalOf(formula: string, dice: number[]): "success" | "failure" | null {
  if (!/d\s*20/i.test(formula) || dice.length !== 1) return null;
  if (dice[0] === 20) return "success";
  if (dice[0] === 1) return "failure";
  return null;
}

function outcomeLabel(o: DiceOutcome) {
  if (o.critical === "success") return "Réussite critique";
  if (o.critical === "failure") return "Échec critique";
  return o.success ? "Réussite" : "Échec";
}

/** Choix « vrais dés » ou « lancer dans Campfire », avec animation puis détail du jet. */
export function DiceRollerDialog({
  request,
  onResolved,
  onCancel,
}: {
  request: DiceRequest;
  onResolved: (outcome: DiceOutcome) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"choice" | "manual" | "rolling" | "result">("choice");
  const [manualValue, setManualValue] = useState("");
  const [outcome, setOutcome] = useState<DiceOutcome | null>(null);

  function finish(o: DiceOutcome) {
    setOutcome(o);
    setMode("result");
  }

  function rollHere() {
    setMode("rolling");
    window.setTimeout(() => {
      const r = rollFormula(request.formula);
      finish({
        ...r,
        threshold: request.threshold,
        success: r.total >= request.threshold,
        manual: false,
        critical: criticalOf(request.formula, r.dice),
      });
    }, 900);
  }

  function submitManual() {
    const total = Number(manualValue);
    if (!Number.isFinite(total)) return;
    finish({
      formula: request.formula,
      dice: [total],
      bonus: 0,
      total,
      threshold: request.threshold,
      success: total >= request.threshold,
      manual: true,
      critical: criticalOf(request.formula, [total]),
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/80 p-4 backdrop-blur sm:place-items-center">
      <div className="w-full max-w-sm rounded-3xl border border-rpg/30 bg-card p-5">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg tracking-wide text-foreground">Test requis</h2>
            <p className="text-xs text-muted-foreground">
              {request.reason} · {request.formula} · seuil {request.threshold}
              {request.ability ? ` · ${request.ability}` : ""}
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

        {mode === "choice" && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="flex items-center gap-3 rounded-2xl border border-rpg/30 bg-secondary px-4 py-3 text-left"
            >
              <Hand className="h-5 w-5 shrink-0 text-rpg" />
              <span className="min-w-0">
                <span className="block font-display tracking-wide text-foreground">Utiliser mes vrais dés</span>
                <span className="block text-[11px] text-muted-foreground">Vous saisirez le résultat obtenu.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={rollHere}
              className="flex items-center gap-3 rounded-2xl border border-rpg/40 bg-rpg/10 px-4 py-3 text-left"
            >
              <Dices className="h-5 w-5 shrink-0 text-rpg" />
              <span className="min-w-0">
                <span className="block font-display tracking-wide text-foreground">Lancer dans Campfire</span>
                <span className="block text-[11px] text-muted-foreground">Jet automatique et détaillé.</span>
              </span>
            </button>
          </div>
        )}

        {mode === "manual" && (
          <div className="flex flex-col gap-3">
            <label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="dice-manual">
              Quel résultat avez-vous obtenu ? ({request.formula})
            </label>
            <input
              id="dice-manual"
              className="rpg-input"
              inputMode="numeric"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="Ex : 14"
            />
            <button type="button" onClick={submitManual} disabled={!manualValue} className="rpg-button disabled:opacity-50">
              <span className="font-display tracking-wide">Valider</span>
            </button>
          </div>
        )}

        {mode === "rolling" && (
          <div className="grid place-items-center gap-3 py-8">
            <Dices className="h-12 w-12 animate-spin text-rpg" />
            <p className="text-sm text-muted-foreground">Les dés roulent…</p>
          </div>
        )}

        {mode === "result" && outcome && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Row label="Dé lancé" value={outcome.formula} />
              <Row label="Résultat brut" value={outcome.dice.join(" + ")} />
              <Row
                label="Modificateurs"
                value={outcome.bonus >= 0 ? `+${outcome.bonus}` : String(outcome.bonus)}
              />
              <Row label="Total" value={String(outcome.total)} />
              <Row label="Difficulté" value={String(outcome.threshold)} />
              <Row label="Issue" value={outcomeLabel(outcome)} />
            </dl>
            <p className="text-[11px] text-muted-foreground">
              {outcome.total} contre une difficulté de {outcome.threshold} :{" "}
              {outcome.success ? "le test passe." : "le test échoue."}
            </p>
            <button type="button" onClick={() => onResolved(outcome)} className="rpg-button">
              <span className="font-display tracking-wide">Poursuivre le récit</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rpg/20 bg-secondary px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate font-display text-base text-foreground">{value}</dd>
    </div>
  );
}