import { useEffect, useRef, useState } from "react";
import { Music4, Pause, Play, SkipForward, Volume2 } from "lucide-react";

/** Ambiances jouables ; Gemini choisira automatiquement en V2 (music_query). */
export const AMBIENCE_TRACKS = [
  { id: "tavern", label: "Taverne", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3" },
  { id: "exploration", label: "Exploration", url: "https://cdn.pixabay.com/audio/2021/11/25/audio_00fa5593f3.mp3" },
  { id: "tension", label: "Tension", url: "https://cdn.pixabay.com/audio/2022/10/30/audio_347111d3b6.mp3" },
  { id: "repos", label: "Repos", url: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1bab.mp3" },
];

export function MusicPlayer({ suggestion, canControl }: { suggestion?: string; canControl: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const track = AMBIENCE_TRACKS[index]!;

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, index]);

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function next() {
    setPlaying(false);
    audioRef.current?.pause();
    setIndex((i) => (i + 1) % AMBIENCE_TRACKS.length);
  }

  return (
    <section className="rounded-2xl border border-rpg/25 bg-card/70 p-3">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 pb-2">
        <Music4 className="h-4 w-4 shrink-0 text-rpg" />
        <h2 className="truncate font-display text-sm uppercase tracking-wider text-rpg">Ambiance sonore</h2>
      </header>
      <p className="truncate pb-2 text-xs text-muted-foreground">
        {track.label}
        {suggestion ? ` · suggestion du MJ : ${suggestion}` : ""}
      </p>
      <audio ref={audioRef} src={track.url} loop preload="none" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!canControl}
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