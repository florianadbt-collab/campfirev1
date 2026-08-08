import { Hourglass, MessageSquare, Play, Swords, Users } from "lucide-react";
import type { SceneResponse, SceneState } from "@/lib/ai/types";

export type TurnState = {
  state: SceneState;
  activePlayers: string[];
  waitingForInput: boolean;
  allowParallel: boolean;
  requiresMjConfirmation: boolean;
  initiative: string[];
};

export function turnStateFrom(scene: Partial<SceneResponse> | undefined): TurnState {
  // Scènes antérieures au pilotage de tour : tout le monde peut agir.
  const state = (scene?.scene_state ?? "GROUP_CHOICE") as SceneState;
  const activePlayers = Array.isArray(scene?.active_players) ? scene!.active_players! : [];
  return {
    state,
    activePlayers,
    waitingForInput: scene?.waiting_for_input ?? activePlayers.length > 0,
    allowParallel: scene?.allow_parallel_inputs ?? state === "GROUP_CHOICE",
    requiresMjConfirmation: scene?.requires_mj_confirmation ?? activePlayers.length === 0,
    initiative: Array.isArray(scene?.initiative) ? scene!.initiative! : [],
  };
}

/** Le joueur peut-il agir maintenant ? */
export function canPlayerAct(turn: TurnState, userId: string | null): boolean {
  if (!userId) return false;
  if (turn.state === "NARRATION") return false;
  if (turn.allowParallel || turn.state === "GROUP_CHOICE") return true;
  if (turn.activePlayers.length === 0) return false;
  return turn.activePlayers.includes(userId);
}

/**
 * Tour par tour strict : un seul joueur agit à la fois.
 * L'ordre est déterministe (même résultat sur tous les appareils) : il dépend
 * uniquement de l'ordre des joueurs et du nombre d'actions déjà jouées.
 */
export function sequentialTurn(
  base: TurnState,
  order: string[],
  actionsPlayed: number,
): TurnState {
  if (order.length === 0) return base;
  if (base.state === "NARRATION") {
    return { ...base, activePlayers: [], allowParallel: false, waitingForInput: false };
  }
  // En combat, on respecte l'ordre d'initiative donné par le MJ IA s'il est valide.
  const ring =
    base.state === "COMBAT" && base.initiative.filter((x) => order.includes(x)).length > 1
      ? base.initiative.filter((x) => order.includes(x))
      : order;
  const current = ring[((actionsPlayed % ring.length) + ring.length) % ring.length]!;
  return {
    ...base,
    state: base.state === "GROUP_CHOICE" ? "PLAYER_TURN" : base.state,
    activePlayers: [current],
    allowParallel: false,
    waitingForInput: true,
    requiresMjConfirmation: false,
    initiative: ring,
  };
}

/** Joueur dont c'est le tour, s'il y en a un. */
export function currentPlayer(turn: TurnState): string | null {
  return turn.activePlayers[0] ?? null;
}

const ICONS: Record<SceneState, typeof Users> = {
  NARRATION: Play,
  PLAYER_TURN: Hourglass,
  GROUP_CHOICE: Users,
  DIALOGUE: MessageSquare,
  COMBAT: Swords,
};

/** Bandeau « qui joue maintenant » — la même vérité sur tous les appareils. */
export function TurnBanner({
  turn,
  userId,
  names,
}: {
  turn: TurnState;
  userId: string | null;
  names: Map<string, string>;
}) {
  const mine = canPlayerAct(turn, userId);
  const activeNames = turn.activePlayers.map((id) => names.get(id) ?? "Un joueur");
  const Icon = ICONS[turn.state] ?? Play;

  const message = mine
    ? "🟢 C'est à vous de jouer."
    : turn.state === "NARRATION"
      ? "Le récit avance… personne n'agit pour l'instant."
      : activeNames.length
        ? `⏳ Au tour de ${activeNames.join(", ")}…`
        : "⏳ En attente du Maître du Jeu…";

  const order = (turn.initiative.length ? turn.initiative : turn.activePlayers)
    .map((id) => names.get(id) ?? "?")
    .join(" → ");

  return (
    <div className="flex flex-col gap-1">
    <p
      className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${
        mine
          ? "border-rpg/50 bg-rpg/10 text-rpg"
          : "border-rpg/20 bg-secondary text-muted-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
    </p>
      {turn.initiative.length > 1 && (
        <p className="truncate px-1 text-[11px] text-muted-foreground">Ordre du tour : {order}</p>
      )}
    </div>
  );
}