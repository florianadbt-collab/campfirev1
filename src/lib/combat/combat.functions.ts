import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CombatBlock } from "@/lib/ai/types";
import type { Combat, CombatEnemy } from "./combat";

export type CombatSnapshot = { combat: Combat | null; enemies: CombatEnemy[] };

/**
 * Applique l'état de combat proposé par Gemini.
 * Campfire reste la source de vérité : les valeurs sont bornées et persistées ici.
 */
export const syncCombat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string; block: CombatBlock | null }) => data)
  .handler(async ({ data, context }): Promise<CombatSnapshot> => {
    const { applyCombatBlock } = await import("./combat.server");
    return applyCombatBlock(context.supabase, data.campaignId, data.block);
  });

/** État public du combat en cours — identique pour tous les appareils. */
export const loadCombat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data, context }): Promise<CombatSnapshot> => {
    const { readCombat } = await import("./combat.server");
    return readCombat(context.supabase, data.campaignId);
  });
