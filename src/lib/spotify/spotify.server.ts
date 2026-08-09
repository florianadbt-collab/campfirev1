/**
 * Module Spotify — 100% serveur.
 * Aucune de ces fonctions ne doit être importée depuis un composant :
 * elles manipulent le client secret et les refresh tokens.
 */
import { MOODS, normalizeMood, type MusicCommand, type MusicMood } from "./moods";

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const CALLBACK_PATH = "/api/public/spotify/callback";
export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-private",
];
/** Délai minimum entre deux changements d'ambiance (anti-spam). */
const COOLDOWN_MS = 60_000;

function creds() {
  const clientId = process.env["SPOTIFY_CLIENT_ID"];
  const clientSecret = process.env["SPOTIFY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("spotify_not_configured");
  return { clientId, clientSecret };
}

/** N'accepte que les origines Campfire (préversion, production, local). */
export function resolveRedirectUri(origin: string | undefined): string {
  const fallback = "https://campfirev1.lovable.app";
  let url: URL;
  try {
    url = new URL(origin ?? fallback);
  } catch {
    url = new URL(fallback);
  }
  const ok =
    url.hostname.endsWith(".lovable.app") ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1";
  return `${ok ? url.origin : fallback}${CALLBACK_PATH}`;
}

export function buildAuthorizeUrl(origin: string | undefined, state: string) {
  const { clientId } = creds();
  const redirectUri = resolveRedirectUri(origin);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
    show_dialog: "false",
  });
  console.log("[spotify] authorize url built", { redirectUri });
  return `${ACCOUNTS}/authorize?${params.toString()}`;
}

type TokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function tokenRequest(body: URLSearchParams): Promise<TokenPayload> {
  const { clientId, clientSecret } = creds();
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[spotify] token request failed", { status: res.status, error: json["error"] });
    throw new Error(String(json["error"] ?? `token_${res.status}`));
  }
  return json as unknown as TokenPayload;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface StoredConnection {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  display_name: string | null;
  account_id: string | null;
  product: string | null;
  device_id: string | null;
  device_name: string | null;
  last_mood: string | null;
  last_change_at: string | null;
  needs_reconnect: boolean;
}

async function loadConnection(userId: string): Promise<StoredConnection | null> {
  const db = await admin();
  const { data, error } = await db
    .from("spotify_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[spotify] load connection failed", error.message);
    return null;
  }
  return (data as StoredConnection | null) ?? null;
}

async function saveConnection(userId: string, patch: Record<string, unknown>) {
  const db = await admin();
  const { error } = await db
    .from("spotify_connections")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) console.error("[spotify] save connection failed", error.message);
}

/** Échange le code d'autorisation contre des tokens et enregistre la connexion. */
export async function exchangeCode(userId: string, code: string, origin: string | undefined) {
  const payload = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: resolveRedirectUri(origin),
    }),
  );
  const profile = await spotifyFetch<Record<string, unknown>>(payload.access_token, "/me");
  await saveConnection(userId, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? "",
    expires_at: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
    scope: payload.scope ?? "",
    display_name: (profile?.["display_name"] as string) ?? null,
    account_id: (profile?.["id"] as string) ?? null,
    product: (profile?.["product"] as string) ?? null,
    needs_reconnect: false,
  });
  console.log("[spotify] connected", { userId, product: profile?.["product"] });
  return { ok: true as const };
}

/** Renvoie un access token valide, en le renouvelant si nécessaire. */
async function validAccessToken(userId: string): Promise<string | null> {
  const conn = await loadConnection(userId);
  if (!conn || conn.needs_reconnect) return null;
  const expiresIn = new Date(conn.expires_at).getTime() - Date.now();
  if (expiresIn > 60_000) return conn.access_token;
  if (!conn.refresh_token) {
    await saveConnection(userId, { needs_reconnect: true });
    return null;
  }
  try {
    const payload = await tokenRequest(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
    );
    await saveConnection(userId, {
      access_token: payload.access_token,
      expires_at: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
      ...(payload.refresh_token ? { refresh_token: payload.refresh_token } : {}),
      needs_reconnect: false,
    });
    console.log("[spotify] access token refreshed", { userId });
    return payload.access_token;
  } catch (e) {
    console.error("[spotify] refresh failed", (e as Error).message);
    await saveConnection(userId, { needs_reconnect: true });
    return null;
  }
}

async function spotifyFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) {
    console.error("[spotify] api error", { path, status: res.status, body: text.slice(0, 200) });
    throw new Error(`spotify_${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : null;
}

export type SpotifyDevice = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
};

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  account: string | null;
  product: string | null;
  premium: boolean;
  devices: SpotifyDevice[];
  deviceId: string | null;
  deviceName: string | null;
  nowPlaying: { title: string; artist: string; isPlaying: boolean } | null;
  mood: string | null;
  error: string | null;
}

export async function getStatus(userId: string): Promise<SpotifyStatus> {
  const base: SpotifyStatus = {
    configured: Boolean(process.env["SPOTIFY_CLIENT_ID"] && process.env["SPOTIFY_CLIENT_SECRET"]),
    connected: false,
    needsReconnect: false,
    account: null,
    product: null,
    premium: false,
    devices: [],
    deviceId: null,
    deviceName: null,
    nowPlaying: null,
    mood: null,
    error: null,
  };
  const conn = await loadConnection(userId);
  if (!conn) return base;
  base.account = conn.display_name;
  base.product = conn.product;
  base.premium = conn.product === "premium";
  base.mood = conn.last_mood;
  base.deviceId = conn.device_id;
  base.deviceName = conn.device_name;
  base.needsReconnect = conn.needs_reconnect;
  const token = await validAccessToken(userId);
  if (!token) {
    base.needsReconnect = true;
    base.error = "Session Spotify expirée, reconnecte ton compte.";
    return base;
  }
  base.connected = true;
  try {
    const devicesRes = await spotifyFetch<{ devices: SpotifyDevice[] }>(token, "/me/player/devices");
    base.devices = devicesRes?.devices ?? [];
    const active = base.devices.find((d) => d.is_active);
    if (!base.deviceId || !base.devices.some((d) => d.id === base.deviceId)) {
      base.deviceId = active?.id ?? base.devices[0]?.id ?? null;
      base.deviceName = active?.name ?? base.devices[0]?.name ?? null;
      if (base.deviceId) {
        await saveConnection(userId, { device_id: base.deviceId, device_name: base.deviceName });
      }
    }
    const player = await spotifyFetch<Record<string, unknown>>(token, "/me/player");
    const item = player?.["item"] as Record<string, unknown> | undefined;
    if (item) {
      const artists = (item["artists"] as { name: string }[] | undefined) ?? [];
      base.nowPlaying = {
        title: String(item["name"] ?? ""),
        artist: artists.map((a) => a.name).join(", "),
        isPlaying: Boolean(player?.["is_playing"]),
      };
    }
  } catch (e) {
    base.error = describeError(e);
  }
  return base;
}

export function describeError(e: unknown): string {
  const msg = (e as Error)?.message ?? "";
  if (msg === "spotify_403") return "Spotify Premium requis pour contrôler la lecture.";
  if (msg === "spotify_404") return "Aucun appareil Spotify actif. Lance Spotify puis réessaie.";
  if (msg === "spotify_401") return "Session Spotify expirée, reconnecte ton compte.";
  if (msg === "spotify_429") return "Spotify limite temporairement les requêtes.";
  if (msg === "spotify_not_configured") return "Spotify n'est pas configuré côté serveur.";
  return "Spotify est momentanément indisponible.";
}

export async function disconnect(userId: string) {
  const db = await admin();
  await db.from("spotify_connections").delete().eq("user_id", userId);
  console.log("[spotify] disconnected", { userId });
}

export async function selectDevice(userId: string, deviceId: string, deviceName: string | null) {
  await saveConnection(userId, { device_id: deviceId, device_name: deviceName });
  console.log("[spotify] device selected", { userId, deviceName });
}

async function targetDevice(userId: string, token: string): Promise<string | null> {
  const conn = await loadConnection(userId);
  const res = await spotifyFetch<{ devices: SpotifyDevice[] }>(token, "/me/player/devices");
  const devices = res?.devices ?? [];
  const stored = devices.find((d) => d.id === conn?.device_id);
  const chosen = stored ?? devices.find((d) => d.is_active) ?? devices[0];
  if (chosen && chosen.id !== conn?.device_id) {
    await saveConnection(userId, { device_id: chosen.id, device_name: chosen.name });
  }
  return chosen?.id ?? null;
}

export async function searchContext(token: string, query: string) {
  const params = new URLSearchParams({ q: query, type: "playlist,track", limit: "5", market: "FR" });
  const res = await spotifyFetch<Record<string, any>>(token, `/search?${params.toString()}`);
  const playlist = (res?.["playlists"]?.items ?? []).filter(Boolean)[0];
  if (playlist?.uri) return { uri: playlist.uri as string, kind: "playlist" as const, name: String(playlist.name) };
  const track = (res?.["tracks"]?.items ?? []).filter(Boolean)[0];
  if (track?.uri) return { uri: track.uri as string, kind: "track" as const, name: String(track.name) };
  return null;
}

export type ControlAction = "play" | "pause" | "resume" | "next" | "volume" | "search";

export interface ControlInput {
  action: ControlAction;
  query?: string;
  volume?: number;
}

export interface ControlOutcome {
  ok: boolean;
  message: string;
  changed?: boolean;
}

export async function control(userId: string, input: ControlInput): Promise<ControlOutcome> {
  const token = await validAccessToken(userId);
  if (!token) return { ok: false, message: "Spotify n'est pas connecté." };
  try {
    const device = await targetDevice(userId, token);
    if (!device && input.action !== "pause") {
      return { ok: false, message: "Aucun appareil Spotify disponible. Ouvre Spotify puis réessaie." };
    }
    const q = device ? `?device_id=${device}` : "";
    switch (input.action) {
      case "pause":
        await spotifyFetch(token, `/me/player/pause${q}`, { method: "PUT" });
        console.log("[spotify] playback paused", { userId });
        return { ok: true, message: "Lecture en pause." };
      case "resume":
        await spotifyFetch(token, `/me/player/play${q}`, { method: "PUT" });
        console.log("[spotify] playback resumed", { userId });
        return { ok: true, message: "Lecture reprise." };
      case "next":
        await spotifyFetch(token, `/me/player/next${q}`, { method: "POST" });
        return { ok: true, message: "Morceau suivant." };
      case "volume": {
        const vol = Math.max(0, Math.min(100, Math.round(input.volume ?? 50)));
        await spotifyFetch(token, `/me/player/volume?volume_percent=${vol}${device ? `&device_id=${device}` : ""}`, {
          method: "PUT",
        });
        return { ok: true, message: `Volume à ${vol}%.` };
      }
      case "play":
      case "search":
      default: {
        const query = input.query?.trim();
        if (!query) return { ok: false, message: "Aucune ambiance demandée." };
        const found = await searchContext(token, query);
        if (!found) {
          console.log("[spotify] search empty", { query });
          return { ok: false, message: "Aucun résultat musical trouvé." };
        }
        const body =
          found.kind === "playlist" ? { context_uri: found.uri } : { uris: [found.uri] };
        await spotifyFetch(token, `/me/player/play${q}`, { method: "PUT", body: JSON.stringify(body) });
        console.log("[spotify] playback started", { userId, kind: found.kind, query });
        return { ok: true, message: `Lecture : ${found.name}`, changed: true };
      }
    }
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}

/**
 * Applique une commande musicale produite par le moteur de jeu.
 * Ne change rien si l'ambiance est identique ou si le cooldown n'est pas écoulé.
 */
export async function applyMusicCommand(
  userId: string,
  command: MusicCommand,
): Promise<ControlOutcome & { mood?: MusicMood }> {
  const mood = normalizeMood(command.mood);
  if (!mood) return { ok: false, message: "Ambiance inconnue." };
  const conn = await loadConnection(userId);
  if (!conn) return { ok: false, message: "Spotify n'est pas connecté." };
  if (command.action === "keep") return { ok: true, message: "Ambiance conservée.", mood };
  if (command.action === "stop") {
    const out = await control(userId, { action: "pause" });
    return { ...out, mood };
  }
  const since = conn.last_change_at ? Date.now() - new Date(conn.last_change_at).getTime() : Infinity;
  if (conn.last_mood === mood) {
    return { ok: true, message: "Ambiance déjà en cours.", changed: false, mood };
  }
  if (since < COOLDOWN_MS) {
    console.log("[spotify] cooldown active, change skipped", { userId, mood });
    return { ok: true, message: "Changement d'ambiance différé (cooldown).", changed: false, mood };
  }
  const preset = MOODS[mood];
  const query = command.search_query?.trim() || `${command.genre ? `${command.genre} ` : ""}${preset.query}`;
  const out = await control(userId, { action: "play", query });
  if (out.ok) {
    await saveConnection(userId, { last_mood: mood, last_change_at: new Date().toISOString() });
    console.log("[spotify] ambience changed", { userId, mood });
  }
  return { ...out, mood };
}
