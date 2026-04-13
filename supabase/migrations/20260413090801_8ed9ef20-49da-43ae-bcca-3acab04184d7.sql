
-- Add employee_id to profiles with auto-incrementing sequence
CREATE SEQUENCE IF NOT EXISTS profiles_employee_id_seq START 1;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_id text UNIQUE;

-- Backfill existing profiles
UPDATE public.profiles SET employee_id = 'EMP-' || LPAD(nextval('profiles_employee_id_seq')::text, 4, '0') WHERE employee_id IS NULL;

-- Set default for new profiles
ALTER TABLE public.profiles ALTER COLUMN employee_id SET DEFAULT 'EMP-' || LPAD(nextval('profiles_employee_id_seq')::text, 4, '0');

-- Add asset_id to inventory with auto-incrementing sequence
CREATE SEQUENCE IF NOT EXISTS inventory_asset_id_seq START 1;

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS asset_id text UNIQUE;

-- Backfill existing inventory
UPDATE public.inventory SET asset_id = 'AST-' || LPAD(nextval('inventory_asset_id_seq')::text, 4, '0') WHERE asset_id IS NULL;

ALTER TABLE public.inventory ALTER COLUMN asset_id SET DEFAULT 'AST-' || LPAD(nextval('inventory_asset_id_seq')::text, 4, '0');

-- Create trigger to auto-generate employee_id on insert
CREATE OR REPLACE FUNCTION public.generate_employee_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
    NEW.employee_id := 'EMP-' || LPAD(nextval('profiles_employee_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_employee_id
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.generate_employee_id();

-- Create trigger to auto-generate asset_id on insert
CREATE OR REPLACE FUNCTION public.generate_asset_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.asset_id IS NULL OR NEW.asset_id = '' THEN
    NEW.asset_id := 'AST-' || LPAD(nextval('inventory_asset_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_asset_id
BEFORE INSERT ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.generate_asset_id();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for site-assets (admins upload, public read)
CREATE POLICY "Site assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-assets');

CREATE POLICY "Admins can upload site assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update site assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete site assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete inventory items
CREATE POLICY "Admins can delete inventory"
ON public.inventory FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete calendar events
CREATE POLICY "Admins can delete events"
ON public.calendar_events FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete tasks
CREATE POLICY "Admins can delete tasks"
ON public.tasks FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert user roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update user roles
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete user roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));
