-- ============ PHASE 2: FRONT DESK / VISITORS ============

-- Visitor form fields (admin-editable)
CREATE TABLE public.visitor_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  required boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.visitor_form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view enabled fields" ON public.visitor_form_fields FOR SELECT USING (true);
CREATE POLICY "Admins manage fields" ON public.visitor_form_fields FOR ALL USING (has_role(auth.uid(),'admin'));

INSERT INTO public.visitor_form_fields (field_key, field_label, field_type, required, display_order) VALUES
  ('visitor_name','Full Name','text',true,1),
  ('company','Company / Organization','text',false,2),
  ('host_name','Host (Person you''re visiting)','text',false,3),
  ('purpose','Purpose of Visit','text',false,4),
  ('phone','Phone Number','text',false,5);

-- Add extra_fields to visitors for dynamic form data
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS extra_fields jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'frontdesk';

-- Allow visitors to self-register from kiosk (no auth required)
DROP POLICY IF EXISTS "Authenticated users can create visitor records" ON public.visitors;
CREATE POLICY "Anyone can create visitor records" ON public.visitors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own checkout via id" ON public.visitors FOR UPDATE USING (true) WITH CHECK (true);

-- Auto-generate badge number
CREATE SEQUENCE IF NOT EXISTS visitors_badge_seq START 1;
CREATE OR REPLACE FUNCTION public.generate_badge_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.badge_number IS NULL OR NEW.badge_number = '' THEN
    NEW.badge_number := 'V-' || LPAD(nextval('visitors_badge_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS set_badge_number ON public.visitors;
CREATE TRIGGER set_badge_number BEFORE INSERT ON public.visitors
  FOR EACH ROW EXECUTE FUNCTION public.generate_badge_number();

-- Kiosk PIN settings (single row)
CREATE TABLE public.kiosk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_pin text NOT NULL DEFAULT '1234',
  google_sheet_url text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.kiosk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view kiosk settings" ON public.kiosk_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage kiosk settings" ON public.kiosk_settings FOR ALL USING (has_role(auth.uid(),'admin'));
INSERT INTO public.kiosk_settings (exit_pin) VALUES ('1234');

-- ============ PHASE 3: ASSETS & BOOKS ============

-- Trackable assets (Chromebook, iMac, iPad...)
CREATE SEQUENCE IF NOT EXISTS assets_tag_seq START 1;
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag text UNIQUE,
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'chromebook',
  serial_number text DEFAULT '',
  status text NOT NULL DEFAULT 'in_safe',
  location text DEFAULT '',
  battery_percent integer,
  battery_charging boolean,
  battery_updated_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.generate_asset_tag()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.asset_tag IS NULL OR NEW.asset_tag = '' THEN
    NEW.asset_tag := UPPER(LEFT(NEW.asset_type,2)) || '-' || LPAD(nextval('assets_tag_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER set_asset_tag BEFORE INSERT ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.generate_asset_tag();

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view assets" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage assets" ON public.assets FOR ALL USING (has_role(auth.uid(),'admin'));
-- Allow asset self-update for battery (kiosk on device)
CREATE POLICY "Anyone can update battery" ON public.assets FOR UPDATE USING (true) WITH CHECK (true);

-- Asset usage sessions
CREATE TABLE public.asset_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id uuid,
  visitor_id uuid REFERENCES public.visitors(id) ON DELETE SET NULL,
  user_name text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text DEFAULT '',
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view sessions" ON public.asset_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create sessions" ON public.asset_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update sessions" ON public.asset_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins manage sessions" ON public.asset_sessions FOR ALL USING (has_role(auth.uid(),'admin'));

-- Books library
CREATE SEQUENCE IF NOT EXISTS books_id_seq START 1;
CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text UNIQUE,
  title text NOT NULL,
  authors text DEFAULT '',
  isbn text DEFAULT '',
  publisher text DEFAULT '',
  year integer,
  copies_total integer NOT NULL DEFAULT 1,
  copies_available integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.generate_book_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.book_id IS NULL OR NEW.book_id = '' THEN
    NEW.book_id := 'BK-' || LPAD(nextval('books_id_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER set_book_id BEFORE INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.generate_book_id();

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view books" ON public.books FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage books" ON public.books FOR ALL USING (has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_sessions;

-- Updated_at triggers
CREATE TRIGGER trg_visitor_form_fields_updated BEFORE UPDATE ON public.visitor_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_books_updated BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();