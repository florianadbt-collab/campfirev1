import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ConditionRow, MemoryRow, NpcRelationRow, NpcRow, WorldTime } from "./world";
import { DEFAULT_WORLD_TIME } from "./world";

export interface WorldView {
  time: WorldTime;
  memory: MemoryRow[];
  npcs: NpcRow[];
  relations: NpcRelationRow[];
  conditions: ConditionRow[];
}

const EMPTY: WorldView = {
  time: DEFAULT_WORLD_TIME,
  memory: [],
  npcs: [],
  relations: [],
  conditions: [],
};

/**
 * Mémoire du monde côté joueur.
 * Les règles d'accès sont appliquées par la base : un joueur ne reçoit
 * que les souvenirs publics et les siens ; le MJ reçoit aussi les secrets.
 */
export function useWorld(campaignId: string | undefined) {
  const [world, setWorld] = useState<WorldView>(EMPTY);

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    const [campaign, memory, npcs, relations, conditions] = await Promise.all([
      supabase.from("campaigns").select("world_state").eq("id", campaignId).maybeSingle(),
      supabase
        .from("campaign_memory")
        .select("id, kind, content, visibility, importance, campaign_day, user_id, metadata, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("campaign_npcs").select("*").eq("campaign_id", campaignId),
      supabase.from("npc_relations").select("*").eq("campaign_id", campaignId),
      supabase
        .from("character_conditions")
        .select("id, user_id, label, severity, is_active")
        .eq("campaign_id", campaignId)
        .eq("is_active", true),
    ]);
    const state = (campaign.data?.world_state ?? {}) as Partial<WorldTime>;
    setWorld({
      time: {
        day: Number(state.day ?? 1) || 1,
        time_of_day: String(state.time_of_day ?? ""),
        weather: String(state.weather ?? ""),
        location: String(state.location ?? ""),
      },
      memory: ((memory.data ?? []) as unknown as MemoryRow[]),
      npcs: ((npcs.data ?? []) as unknown as NpcRow[]),
      relations: ((relations.data ?? []) as unknown as NpcRelationRow[]),
      conditions: ((conditions.data ?? []) as unknown as ConditionRow[]),
    });
  }, [campaignId]);

  useEffect(() => {
    void refresh();
    if (!campaignId) return;
    const channel = supabase
      .channel(`world-${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_memory" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_npcs" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_relations" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_conditions" }, () => void refresh())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [campaignId, refresh]);

  return { world, refresh };
}
