import { AlertTriangle, CloudSun, Clock, MapPin } from "lucide-react";

export type Ambiance = {
  location: string;
  world_time: string;
  weather: string;
  tension: number;
};

function tensionLabel(t: number) {
  if (t >= 75) return "Critique";
  if (t >= 50) return "Élevée";
  if (t >= 25) return "Modérée";
  return "Calme";
}

/** Barre d'ambiance — alimentée par le MJ IA à chaque scène. */
export function AmbianceBar({ ambiance }: { ambiance: Ambiance }) {
  const items = [
    { icon: MapPin, label: ambiance.location || "Lieu inconnu" },
    { icon: Clock, label: ambiance.world_time || "Heure inconnue" },
    { icon: CloudSun, label: ambiance.weather || "Météo calme" },
    { icon: AlertTriangle, label: `Tension ${tensionLabel(ambiance.tension)}` },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-rpg/15 bg-card/40 px-4 py-2">
      {items.map((it) => (
        <span
          key={it.label}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-rpg/25 bg-secondary px-2.5 py-1 text-[11px] text-foreground"
        >
          <it.icon className="h-3.5 w-3.5 shrink-0 text-rpg" />
          {it.label}
        </span>
      ))}
      <span className="ml-auto hidden h-6 w-24 shrink-0 self-center overflow-hidden rounded-full border border-rpg/25 bg-secondary sm:block">
        <span
          className="block h-full bg-rpg/60 transition-all"
          style={{ width: `${Math.max(4, Math.min(100, ambiance.tension))}%` }}
        />
      </span>
    </div>
  );
}