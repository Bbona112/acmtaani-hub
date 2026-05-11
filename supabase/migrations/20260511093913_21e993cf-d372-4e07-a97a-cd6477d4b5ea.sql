
-- 1. Kiosk settings: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view kiosk settings" ON public.kiosk_settings;
CREATE POLICY "Authenticated view kiosk settings"
  ON public.kiosk_settings FOR SELECT TO authenticated USING (true);

-- 2. Visitor profiles: drop public SELECT
DROP POLICY IF EXISTS "Anyone can view visitor profiles" ON public.visitor_profiles;

-- 3. Remove visitor_profiles from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.visitor_profiles;

-- 4. Asset updates: anon can only change battery columns
CREATE OR REPLACE FUNCTION public.assets_anon_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'anon' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.asset_tag IS DISTINCT FROM OLD.asset_tag
       OR NEW.asset_type IS DISTINCT FROM OLD.asset_type
       OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.location IS DISTINCT FROM OLD.location
       OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Anonymous updates may only change battery telemetry';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assets_anon_update_guard ON public.assets;
CREATE TRIGGER assets_anon_update_guard
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assets_anon_update_guard();

-- 5. Visitors: anon can only update check_out (kiosk self-checkout)
CREATE OR REPLACE FUNCTION public.visitors_anon_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'anon' THEN
    IF NEW.visitor_name IS DISTINCT FROM OLD.visitor_name
       OR NEW.company IS DISTINCT FROM OLD.company
       OR NEW.host_name IS DISTINCT FROM OLD.host_name
       OR NEW.host_employee_id IS DISTINCT FROM OLD.host_employee_id
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.badge_number IS DISTINCT FROM OLD.badge_number
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.extra_fields::text IS DISTINCT FROM OLD.extra_fields::text
       OR NEW.checked_in_by IS DISTINCT FROM OLD.checked_in_by
       OR NEW.check_in IS DISTINCT FROM OLD.check_in
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.visitor_profile_id IS DISTINCT FROM OLD.visitor_profile_id THEN
      RAISE EXCEPTION 'Anonymous updates may only set check_out';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS visitors_anon_update_guard ON public.visitors;
CREATE TRIGGER visitors_anon_update_guard
  BEFORE UPDATE ON public.visitors
  FOR EACH ROW EXECUTE FUNCTION public.visitors_anon_update_guard();

-- 6. Battery history: drop public insert, require auth
DROP POLICY IF EXISTS "Anyone can record battery history" ON public.asset_battery_history;
CREATE POLICY "Authenticated record battery history"
  ON public.asset_battery_history FOR INSERT TO authenticated WITH CHECK (true);

-- 7. Staff card bucket: make private, restrict SELECT
UPDATE storage.buckets SET public = false WHERE id = 'staff-cards';
DROP POLICY IF EXISTS "Staff cards are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can view staff cards" ON storage.objects;
CREATE POLICY "Authenticated view staff cards"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staff-cards');
