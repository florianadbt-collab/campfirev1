
-- Cleanup legacy tables
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.characters CASCADE;
DROP TABLE IF EXISTS public.participants CASCADE;
DROP TABLE IF EXISTS public.games CASCADE;

-- ============================================================
-- Tables
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  genre text,
  gm_plays boolean NOT NULL DEFAULT false,
  invite_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'lobby',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player',
  status text NOT NULL DEFAULT 'connected',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'player',
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  formula text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dice_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.dice_requests(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  formula text NOT NULL,
  result integer NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note',
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dice_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dice_rolls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_memory TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.campaign_players TO service_role;
GRANT ALL ON public.characters TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.dice_requests TO service_role;
GRANT ALL ON public.dice_rolls TO service_role;
GRANT ALL ON public.campaign_memory TO service_role;

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dice_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dice_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_memory ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper security-definer functions (avoid RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_campaign_member(_campaign_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaign_players WHERE campaign_id = _campaign_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_campaign_owner(_campaign_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaigns WHERE id = _campaign_id AND owner_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.shares_campaign_with(_other_user uuid, _me uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign_players cp1
    JOIN public.campaign_players cp2 ON cp1.campaign_id = cp2.campaign_id
    WHERE cp1.user_id = _me AND cp2.user_id = _other_user
  );
$$;

CREATE OR REPLACE FUNCTION public.find_campaign_by_invite_code(_code text)
RETURNS TABLE (id uuid, name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, status FROM public.campaigns WHERE invite_code = upper(_code) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_campaign_by_invite_code(text) TO authenticated;

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username text;
  final_username text;
  suffix int := 0;
BEGIN
  base_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    split_part(NEW.email, '@', 1),
    'joueur'
  );
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (NEW.id, final_username, NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at triggers
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER campaigns_set_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER characters_set_updated_at BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER campaign_memory_set_updated_at BEFORE UPDATE ON public.campaign_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Policies
-- ============================================================
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_campaign_with(id, auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_campaign_member(id, auth.uid()));
CREATE POLICY "campaigns_insert_owner" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "campaigns_update_owner" ON public.campaigns FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "campaigns_delete_owner" ON public.campaigns FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "cp_select" ON public.campaign_players FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "cp_insert_self" ON public.campaign_players FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cp_update" ON public.campaign_players FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_owner(campaign_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "cp_delete" ON public.campaign_players FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_owner(campaign_id, auth.uid()));

CREATE POLICY "characters_select" ON public.characters FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "characters_insert_self" ON public.characters FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_campaign_member(campaign_id, auth.uid()));
CREATE POLICY "characters_update_self" ON public.characters FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "characters_delete_self" ON public.characters FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() OR user_id IS NULL)
    AND (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid())));
CREATE POLICY "messages_delete" ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_owner(campaign_id, auth.uid()));

CREATE POLICY "dr_select" ON public.dice_requests FOR SELECT TO authenticated
  USING (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "dr_insert" ON public.dice_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "dr_update" ON public.dice_requests FOR UPDATE TO authenticated
  USING (target_user_id = auth.uid() OR public.is_campaign_owner(campaign_id, auth.uid()))
  WITH CHECK (target_user_id = auth.uid() OR public.is_campaign_owner(campaign_id, auth.uid()));

CREATE POLICY "droll_select" ON public.dice_rolls FOR SELECT TO authenticated
  USING (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "droll_insert" ON public.dice_rolls FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid() OR user_id IS NULL)
    AND (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid())));

CREATE POLICY "cm_select" ON public.campaign_memory FOR SELECT TO authenticated
  USING (public.is_campaign_member(campaign_id, auth.uid()) OR public.is_campaign_owner(campaign_id, auth.uid()));
CREATE POLICY "cm_write" ON public.campaign_memory FOR ALL TO authenticated
  USING (public.is_campaign_owner(campaign_id, auth.uid()))
  WITH CHECK (public.is_campaign_owner(campaign_id, auth.uid()));
