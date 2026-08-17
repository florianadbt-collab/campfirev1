import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DiceOutcomePayload, ResolveDiceInput } from "./dice-contract";

/**
 * Unique résolution de jet de Campfire (attaques, compétences, attributs,
 * social, exploration...). Le résultat est décidé et validé côté serveur,
 * puis enregistré dans `dice_rolls` pour être visible par toute la table.
 */
export const resolveDice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ResolveDiceInput) => data)
  .handler(async ({ data, context }): Promise<DiceOutcomePayload> => {
    const { serverRoll, validatePhysicalRoll } = await import("./dice.server");
    const { criticalOf } = await import("./dice-contract");

    let roll;
    if (data.mode === "physical") {
      const check = validatePhysicalRoll(data.formula, data.values ?? []);
      if (!check.ok) return { ok: false, message: check.message };
      roll = check.roll;
    } else {
      roll = serverRoll(data.formula);
    }

    const outcome: DiceOutcomePayload = {
      ok: true,
      formula: roll.formula,
      dice: roll.dice,
      bonus: roll.bonus,
      total: roll.total,
      threshold: data.threshold,
      success: roll.total >= data.threshold,
      manual: data.mode === "physical",
      critical: criticalOf(roll.formula, roll.dice),
      ...(data.ability ? { ability: data.ability } : {}),
    };

    // Jet lié à une partie : il devient une information publique de la table.
    if (data.campaignId) {
      await context.supabase.from("dice_rolls").insert({
        campaign_id: data.campaignId,
        user_id: context.userId,
        formula: roll.formula,
        result: roll.total,
        detail: {
          dice: roll.dice,
          bonus: roll.bonus,
          threshold: data.threshold,
          success: outcome.success,
          critical: outcome.critical,
          manual: outcome.manual,
          reason: data.reason ?? "",
          ability: data.ability ?? "",
        },
      });
    }

    return outcome;
  });
