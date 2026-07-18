import logoAsset from "@/assets/campfire-logo.png.asset.json";

export function LogoTemp() {
  return (
    <div className="relative flex flex-col items-center justify-center gap-3">
      <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-3xl border border-rpg/30 bg-card shadow-xl rpg-glow">
        <img
          src={logoAsset.url}
          alt="Logo Campfire"
          className="h-full w-full object-cover"
        />
      </div>
      <span className="font-display text-2xl font-bold tracking-widest text-foreground">
        CAMPFIRE
      </span>
    </div>
  );
}
