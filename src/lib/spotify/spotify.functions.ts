import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ControlAction, DiagnosticStep, SpotifyStatus } from "./spotify.server";
import type { MusicCommand } from "./moods";

/** Chargé uniquement côté serveur (client secret + refresh tokens). */
const load = () => import("./spotify.server");

export const spotifyAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string; state: string }) => data)
  .handler(async ({ data }) => {
    const mod = await load();
    try {
      return {
        ok: true as const,
        url: mod.buildAuthorizeUrl(data.origin, data.state),
        redirectUri: mod.resolveRedirectUri(data.origin),
        message: "",
      };
    } catch (e) {
      return { ok: false as const, url: null, redirectUri: null, message: mod.describeError(e) };
    }
  });

export const spotifyExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string; origin: string }) => data)
  .handler(async ({ data, context }) => {
    const mod = await load();
    try {
      await mod.exchangeCode(context.userId, data.code, data.origin);
      return { ok: true as const, message: "Spotify connecté." };
    } catch (e) {
      return { ok: false as const, message: mod.describeError(e) };
    }
  });

export const spotifyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SpotifyStatus> => {
    const mod = await load();
    return mod.getStatus(context.userId);
  });

export const spotifyDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await load();
    await mod.disconnect(context.userId);
    return { ok: true as const };
  });

/** ▶ Tester Spotify — diagnostic complet, déclenché uniquement par le MJ. */
export const spotifyTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; steps: DiagnosticStep[] }> => {
    const mod = await load();
    try {
      return await mod.runDiagnostic(context.userId);
    } catch (e) {
      return { ok: false, steps: [{ label: "Diagnostic", ok: false, detail: mod.describeError(e) }] };
    }
  });

export const spotifySelectDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deviceId: string; deviceName?: string }) => data)
  .handler(async ({ data, context }) => {
    const mod = await load();
    await mod.selectDevice(context.userId, data.deviceId, data.deviceName ?? null);
    return { ok: true as const };
  });

export const spotifyControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { action: ControlAction; query?: string; volume?: number }) => data)
  .handler(async ({ data, context }) => {
    const mod = await load();
    return mod.control(context.userId, {
      action: data.action,
      ...(data.query ? { query: data.query } : {}),
      ...(typeof data.volume === "number" ? { volume: data.volume } : {}),
    });
  });

/** Appliqué par le moteur de jeu quand Gemini demande une transition d'ambiance. */
export const spotifyAmbiance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { command: MusicCommand }) => data)
  .handler(async ({ data, context }) => {
    const mod = await load();
    try {
      return await mod.applyMusicCommand(context.userId, data.command);
    } catch (e) {
      return { ok: false as const, message: mod.describeError(e), changed: false };
    }
  });
