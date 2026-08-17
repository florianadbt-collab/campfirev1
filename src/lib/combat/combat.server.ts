import type { SupabaseClient } from "@supabase/supabase-js";
import type { CombatBlock, CombatStatus } from "@/lib/ai/types";
import { healthLabel, isCombatOver, type Combat, type CombatEnemy } from "./combat";

type Client = SupabaseClient<any, "public", any>;
type Snapshot = { combat: Combat | null; enemies: CombatEnemy[] };

function toCombat(row: Record<string, unknown> | null): Combat | null {
  if (!row) return null;
  return {
    id: String(row["id"]),
    campaign_id: String(row["campaign_id"]),
    status: String(row["status"]) as CombatStatus,
    round: Number(row["round"] ?? 1),
    turn_index: Number(row["turn_index"] ?? 0),
    initiative: Array.isArray(row["initiative"]) ? (row["initiative"] as string[]) : [],
    active_participant: (row["active_participant"] as string | null) ?? null,
  };
}

async function enemiesOf(supabase: Client, combatId: string): Promise<CombatEnemy[]> {
  const { data } = await supabase
    .from("combat_enemies")
    .select("id,name,level,max_hp,hp,status_label,is_defeated,sort_order")
    .eq("combat_id", combatId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as CombatEnemy[];
}

/** Combat actif de la campagne, s'il y en a un. */
export async function readCombat(supabase: Client, campaignId: string): Promise<Snapshot> {
  const { data } = await supabase
    .from("combats")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const combat = toCombat(data as Record<string, unknown> | null);
  if (!combat) return { combat: null, enemies: [] };
  return { combat, enemies: await enemiesOf(supabase, combat.id) };
}

/**
 * Écrit l'état de combat : création, mise à jour des PV/statuts, clôture.
 * Les valeurs venant de l'IA sont bornées avant persistance.
 */
export async function applyCombatBlock(
  supabase: Client,
  campaignId: string,
  block: CombatBlock | null,
): Promise<Snapshot> {
  const current = await readCombat(supabase, campaignId);

  // Aucun combat proposé : on clôt un éventuel combat en cours.
  if (!block || !block.active || isCombatOver(block.status)) {
    if (current.combat) {
      await supabase
        .from("combats")
        .update({
          status: block && isCombatOver(block.status) ? block.status : "interrupted",
          ended_at: new Date().toISOString(),
          active_participant: null,
        })
        .eq("id", current.combat.id);
    }
    return { combat: null, enemies: [] };
  }

  let combatId = current.combat?.id ?? null;
  if (!combatId) {
    const { data, error } = await supabase
      .from("combats")
      .insert({ campaign_id: campaignId, status: "active", round: block.round })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    combatId = String((data as Record<string, unknown>)["id"]);
  } else {
    await supabase.from("combats").update({ round: block.round }).eq("id", combatId);
  }

  const existing = await enemiesOf(supabase, combatId);
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));
  const seen = new Set<string>();

  for (const [index, enemy] of block.enemies.entries()) {
    const maxHp = Math.max(1, Math.min(999, Math.round(Number(enemy.max_hp) || 10)));
    const hp = Math.max(0, Math.min(maxHp, Math.round(Number(enemy.hp) || 0)));
    const level = Math.max(1, Math.min(30, Math.round(Number(enemy.level) || 1)));
    const row = {
      campaign_id: campaignId,
      combat_id: combatId,
      name: enemy.name,
      level,
      max_hp: maxHp,
      hp,
      status_label: enemy.status || healthLabel(hp, maxHp),
      is_defeated: hp <= 0,
      sort_order: index,
    };
    const key = enemy.name.toLowerCase();
    seen.add(key);
    const known = byName.get(key);
    if (known) await supabase.from("combat_enemies").update(row).eq("id", known.id);
    else await supabase.from("combat_enemies").insert(row);
  }

  // Ennemis disparus du récit : retirés de la scène de combat.
  for (const enemy of existing) {
    if (!seen.has(enemy.name.toLowerCase())) {
      await supabase.from("combat_enemies").delete().eq("id", enemy.id);
    }
  }

  const { data: fresh } = await supabase.from("combats").select("*").eq("id", combatId).maybeSingle();
  return {
    combat: toCombat(fresh as Record<string, unknown> | null),
    enemies: await enemiesOf(supabase, combatId),
  };
}
