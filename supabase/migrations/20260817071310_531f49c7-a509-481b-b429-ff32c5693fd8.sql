DROP TABLE IF EXISTS public.spotify_connections;

CREATE TABLE public.combats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  round integer NOT NULL DEFAULT 1,
  turn_index integer NOT NULL DEFAULT 0,
  initiative jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_participant text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combats TO authenticated;
GRANT ALL ON public.combats TO service_role;
ALTER TABLE public.combats ENABLE ROW LEVEL SECURITY;

CREATE POLICY combats_select ON public.combats FOR SELECT TO authenticated
USING (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY combats_insert ON public.combats FOR INSERT TO authenticated
WITH CHECK (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY combats_update ON public.combats FOR UPDATE TO authenticated
USING (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()))
WITH CHECK (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY combats_delete ON public.combats FOR DELETE TO authenticated
USING (is_campaign_owner(campaign_id, auth.uid()));

CREATE TRIGGER combats_updated_at BEFORE UPDATE ON public.combats
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.combat_enemies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combat_id uuid NOT NULL REFERENCES public.combats(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  max_hp integer NOT NULL DEFAULT 10,
  hp integer NOT NULL DEFAULT 10,
  status_label text NOT NULL DEFAULT '',
  is_defeated boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (combat_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.combat_enemies TO authenticated;
GRANT ALL ON public.combat_enemies TO service_role;
ALTER TABLE public.combat_enemies ENABLE ROW LEVEL SECURITY;

CREATE POLICY ce_select ON public.combat_enemies FOR SELECT TO authenticated
USING (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY ce_insert ON public.combat_enemies FOR INSERT TO authenticated
WITH CHECK (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY ce_update ON public.combat_enemies FOR UPDATE TO authenticated
USING (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()))
WITH CHECK (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY ce_delete ON public.combat_enemies FOR DELETE TO authenticated
USING (is_campaign_owner(campaign_id, auth.uid()));

CREATE TRIGGER combat_enemies_updated_at BEFORE UPDATE ON public.combat_enemies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX combats_campaign_idx ON public.combats(campaign_id, status);
CREATE INDEX combat_enemies_combat_idx ON public.combat_enemies(combat_id, sort_order);