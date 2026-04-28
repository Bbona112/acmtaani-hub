-- Volunteer scoped admin modules (RLS policies)

-- Helper: check if current user is a volunteer and has a module enabled
CREATE OR REPLACE FUNCTION public.has_volunteer_module(_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'volunteer'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.app_settings s
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(s.volunteer_admin_modules) AS x(val)
          WHERE x.val = _module
        )
      )
    );
$$;

-- App settings: allow volunteers (when enabled) to manage settings
DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_settings;
CREATE POLICY "Admins or enabled volunteers manage app settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.has_volunteer_module('master_settings'))
  WITH CHECK (public.has_volunteer_module('master_settings'));

-- Front desk admin tools: visitor form fields + kiosk settings
DROP POLICY IF EXISTS "Admins manage fields" ON public.visitor_form_fields;
CREATE POLICY "Admins or enabled volunteers manage fields"
  ON public.visitor_form_fields FOR ALL TO authenticated
  USING (public.has_volunteer_module('frontdesk_admin_tools'))
  WITH CHECK (public.has_volunteer_module('frontdesk_admin_tools'));

DROP POLICY IF EXISTS "Admins manage kiosk settings" ON public.kiosk_settings;
CREATE POLICY "Admins or enabled volunteers manage kiosk settings"
  ON public.kiosk_settings FOR ALL TO authenticated
  USING (public.has_volunteer_module('frontdesk_admin_tools'))
  WITH CHECK (public.has_volunteer_module('frontdesk_admin_tools'));

-- Assets management
DROP POLICY IF EXISTS "Admins manage assets" ON public.assets;
CREATE POLICY "Admins or enabled volunteers manage assets"
  ON public.assets FOR ALL TO authenticated
  USING (public.has_volunteer_module('assets_admin'))
  WITH CHECK (public.has_volunteer_module('assets_admin'));

-- Inventory management
DROP POLICY IF EXISTS "Admins manage inventory" ON public.inventory;
CREATE POLICY "Admins or enabled volunteers manage inventory"
  ON public.inventory FOR ALL TO authenticated
  USING (public.has_volunteer_module('inventory_admin'))
  WITH CHECK (public.has_volunteer_module('inventory_admin'));

-- Directory admin: profiles + roles
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins or enabled volunteers can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_volunteer_module('directory_admin'))
  WITH CHECK (public.has_volunteer_module('directory_admin'));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins or enabled volunteers can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_volunteer_module('directory_admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins or enabled volunteers can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_volunteer_module('directory_admin'))
  WITH CHECK (public.has_volunteer_module('directory_admin'));

