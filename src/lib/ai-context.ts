import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Tables"]["games"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];
type Character = Database["public"]["Tables"]["characters"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];

export type CampaignAIContext = {
  game: {
    id: string;
    name: string;
    genre: string | null;
    gm_plays: boolean;
    world_summary: string | null;
  };
  session: {
    id: string;
    status: string;
    started_at: string;
  };
  participants: Array<{
    device_id: string;
    display_name: string;
    is_gm: boolean;
    status: string;
  }>;
  characters: Array<{
    id: string;
    device_id: string;
    name: string;
    race: string | null;
    class_profession: string | null;
    level: number;
    physical_description: string | null;
    backstory: string | null;
    attributes: unknown;
    abilities: unknown;
    inventory: unknown;
    notes: string | null;
  }>;
  history: unknown[];
};

export function buildCampaignContext(input: {
  game: Game;
  session: Session;
  participants: Participant[];
  characters: Character[];
  history?: unknown[];
}): CampaignAIContext {
  const { game, session, participants, characters, history } = input;
  return {
    game: {
      id: game.id,
      name: game.name,
      genre: game.genre,
      gm_plays: game.gm_plays,
      world_summary: game.description,
    },
    session: {
      id: session.id,
      status: session.status,
      started_at: session.created_at,
    },
    participants: participants.map((p) => ({
      device_id: p.device_id,
      display_name: p.display_name,
      is_gm: p.is_gm,
      status: p.status,
    })),
    characters: characters.map((c) => ({
      id: c.id,
      device_id: c.device_id,
      name: c.name,
      race: c.race,
      class_profession: c.class_profession,
      level: c.level,
      physical_description: c.physical_description,
      backstory: c.backstory,
      attributes: c.attributes,
      abilities: c.abilities,
      inventory: c.inventory,
      notes: c.notes,
    })),
    history: history ?? [],
  };
}