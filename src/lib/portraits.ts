import { supabase } from "@/integrations/supabase/client";

const BUCKET = "portraits";
const TEN_YEARS = 60 * 60 * 24 * 3650;

/** Téléverse un portrait et renvoie une URL signée longue durée. */
export async function uploadPortrait(file: File, userId: string): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, TEN_YEARS);
  if (sErr || !data?.signedUrl) throw sErr ?? new Error("Portrait inaccessible");
  return data.signedUrl;
}
