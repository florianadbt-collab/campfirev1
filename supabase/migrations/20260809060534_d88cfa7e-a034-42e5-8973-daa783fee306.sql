CREATE TABLE public.spotify_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text NOT NULL DEFAULT '',
  display_name text,
  account_id text,
  product text,
  device_id text,
  device_name text,
  last_mood text,
  last_change_at timestamptz,
  needs_reconnect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.spotify_connections TO service_role;
ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER spotify_connections_set_updated_at
BEFORE UPDATE ON public.spotify_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();