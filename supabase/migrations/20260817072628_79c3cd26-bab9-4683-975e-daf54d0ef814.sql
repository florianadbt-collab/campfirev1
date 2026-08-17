ALTER TABLE public.campaign_memory
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'minor',
  ADD COLUMN IF NOT EXISTS campaign_day integer NOT NULL DEFAULT 1;

DROP POLICY IF EXISTS cm_select ON public.campaign_memory;
CREATE POLICY cm_select ON public.campaign_memory FOR SELECT TO authenticated
USING (
  is_campaign_owner(campaign_id, auth.uid())
  OR (
    is_campaign_member(campaign_id, auth.uid())
    AND (visibility = 'public' OR (visibility = 'private' AND user_id = auth.uid()))
  )
);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS world_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.campaign_npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  role_label text NOT NULL DEFAULT '',
  faction text NOT NULL DEFAULT '',
  personality text NOT NULL DEFAULT '',
  speech_style text NOT NULL DEFAULT '',
  appearance text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  is_alive boolean NOT NULL DEFAULT true,
  first_seen_day integer NOT NULL DEFAULT 1,
  last_seen_day integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_npcs TO authenticated;
GRANT ALL ON public.campaign_npcs TO service_role;
ALTER TABLE public.campaign_npcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY npc_select ON public.campaign_npcs FOR SELECT TO authenticated
USING (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY npc_write ON public.campaign_npcs FOR ALL TO authenticated
USING (is_campaign_owner(campaign_id, auth.uid()))
WITH CHECK (is_campaign_owner(campaign_id, auth.uid()));
CREATE TRIGGER campaign_npcs_set_updated_at BEFORE UPDATE ON public.campaign_npcs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.npc_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  npc_id uuid NOT NULL REFERENCES public.campaign_npcs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  trust integer NOT NULL DEFAULT 0,
  suspicion integer NOT NULL DEFAULT 0,
  hostility integer NOT NULL DEFAULT 0,
  stance text NOT NULL DEFAULT 'neutre',
  opinion text NOT NULL DEFAULT '',
  last_event text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS npc_relations_unique_target
  ON public.npc_relations (npc_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.npc_relations TO authenticated;
GRANT ALL ON public.npc_relations TO service_role;
ALTER TABLE public.npc_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY npc_rel_gm_only ON public.npc_relations FOR ALL TO authenticated
USING (is_campaign_owner(campaign_id, auth.uid()))
WITH CHECK (is_campaign_owner(campaign_id, auth.uid()));
CREATE TRIGGER npc_relations_set_updated_at BEFORE UPDATE ON public.npc_relations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.character_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  severity text NOT NULL DEFAULT 'legere',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_conditions TO authenticated;
GRANT ALL ON public.character_conditions TO service_role;
ALTER TABLE public.character_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON public.character_conditions FOR SELECT TO authenticated
USING (is_campaign_member(campaign_id, auth.uid()) OR is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY cc_write ON public.character_conditions FOR ALL TO authenticated
USING (user_id = auth.uid() OR is_campaign_owner(campaign_id, auth.uid()))
WITH CHECK (user_id = auth.uid() OR is_campaign_owner(campaign_id, auth.uid()));
CREATE TRIGGER character_conditions_set_updated_at BEFORE UPDATE ON public.character_conditions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();