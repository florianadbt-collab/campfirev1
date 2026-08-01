import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Prototype identity: the pseudo IS the login.
 * - existing pseudo  -> reconnect to that account
 * - unknown pseudo   -> create the account
 * No password is ever exposed to the client: we return a Supabase session.
 */
export const resolvePseudo = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ pseudo: z.string().trim().min(1).max(32) }).parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pseudo = data.pseudo.trim();
    const key = pseudo.toLowerCase();

    // Deterministic, server-only credentials derived from the pseudo.
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`campfire:${key}`));
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const email = `u${hex.slice(0, 24)}@campfire.local`;
    const password = `cf_${hex.slice(24, 64)}`;

    // Does a profile already use this pseudo?
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .ilike("username", pseudo)
      .maybeSingle();

    if (existing) {
      // Make sure the account can be signed into with the derived credentials.
      await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        email,
        password,
        email_confirm: true,
        user_metadata: { username: existing.username, pseudo_set: true },
      });
    } else {
      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: pseudo, pseudo_set: true },
      });
      if (createErr) throw createErr;
    }

    const authClient = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !signIn.session) throw signInErr ?? new Error("Connexion impossible");

    const userId = signIn.user!.id;
    // Ensure the profile carries the pseudo.
    await supabaseAdmin.from("profiles").upsert({ id: userId, username: existing?.username ?? pseudo });

    return {
      userId,
      pseudo: existing?.username ?? pseudo,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
