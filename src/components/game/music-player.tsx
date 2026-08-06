import { useCallback, useEffect, useRef, useState } from "react";
import { Music4, Pause, Play, SkipForward, Volume2, Wand2, VolumeX } from "lucide-react";

/** Playlists d'ambiance : Gemini choisit automatiquement via music_query. */
export const AMBIENCE_TRACKS = [
  {
    id: "tavern",
    label: "Taverne & repos",
    match: /(tavern|inn|village|market|calm|rest|camp|cozy|town)/i,
    url: "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3",
  },
  {
    id: "exploration",
    label: "Exploration",
    match: /(forest|wild|nature|travel|road|explor|journey|ruin|mystery)/i,
    url: "https://cdn.pixabay.com/audio/2021/11/25/audio_00fa5593f3.mp3",
  },
  {
    id: "tension",
    label: "Tension & combat",
    match: /(battle|combat|fight|danger|chase|tense|dark|horror|threat)/i,
    url: "https://cdn.pixabay.com/audio/2022/10/30/audio_347111d3b6.mp3",
  },
  {
    id: "repos",
    label: "Nuit paisible",
    match: /(night|sleep|dream|peace|sad|memory|melanchol)/i,
    url: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1bab.mp3",
  },
];

function pickTrack(query: string) {
  const found = AMBIENCE_TRACKS.findIndex((t) => t.match.test(query));
  return found === -1 ? 0 : found;
}

type Mode = "auto" | "manuel" | "off";

/**
 * Ambiance sonore : suit automatiquement la scène décrite par Gemini,
 * avec fondu entre deux playlists. Le MJ peut forcer ou couper.
 */
export function MusicPlayer({ suggestion, canControl }: { suggestion?: string; canControl: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [mode, setMode] = useState<Mode>("auto");
  const track = AMBIENCE_TRACKS[index]!;

  /** Fondu progressif jusqu'au volume cible. */
  const fadeTo = useCallback((target: number, done?: () => void) => {
    const el = audioRef.current;
    if (!el) return;
    if (fadeRef.current) window.clearInterval(fadeRef.current);
    fadeRef.current = window.setInterval(() => {
      const step = target > el.volume ? 0.04 : -0.04;
      const next = el.volume + step;
      if ((step > 0 && next >= target) || (step < 0 && next <= target)) {
        el.volume = Math.max(0, Math.min(1, target));
        if (fadeRef.current) window.clearInterval(fadeRef.current);
        fadeRef.current = null;
        done?.();
      } else {
        el.volume = Math.max(0, Math.min(1, next));
      }
    }, 60);
  }, []);

  useEffect(() => () => {
    if (fadeRef.current) window.clearInterval(fadeRef.current);
  }, []);

  // Gemini change d'ambiance -> nouvelle playlist, en fondu.
  useEffect(() => {
    if (mode !== "auto" || !suggestion) return;
    const next = pickTrack(suggestion);
    setIndex((current) => {
      if (current === next) return current;
      fadeTo(0, () => setPlaying(false));
      return next;
    });
  }, [suggestion, mode, fadeTo]);

  // Relance automatique après changement de piste.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || mode === "off") return;
    if (mode === "auto" && !playing && suggestion) {
      el.volume = 0;
      el.play()
        .then(() => {
          setPlaying(true);
          fadeTo(volume);
        })
        .catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, mode, suggestion]);

  useEffect(() => {
    if (audioRef.current && !fadeRef.current) audioRef.current.volume = volume;
  }, [volume, index]);

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      fadeTo(0, () => {
        el.pause();
        setPlaying(false);
      });
      return;
    }
    try {
      el.volume = 0;
      await el.play();
      setPlaying(true);
      fadeTo(volume);
    } catch {
      setPlaying(false);
    }
  }

  function next() {
    setMode("manuel");
    setPlaying(false);
    audioRef.current?.pause();
    setIndex((i) => (i + 1) % AMBIENCE_TRACKS.length);
  }

  function changeMode(m: Mode) {
    setMode(m);
    if (m === "off") {
      audioRef.current?.pause();
      setPlaying(false);
    }
  }

  return (
    <section className="rounded-2xl border border-rpg/25 bg-card/70 p-3">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 pb-2">
        <Music4 className="h-4 w-4 shrink-0 text-rpg" />
        <h2 className="truncate font-display text-sm uppercase tracking-wider text-rpg">Ambiance sonore</h2>
      </header>
      <p className="truncate pb-2 text-xs text-muted-foreground">
        {mode === "off" ? "Ambiance coupée" : track.label}
        {suggestion ? ` · scène : ${suggestion}` : ""}
      </p>
      {canControl && (
        <div className="flex gap-1.5 pb-2">
          {(
            [
              ["auto", "Gemini", Wand2],
              ["manuel", "Manuel", Play],
              ["off", "Coupé", VolumeX],
            ] as [Mode, string, typeof Wand2][]
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
                mode === m
                  ? "border-rpg/50 bg-rpg/10 text-rpg"
                  : "border-rpg/20 bg-secondary text-muted-foreground"
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" /> {label}
            </button>
          ))}
        </div>
      )}
      <audio ref={audioRef} src={track.url} loop preload="none" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!canControl || mode === "off"}
          aria-label={playing ? "Couper la musique" : "Lancer la musique"}
          className="shrink-0 rounded-full border border-rpg/40 bg-secondary p-2 text-rpg disabled:opacity-40"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canControl}
          aria-label="Ambiance suivante"
          className="shrink-0 rounded-full border border-rpg/30 bg-secondary p-2 text-rpg disabled:opacity-40"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!canControl}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="min-w-0 flex-1 accent-[var(--rpg)]"
        />
      </div>
      {!canControl && (
        <p className="pt-2 text-[11px] text-muted-foreground">Seul le MJ règle l'ambiance sonore.</p>
      )}
    </section>
  );
}