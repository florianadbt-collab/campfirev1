import type { ReactNode } from "react";
import { Dices, Map, Music4, Swords } from "lucide-react";
import type { Attribute } from "@/lib/character-sheet";

export function PanelCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rpg/25 bg-card/70 p-3">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pb-2">
        <h2 className="truncate font-display text-sm uppercase tracking-wider text-rpg">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatsPanel({ attributes, level }: { attributes: Attribute[]; level: number }) {
  return (
    <PanelCard title="Caractéristiques">
      <p className="pb-2 text-xs text-muted-foreground">Niveau {level}</p>
      {attributes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune caractéristique renseignée.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {attributes.map((a) => (
            <li key={a.name} className="rounded-xl border border-rpg/20 bg-secondary px-2 py-1.5">
              <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                {a.name}
              </span>
              <span className="font-display text-base text-foreground">{a.value || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

export function InventoryPanel({ items }: { items: string[] }) {
  return (
    <PanelCard title="Inventaire">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sac vide.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <li key={i} className="rounded-lg border border-rpg/15 bg-secondary px-2 py-1.5 text-sm text-foreground">
              {it}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

export function AbilitiesPanel({ items }: { items: string[] }) {
  return (
    <PanelCard title="Compétences">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune compétence.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <li key={i} className="rounded-full border border-rpg/25 px-2.5 py-1 text-xs text-foreground">
              {it}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

export function JournalPanel({ entries }: { entries: { id: string; title: string; text: string }[] }) {
  return (
    <PanelCard title="Journal">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">L'aventure n'a pas encore laissé de trace.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="border-l border-rpg/30 pl-3">
              <p className="font-display text-sm tracking-wide text-foreground">{e.title}</p>
              <p className="line-clamp-3 text-xs text-muted-foreground">{e.text}</p>
            </li>
          ))}
        </ol>
      )}
    </PanelCard>
  );
}

export function PartyPanel({
  members,
}: {
  members: { user_id: string; name: string; portrait_url: string | null; role: string }[];
}) {
  return (
    <PanelCard title="Groupe">
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.user_id} className="flex min-w-0 items-center gap-2">
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-rpg/30 bg-secondary">
              {m.portrait_url ? (
                <img src={m.portrait_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.name}</span>
            {m.role === "gm" && (
              <span className="shrink-0 rounded-full border border-rpg/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rpg">
                MJ
              </span>
            )}
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

/** Emplacements réservés aux modules à venir : musique, dés, combat, cartes. */
export function ComingSoonSlot({
  kind,
}: {
  kind: "spotify" | "dice" | "combat" | "map";
}) {
  const conf = {
    spotify: { icon: Music4, title: "Ambiance sonore", text: "Bande-son adaptative — bientôt." },
    dice: { icon: Dices, title: "Lancer de dés", text: "Jets 3D et demandes du MJ — bientôt." },
    combat: { icon: Swords, title: "Combat", text: "Initiative et tour par tour — bientôt." },
    map: { icon: Map, title: "Carte", text: "Lieux explorés et déplacements — bientôt." },
  }[kind];
  const Icon = conf.icon;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-rpg/25 bg-card/40 p-3">
      <Icon className="h-5 w-5 shrink-0 text-rpg/60" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm tracking-wide text-foreground/80">{conf.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{conf.text}</p>
      </div>
    </div>
  );
}
