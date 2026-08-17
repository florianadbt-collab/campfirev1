ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dice_mode text NOT NULL DEFAULT 'virtual';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_dice_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_dice_mode_check CHECK (dice_mode IN ('virtual', 'physical'));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS inspiration text;