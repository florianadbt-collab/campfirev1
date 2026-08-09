import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Music2, Pause, Play, RefreshCw, SkipForward, Volume2 } from "lucide-react";
import { PanelCard } from "@/components/game/panels";
import {
  spotifyAuthUrl,
  spotifyControl,
  spotifyDisconnect,
  spotifyExchange,
  spotifySelectDevice,
  spotifyStatus,
} from "@/lib/spotify/spotify.functions";
import { MOODS, MOOD_KEYS } from "@/lib/spotify/moods";

type Status = Awaited<ReturnType<typeof spotifyStatus>>;

/** 🎵 Spotify — section Immersion du MJ. Vraie intégration Web API, côté serveur. */
export function SpotifyPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stateRef = useRef<string>("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await spotifyStatus());
    } catch {
      setMessage("Statut Spotify indisponible.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const state = Math.random().toString(36).slice(2);
    stateRef.current = state;
    const popup = window.open("", "spotify-auth", "width=520,height=720");
    const res = await spotifyAuthUrl({ data: { origin: window.location.origin, state } });
    if (!res.ok || !res.url) {
      popup?.close();
      setMessage(res.message ?? "Spotify n'est pas configuré.");
      setBusy(false);
      return;
    }
    if (popup) popup.location.href = res.url;

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; code?: string; state?: string; error?: string };
      if (payload?.type !== "spotifyOAuthCallback") return;
      window.removeEventListener("message", onMessage);
      if (payload.error || !payload.code || payload.state !== stateRef.current) {
        setMessage("Autorisation Spotify refusée.");
        setBusy(false);
        return;
      }
      const out = await spotifyExchange({ data: { code: payload.code, origin: window.location.origin } });
      setMessage(out.message);
      await refresh();
      setBusy(false);
    };
    window.addEventListener("message", onMessage);
  }

  async function act(action: "play" | "pause" | "resume" | "next" | "volume", extra?: { query?: string; volume?: number }) {
    setBusy(true);
    const out = await spotifyControl({ data: { action, ...(extra ?? {}) } });
    setMessage(out.message);
    await refresh();
    setBusy(false);
  }

  const connected = status?.connected;

  return (
    <PanelCard title="🎵 Spotify">
      {!status?.configured && (
        <p className="text-xs text-destructive">Spotify n'est pas configuré côté serveur.</p>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
        />
        {connected ? `Connecté · ${status?.account ?? "compte Spotify"}` : "Non connecté"}
        {status?.product && status.product !== "premium" ? " · compte non Premium" : ""}
      </p>

      {connected && (
        <>
          <p className="pt-1 text-xs text-muted-foreground">
            Appareil : {status?.deviceName ?? "aucun appareil détecté"}
          </p>
          {status?.nowPlaying && (
            <p className="truncate pt-1 text-xs text-foreground">
              ♪ {status.nowPlaying.title} — {status.nowPlaying.artist}
              {status.nowPlaying.isPlaying ? "" : " (en pause)"}
            </p>
          )}
          {(status?.devices.length ?? 0) > 1 && (
            <select
              className="rpg-input mt-2 text-xs"
              value={status?.deviceId ?? ""}
              onChange={async (e) => {
                const d = status?.devices.find((x) => x.id === e.target.value);
                if (!d) return;
                await spotifySelectDevice({ data: { deviceId: d.id, deviceName: d.name } });
                await refresh();
              }}
            >
              {status?.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <IconBtn label="Lire" onClick={() => act("resume")} disabled={busy}>
              <Play className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Pause" onClick={() => act("pause")} disabled={busy}>
              <Pause className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Suivant" onClick={() => act("next")} disabled={busy}>
              <SkipForward className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="Actualiser" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
            </IconBtn>
            <Volume2 className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={status?.devices.find((d) => d.id === status?.deviceId)?.volume_percent ?? 50}
              onMouseUp={(e) => act("volume", { volume: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => act("volume", { volume: Number((e.target as HTMLInputElement).value) })}
              aria-label="Volume Spotify"
              className="min-w-0 flex-1 accent-[var(--rpg)]"
            />
          </div>

          <p className="pt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Ambiances</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {MOOD_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => act("play", { query: MOODS[k].query })}
                className={`rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-50 ${
                  status?.mood === k
                    ? "border-rpg/50 bg-rpg/10 text-rpg"
                    : "border-rpg/20 bg-secondary text-muted-foreground"
                }`}
              >
                {MOODS[k].label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2 pt-3">
        <button
          type="button"
          onClick={connect}
          disabled={busy || !status?.configured}
          className="flex items-center gap-1.5 rounded-full border border-rpg/40 bg-secondary px-3 py-1.5 text-[11px] text-rpg disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music2 className="h-3.5 w-3.5" />}
          {connected ? "Reconnecter Spotify" : "Connecter Spotify"}
        </button>
        {connected && (
          <button
            type="button"
            onClick={async () => {
              await spotifyDisconnect();
              setMessage("Spotify déconnecté.");
              await refresh();
            }}
            className="flex items-center gap-1.5 rounded-full border border-rpg/20 bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Déconnecter
          </button>
        )}
      </div>

      {(message || status?.error) && (
        <p className="pt-2 text-[11px] text-muted-foreground">{message ?? status?.error}</p>
      )}
    </PanelCard>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-full border border-rpg/30 bg-secondary p-2 text-rpg disabled:opacity-40"
    >
      {children}
    </button>
  );
}
