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

  const { data: existing } = await supabase
    .from("participants")
    .select("id")
    .eq("game_id", game.id)
    .eq("device_id", params.deviceId)
    .maybeSingle();

  if (existing) {
    const { error: updateError } = await supabase
      .from("participants")
      .update({
        display_name: params.displayName.trim(),
        status: "connected",
      })
      .eq("id", existing.id);
    if (updateError) return { error: updateError.message };
  } else {
    const { error: insertError } = await supabase.from("participants").insert({
      game_id: game.id,
      device_id: params.deviceId,
      display_name: params.displayName.trim(),
      is_gm: false,
      status: "connected",
    });
    if (insertError) return { error: insertError.message };
  }
  return { inviteCode: game.invite_code as string };
}