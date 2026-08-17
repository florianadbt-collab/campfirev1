import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Backpack,
  Handshake,
  Home,
  Library,
  Map as MapIcon,
  Menu as MenuIcon,
  ScrollText,
  Settings,
  Sparkles,
  Target,
  Theater,
  TreeDeciduous,
  User,
  Wand2,
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
import { GmTools } from "@/components/game/gm-tools";
import type { Ambiance } from "@/components/game/ambiance-bar";
import type { CharacterSheet } from "@/lib/character-sheet";
import type { SceneResponse } from "@/lib/ai/types";

type MenuKey =
  | "perso"
  | "inventaire"
  | "progression"
  | "capacites"
  | "sorts"
  | "quetes"
  | "journal"
  | "carte"
  | "codex"
  | "relations"
  | "mj"
  | "parametres";

type Entry = { key: MenuKey; label: string; icon: typeof User; gmOnly?: boolean };

const ENTRIES: Entry[] = [
  { key: "perso", label: "Personnage", icon: User },
  { key: "inventaire", label: "Inventaire", icon: Backpack },
  { key: "progression", label: "Progression", icon: TreeDeciduous },
  { key: "capacites", label: "Arbre de compétences", icon: ScrollText },
  { key: "sorts", label: "Livre de sorts", icon: Wand2 },
  { key: "quetes", label: "Journal des quêtes", icon: Target },
  { key: "journal", label: "Journal", icon: BookOpen },
  { key: "carte", label: "Carte", icon: MapIcon, gmOnly: true },
  { key: "codex", label: "Codex", icon: Library, gmOnly: true },
  { key: "relations", label: "Relations", icon: Handshake, gmOnly: true },
  { key: "mj", label: "🎭 Outils MJ", icon: Theater, gmOnly: true },
  { key: "parametres", label: "Paramètres", icon: Settings },
];

const SPELL_RE = /sort|magi|incant|arcan|rune|sortil/i;

/** Menu unique de la partie : un seul bouton ☰ ouvre tout le panneau latéral. */
export function GameMenus({
  campaignId,
  sheet,
  scenes,
  journal,
  party,
  isGm = false,
  ambiance,
  turns = 0,
}: {
  campaignId: string;
  sheet: CharacterSheet;
  scenes: Partial<SceneResponse>[];
  journal: { id: string; title: string; text: string }[];
  party: { user_id: string; name: string; portrait_url: string | null; role: string }[];
  isGm?: boolean;
  ambiance: Ambiance;
  turns?: number;
}) {
  const [drawer, setDrawer] = useState(false);
  const [open, setOpen] = useState<MenuKey | null>(null);

  const entries = ENTRIES.filter((e) => isGm || !e.gmOnly);

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

  const spells = sheet.abilities.filter((a) => SPELL_RE.test(a));
  const skills = sheet.abilities.filter((a) => !SPELL_RE.test(a));

  const xp = journal.length * 120;
  const nextLevel = (sheet.level + 1) * 500;

  function pick(key: MenuKey) {
    setDrawer(false);
    setOpen(key);
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const portal = (node: React.ReactNode) =>
    mounted ? createPortal(node, document.body) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawer(true)}
        aria-label="Ouvrir le menu de jeu"
        className="flex shrink-0 items-center gap-2 rounded-full border border-rpg/30 bg-card px-3 py-2 text-rpg"
      >
        <MenuIcon className="h-5 w-5" />
        <span className="font-display text-xs uppercase tracking-wider">Menu</span>
      </button>

      {/* Panneau latéral */}
      {drawer &&
        portal(
        <div className="fixed inset-0 z-[100] flex bg-background" onClick={() => setDrawer(false)}>
          <nav
            aria-label="Menu de jeu"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full flex-col gap-2 overflow-y-auto bg-card p-5 pb-[env(safe-area-inset-bottom)]"
          >
            <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-rpg/20 bg-card pb-4">
              <h2 className="truncate font-display text-2xl tracking-wide text-foreground">Campfire</h2>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Fermer le menu"
                className="shrink-0 rounded-full border border-rpg/30 p-2.5 text-rpg"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="grid grid-cols-2 gap-3 pt-4">
            {entries.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => pick(e.key)}
                className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border border-rpg/20 bg-secondary p-3 text-left text-sm text-foreground active:scale-[0.98]"
              >
                <e.icon className="h-6 w-6 shrink-0 text-rpg" />
                <span className="min-w-0 leading-tight">{e.label}</span>
              </button>
            ))}
            </div>

            <Link
              to="/home"
              onClick={() => setDrawer(false)}
              className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-rpg/40 bg-rpg/10 px-3 py-4 text-sm text-rpg"
            >
              <Home className="h-4 w-4 shrink-0" />
              Retour au menu principal
            </Link>
          </nav>
        </div>,
      )}

      {/* Feuille de contenu */}
      {open &&
        portal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-background">
          <div className="flex h-full flex-col overflow-y-auto border-t border-rpg/30 bg-card p-4">
            <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-rpg/20 bg-card pb-3">
              <h2 className="truncate font-display text-xl tracking-wide text-foreground">
                {ENTRIES.find((m) => m.key === open)?.label}
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
              {open === "capacites" && (
                <>
                  <AbilitiesPanel items={skills} />
                  <StatsPanel attributes={sheet.attributes} level={sheet.level} />
                </>
              )}
              {open === "sorts" && (
                <SimpleList
                  items={spells.map((s, i) => ({ id: `${s}-${i}`, title: s }))}
                  empty="Aucun sort connu pour l'instant."
                />
              )}
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

              {open === "mj" && isGm && (
                <GmTools
                  campaignId={campaignId}
                  ambiance={ambiance}
                  scenes={scenes}
                  turns={turns}
                />
              )}

              {open === "parametres" && (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/campaigns/$id"
                    params={{ id: campaignId }}
                    onClick={() => setOpen(null)}
                    className="rounded-xl border border-rpg/25 bg-secondary px-3 py-2.5 text-sm text-foreground"
                  >
                    Lobby de la campagne
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setOpen(null)}
                    className="rounded-xl border border-rpg/25 bg-secondary px-3 py-2.5 text-sm text-foreground"
                  >
                    Mon profil de joueur
                  </Link>
                  <Link
                    to="/home"
                    onClick={() => setOpen(null)}
                    className="rounded-xl border border-rpg/40 bg-rpg/10 px-3 py-2.5 text-sm text-rpg"
                  >
                    Retour au menu principal
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>,
      )}
    </>
  );
}
