export function LogoTemp() {
  return (
    <div className="relative flex flex-col items-center justify-center gap-3">
      <div className="relative grid h-28 w-28 place-items-center rounded-3xl border border-rpg/30 bg-card shadow-xl rpg-glow">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-16 w-16 text-rpg"
          aria-label="Logo temporaire"
        >
          <path
            d="M32 4L8 18v28l24 14 24-14V18L32 4z"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M32 18L20 25v14l12 7 12-7V25L32 18z"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M32 32v18M20 25l12 7 12-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="font-display text-2xl font-bold tracking-widest text-foreground">
        RPG TABLE
      </span>
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Logo temporaire
      </span>
    </div>
  );
}
