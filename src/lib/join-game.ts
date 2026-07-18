import { supabase } from "@/integrations/supabase/client";

export async function joinGameByCode(params: {
  code: string;
  displayName: string;
  deviceId: string;
}): Promise<{ inviteCode: string } | { error: string }> {
  const code = params.code.trim().toUpperCase();
  if (!code) return { error: "Code invalide." };
  if (!params.displayName.trim()) return { error: "Pseudo obligatoire." };

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, invite_code")
    .eq("invite_code", code)
    .maybeSingle();
  if (gameError) return { error: gameError.message };
  if (!game) return { error: "Aucune partie trouvée avec ce code." };

  const { error: upsertError } = await supabase
    .from("participants")
    .upsert(
      {
        game_id: game.id,
        device_id: params.deviceId,
        display_name: params.displayName.trim(),
        is_gm: false,
        status: "connected",
      },
      { onConflict: "game_id,device_id" },
    );
  if (upsertError) return { error: upsertError.message };
  return { inviteCode: game.invite_code as string };
}