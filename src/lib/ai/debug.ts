/**
 * Mode Debug IA — désactivable d'un seul endroit.
 * Activation : localStorage.setItem("campfire_ai_debug", "1") puis rechargement,
 * ou AI_DEBUG_DEFAULT = true ci-dessous.
 */
export const AI_DEBUG_DEFAULT = false;
const KEY = "campfire_ai_debug";

export function isAIDebugEnabled(): boolean {
  if (typeof window === "undefined") return AI_DEBUG_DEFAULT;
  const stored = window.localStorage.getItem(KEY);
  return stored === null ? AI_DEBUG_DEFAULT : stored === "1";
}

export function setAIDebugEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, enabled ? "1" : "0");
}
