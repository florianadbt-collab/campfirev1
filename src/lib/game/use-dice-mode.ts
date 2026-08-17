import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiceMode } from "./dice-contract";

/**
 * Préférence personnelle du joueur (profil) : dés virtuels ou dés physiques.
 * Campfire la consulte au moment du jet, sans jamais reposer la question.
 */
export function diceModeQuery() {
  return {
    queryKey: ["dice-mode", "me"],
    queryFn: async (): Promise<DiceMode> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return "virtual";
      const { data } = await supabase.from("profiles").select("dice_mode").eq("id", userId).maybeSingle();
      return data?.dice_mode === "physical" ? "physical" : "virtual";
    },
    staleTime: 60_000,
  };
}

export function useDiceMode(): DiceMode {
  return useQuery(diceModeQuery()).data ?? "virtual";
}
