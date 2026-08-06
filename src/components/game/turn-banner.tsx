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
      : turn.state === "GROUP_CHOICE"
        ? "Choix de groupe : tout le monde peut répondre."
        : turn.state === "COMBAT"
          ? `Combat — ordre : ${
              (turn.initiative.length ? turn.initiative : turn.activePlayers)
                .map((id) => names.get(id) ?? "?")
                .join(" → ") || "à établir"
            }`
          : activeNames.length
            ? `⏳ ${activeNames.join(", ")} réfléchi${activeNames.length > 1 ? "ssent" : "t"}…`
            : "⏳ En attente du Maître du Jeu…";

  return (
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
  );
}