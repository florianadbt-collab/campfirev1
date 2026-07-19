
CREATE TABLE public.characters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  portrait_url text,
  name text NOT NULL DEFAULT '',
  race text,
  class_profession text,
  level integer NOT NULL DEFAULT 1,
  physical_description text,
  backstory text,
  inventory jsonb NOT NULL DEFAULT '[]'::jsonb,
  abilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  is_ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, device_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO anon, authenticated;
GRANT ALL ON public.characters TO service_role;

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read characters" ON public.characters FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert a character" ON public.characters FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update a character" ON public.characters FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete a character" ON public.characters FOR DELETE TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER characters_set_updated_at
BEFORE UPDATE ON public.characters
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
