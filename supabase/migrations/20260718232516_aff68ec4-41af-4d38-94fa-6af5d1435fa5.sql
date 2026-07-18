
-- Extend games
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'lobby',
  ADD COLUMN IF NOT EXISTS gm_device_id TEXT;

-- Allow updates on games (to start the adventure, etc.)
DROP POLICY IF EXISTS "Anyone can update a game" ON public.games;
CREATE POLICY "Anyone can update a game" ON public.games
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Participants table
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_gm BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'connected',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, device_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO anon, authenticated;
GRANT ALL ON public.participants TO service_role;

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read participants" ON public.participants
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert a participant" ON public.participants
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update a participant" ON public.participants
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete a participant" ON public.participants
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS participants_game_id_idx ON public.participants(game_id);
CREATE INDEX IF NOT EXISTS games_invite_code_idx ON public.games(invite_code);

-- Realtime
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.games REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
