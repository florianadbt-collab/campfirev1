import { useEffect, useState } from "react";
import { isAIDebugEnabled, setAIDebugEnabled } from "@/lib/ai/debug";
import type { AIResult } from "@/lib/ai/types";

/** Panneau de développement : prompt, réponse brute, temps de réponse, erreurs. */
export function AIDebugPanel({ result }: { result: AIResult | null }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setEnabled(isAIDebugEnabled()), []);
  if (!enabled || !result) return null;

  const d = result.debug;
  return (
    <div className="rounded-2xl border border-rpg/30 bg-card/60 p-3 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen((v) => !v)} className="font-display tracking-wide text-rpg">
          Debug IA · {result.durationMs} ms · {result.ok ? "ok" : result.errorCode}
        </button>
        <button
          type="button"
          onClick={() => {
            setAIDebugEnabled(false);
            setEnabled(false);
          }}
          className="underline"
        >
          désactiver
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {result.errorMessage && <p className="text-destructive">{result.errorMessage}</p>}
          <details open>
            <summary>Prompt</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words">{d?.prompt ?? "—"}</pre>
          </details>
          <details>
            <summary>Réponse brute</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words">{d?.raw ?? "—"}</pre>
          </details>
          <p>Modèle : {d?.model ?? "—"}</p>
        </div>
      )}
    </div>
  );
}
