import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Backpack,
  Handshake,
  Library,
  Map as MapIcon,
  ScrollText,
  Sparkles,
  Target,
  TreeDeciduous,
  User,
  X,
} from "lucide-react";
import {
  AbilitiesPanel,
  InventoryPanel,
  JournalPanel,
  PartyPanel,
  SimpleList,
  StatsPanel,
} from "@/components/game/panels";
import { IllustrationSlot } from "@/components/game/illustration";
import type { CharacterSheet } from "@/lib/character-sheet";
import type { SceneResponse } from "@/lib/ai/types";

type MenuKey =
  | "perso"
  | "inventaire"
  | "progression"
  | "capacites"
  | "quetes"
  | "journal"
  | "carte"
  | "codex"
  | "relations";

const MENUS: { key: MenuKey; label: string; icon: typeof User }[] = [
  { key: "perso", label: "Personnage", icon: User },
  { key: "inventaire", label: "Inventaire", icon: Backpack },
  { key: "progression", label: "Progression", icon: TreeDeciduous },
  { key: "capacites", label: "Capacités", icon: ScrollText },
  { key: "quetes", label: "Quêtes", icon: Target },
  { key: "journal", label: "Journal", icon: BookOpen },
  { key: "carte", label: "Carte", icon: MapIcon },
  { key: "codex", label: "Codex", icon: Library },
  { key: "relations", label: "Relations", icon: Handshake },
];

export function GameMenus({
  campaignId,
  sheet,
  scenes,
  journal,
  party,
}: {
  campaignId: string;
  sheet: CharacterSheet;
  scenes: Partial<SceneResponse>[];
  journal: { id: string; title: string; text: string }[];
  party: { user_id: string; name: string; portrait_url: string | null; role: string }[];
}) {
  const [open, setOpen] = useState<MenuKey | null>(null);

  const locations = useMemo(() => {
    const seen = new Map<string, string>();
    scenes.forEach((s) => {
      if (s.location) seen.set(s.location, s.scene_title ?? "");
    });
    return [...seen].map(([name, title]) => ({ id: name, title: name, text: title }));
  }, [scenes]);

  const relations = useMemo(() => {
    const count = new Map<string, number>();
    scenes.forEach((s) =>
      (s.dialogues ?? []).forEach((d) => count.set(d.speaker, (count.get(d.speaker) ?? 0) + 1)),
    );
    return [...count].map(([name, n]) => ({
      id: name,
      title: name,
      text: `${n} échange${n > 1 ? "s" : ""} avec le groupe`,
      badge: n > 2 ? "Proche" : "Connu",
    }));
  }, [scenes]);

  const quests = useMemo(
    () =>
      scenes
        .filter((s) => s.scene_title)
        .slice(-6)
        .map((s, i, arr) => ({
          id: `${s.scene_title}-${i}`,
          title: s.scene_title!,
          text: s.narration ? `${s.narration.slice(0, 110)}…` : "",
          badge: i === arr.length - 1 ? "En cours" : "Terminée",
        }))
        .reverse(),
    [scenes],
  );

  const xp = journal.length * 120;
  const nextLevel = (sheet.level + 1) * 500;

  return (
    <>
      <nav aria-label="Menus de jeu" className="flex gap-2 overflow-x-auto px-4 py-2">
        {MENUS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setOpen(m.key)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-rpg/25 bg-card px-3 py-1.5 text-[11px] text-foreground"
          >
            <m.icon className="h-3.5 w-3.5 shrink-0 text-rpg" />
            {m.label}
          </button>
        ))}
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-background/80 backdrop-blur">
          <div className="max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-rpg/30 bg-card p-4">
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pb-3">
              <h2 className="truncate font-display text-lg tracking-wide text-foreground">
                {MENUS.find((m) => m.key === open)?.label}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Fermer le menu"
                className="shrink-0 rounded-full border border-rpg/30 p-1.5 text-rpg"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-col gap-3 pb-4">
              {open === "perso" && (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-rpg/30 bg-secondary">
                      {sheet.portrait_url && (
                        <img src={sheet.portrait_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base text-foreground">{sheet.name || "Sans nom"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[sheet.race, sheet.class_profession].filter(Boolean).join(" · ") || "Origine inconnue"}
                      </p>
                    </div>
                  </div>
                  <StatsPanel attributes={sheet.attributes} level={sheet.level} />
                  <Link
                    to="/campaigns/$id/character"
                    params={{ id: campaignId }}
                    className="rpg-button text-center"
                    onClick={() => setOpen(null)}
                  >
                    <span className="font-display tracking-wide">Modifier ma fiche</span>
                  </Link>
                </>
              )}

              {open === "inventaire" && <InventoryPanel items={sheet.inventory} />}
              {open === "capacites" && <AbilitiesPanel items={sheet.abilities} />}
              {open === "journal" && <JournalPanel entries={journal} />}

              {open === "progression" && (
                <>
                  <div className="rounded-2xl border border-rpg/25 bg-secondary p-3">
                    <p className="pb-2 text-xs text-muted-foreground">
                      Niveau {sheet.level} · {xp} / {nextLevel} points d'expérience
                    </p>
                    <span className="block h-2 overflow-hidden rounded-full bg-background">
                      <span
                        className="block h-full bg-rpg/70"
                        style={{ width: `${Math.min(100, (xp / nextLevel) * 100)}%` }}
                      />
                    </span>
                  </div>
                  <SimpleList
                    items={sheet.attributes.map((a) => ({ id: a.name, title: a.name, text: a.value }))}
                    empty="Aucune caractéristique à faire progresser."
                  />
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-rpg/60" /> L'expérience progresse à chaque scène vécue.
                  </p>
                </>
              )}

              {open === "quetes" && <SimpleList items={quests} empty="Aucune piste pour l'instant." />}

              {open === "carte" && (
                <>
                  <SimpleList items={locations} empty="Aucun lieu exploré." />
                  <IllustrationSlot
                    kind="scene"
                    campaignId={campaignId}
                    prompt={locations.at(-1)?.title ?? "unknown land, fantasy map view"}
                  />
                </>
              )}

              {open === "codex" && (
                <>
                  <SimpleList
                    items={scenes
                      .filter((s) => s.scene_mood)
                      .slice(-8)
                      .map((s, i) => ({
                        id: `${s.scene_mood}-${i}`,
                        title: s.scene_title ?? "Fragment",
                        text: s.scene_mood,
                      }))}
                    empty="Le codex se remplira au fil de l'aventure."
                  />
                  <IllustrationSlot
                    kind="objet"
                    campaignId={campaignId}
                    prompt={sheet.inventory[0] ?? "ancient artifact"}
                  />
                </>
              )}

              {open === "relations" && (
                <>
                  <PartyPanel members={party} />
                  <SimpleList items={relations} empty="Aucun personnage rencontré." />
                  <IllustrationSlot
                    kind="npc"
                    campaignId={campaignId}
                    prompt={relations.at(-1)?.title ?? "mysterious stranger"}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}