import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyMusicCommand,
  buildAuthorizeUrl,
  control,
  disconnect,
  exchangeCode,
  getStatus,
  resolveRedirectUri,
  selectDevice,
  describeError,
  type ControlAction,
} from "./spotify.server";
import type { MusicCommand } from "./moods";

export const spotifyAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string; state: string }) => data)
  .handler(async ({ data }) => {
    try {
      return {
        ok: true as const,
        url: buildAuthorizeUrl(data.origin, data.state),
        redirectUri: resolveRedirectUri(data.origin),
      };
    } catch (e) {
      return { ok: false as const, url: null, message: describeError(e) };
    }
  });

export const spotifyExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string; origin: string }) => data)
  .handler(async ({ data, context }) => {
    try {
      await exchangeCode(context.userId, data.code, data.origin);
      return { ok: true as const, message: "Spotify connecté." };
    } catch (e) {
      return { ok: false as const, message: describeError(e) };
    }
  });

export const spotifyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getStatus(context.userId));

export const spotifyDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await disconnect(context.userId);
    return { ok: true as const };
  });

export const spotifySelectDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deviceId: string; deviceName?: string }) => data)
  .handler(async ({ data, context }) => {
    await selectDevice(context.userId, data.deviceId, data.deviceName ?? null);
    return { ok: true as const };
  });

export const spotifyControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { action: ControlAction; query?: string; volume?: number }) => data)
  .handler(async ({ data, context }) =>
    control(context.userId, {
      action: data.action,
      ...(data.query ? { query: data.query } : {}),
      ...(typeof data.volume === "number" ? { volume: data.volume } : {}),
    }),
  );

/** Appliqué par le moteur de jeu quand Gemini demande une transition d'ambiance. */
export const spotifyAmbiance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { command: MusicCommand }) => data)
  .handler(async ({ data, context }) => {
    try {
      return await applyMusicCommand(context.userId, data.command);
    } catch (e) {
      return { ok: false as const, message: describeError(e) };
    }
  });
