-- Phase 4 foundation: master settings, visitor profiles, and profile extensions

-- Persistent visitor identity with stable badge number
CREATE TABLE IF NOT EXISTS public.visitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  normalized_name text NOT NULL,
  phone text DEFAULT '',
  normalized_phone text DEFAULT '',
  company text DEFAULT '',
  badge_number text UNIQUE,
  extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visitor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view visitor profiles" ON public.visitor_profiles;
CREATE POLICY "Authenticated users can view visitor profiles"
  ON public.visitor_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can view visitor profiles" ON public.visitor_profiles;
CREATE POLICY "Anyone can view visitor profiles"
  ON public.visitor_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage visitor profiles" ON public.visitor_profiles;
CREATE POLICY "Authenticated users can manage visitor profiles"
  ON public.visitor_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_visitor_profiles_normalized_name ON public.visitor_profiles (normalized_name);
CREATE INDEX IF NOT EXISTS idx_visitor_profiles_normalized_phone ON public.visitor_profiles (normalized_phone);

CREATE SEQUENCE IF NOT EXISTS visitor_profiles_badge_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_visitor_profile_badge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.badge_number IS NULL OR NEW.badge_number = '' THEN
    NEW.badge_number := 'V-' || LPAD(nextval('visitor_profiles_badge_seq')::text, 5, '0');
  END IF;
  NEW.normalized_name := lower(trim(COALESCE(NEW.full_name, '')));
  NEW.normalized_phone := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
  NEW.last_seen_at := COALESCE(NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitor_profiles_badge ON public.visitor_profiles;
CREATE TRIGGER trg_visitor_profiles_badge
  BEFORE INSERT OR UPDATE ON public.visitor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_visitor_profile_badge();

DROP TRIGGER IF EXISTS trg_visitor_profiles_updated ON public.visitor_profiles;
CREATE TRIGGER trg_visitor_profiles_updated
  BEFORE UPDATE ON public.visitor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link visit rows to persistent visitor profile
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS visitor_profile_id uuid REFERENCES public.visitor_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitors_visitor_profile_id ON public.visitors (visitor_profile_id);

-- Backfill visitor profiles and connect historical rows
WITH source_visitors AS (
  SELECT DISTINCT
    trim(COALESCE(visitor_name, '')) AS full_name,
    regexp_replace(COALESCE(phone, ''), '\D', '', 'g') AS normalized_phone,
    COALESCE(phone, '') AS phone,
    COALESCE(company, '') AS company
  FROM public.visitors
  WHERE trim(COALESCE(visitor_name, '')) <> ''
),
inserted AS (
  INSERT INTO public.visitor_profiles (full_name, normalized_name, phone, normalized_phone, company)
  SELECT
    sv.full_name,
    lower(sv.full_name),
    sv.phone,
    sv.normalized_phone,
    sv.company
  FROM source_visitors sv
  ON CONFLICT DO NOTHING
  RETURNING id
)
SELECT count(*) FROM inserted;

UPDATE public.visitors v
SET visitor_profile_id = vp.id,
    badge_number = COALESCE(v.badge_number, vp.badge_number)
FROM public.visitor_profiles vp
WHERE lower(trim(v.visitor_name)) = vp.normalized_name
  AND (
    regexp_replace(COALESCE(v.phone, ''), '\D', '', 'g') = vp.normalized_phone
    OR vp.normalized_phone = ''
  )
  AND v.visitor_profile_id IS NULL;

-- Keep backward-compatible badge generation, but prefer profile badge
CREATE OR REPLACE FUNCTION public.generate_badge_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  profile_badge text;
BEGIN
  IF NEW.visitor_profile_id IS NOT NULL THEN
    SELECT badge_number INTO profile_badge FROM public.visitor_profiles WHERE id = NEW.visitor_profile_id;
    NEW.badge_number := profile_badge;
  END IF;

  IF NEW.badge_number IS NULL OR NEW.badge_number = '' THEN
    NEW.badge_number := 'V-' || LPAD(nextval('visitors_badge_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Global app-level settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rows_per_page integer NOT NULL DEFAULT 10,
  analytics_mode text NOT NULL DEFAULT 'operational_and_executive',
  battery_stale_after_minutes integer NOT NULL DEFAULT 20,
  enable_guided_tour boolean NOT NULL DEFAULT true,
  enable_manual_page boolean NOT NULL DEFAULT true,
  enable_advanced_analytics boolean NOT NULL DEFAULT true,
  default_checkout_location text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view app settings" ON public.app_settings;
CREATE POLICY "Anyone can view app settings"
  ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_settings;
CREATE POLICY "Admins manage app settings"
  ON public.app_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (rows_per_page)
SELECT 10
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);

-- Profile enhancements: staff card + guided tour controls
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_card_url text,
  ADD COLUMN IF NOT EXISTS tour_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_step text DEFAULT 'intro',
  ADD COLUMN IF NOT EXISTS default_rows_per_page integer NOT NULL DEFAULT 10;

-- Add checkout location details
ALTER TABLE public.inventory_checkouts
  ADD COLUMN IF NOT EXISTS checkout_location text DEFAULT '';

-- Staff cards storage bucket
INSERT INTO storage.buckets (id, name, public)
SELECT 'staff-cards', 'staff-cards', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'staff-cards'
);

DROP POLICY IF EXISTS "Staff cards are publicly viewable" ON storage.objects;
CREATE POLICY "Staff cards are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'staff-cards');

DROP POLICY IF EXISTS "Admins can upload staff cards" ON storage.objects;
CREATE POLICY "Admins can upload staff cards"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'staff-cards' AND has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update staff cards" ON storage.objects;
CREATE POLICY "Admins can update staff cards"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'staff-cards' AND has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete staff cards" ON storage.objects;
CREATE POLICY "Admins can delete staff cards"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'staff-cards' AND has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
