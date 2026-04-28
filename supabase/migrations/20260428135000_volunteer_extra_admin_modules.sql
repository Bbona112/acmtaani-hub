-- Extend volunteer module access to attendance admin and reset tools.

-- Attendance: allow enabled volunteers to update all attendance (for corrections)
DROP POLICY IF EXISTS "Admins can update all attendance" ON public.attendance;
CREATE POLICY "Admins or enabled volunteers can update all attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (public.has_volunteer_module('attendance_admin'));

-- Attendance audit: allow enabled volunteers to read/write audit rows
DROP POLICY IF EXISTS "Admins view attendance audit" ON public.attendance_audit;
CREATE POLICY "Admins or enabled volunteers view attendance audit"
  ON public.attendance_audit FOR SELECT TO authenticated
  USING (public.has_volunteer_module('attendance_admin'));

DROP POLICY IF EXISTS "Admins write attendance audit" ON public.attendance_audit;
CREATE POLICY "Admins or enabled volunteers write attendance audit"
  ON public.attendance_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_volunteer_module('attendance_admin'));

-- Reset tools: allow enabled volunteers to run reset RPCs
CREATE OR REPLACE FUNCTION public.reset_asset_tag_numbering()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_volunteer_module('reset_tools') THEN
    RAISE EXCEPTION 'Only admins or enabled volunteers can run this reset';
  END IF;

  PERFORM setval('assets_tag_seq', 1, false);

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.assets
  )
  UPDATE public.assets a
  SET asset_tag = UPPER(LEFT(a.asset_type, 2)) || '-' || LPAD(r.rn::text, 4, '0')
  FROM ranked r
  WHERE a.id = r.id;

  PERFORM setval('assets_tag_seq', COALESCE((SELECT count(*) FROM public.assets), 0) + 1, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_inventory_asset_id_numbering()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_volunteer_module('reset_tools') THEN
    RAISE EXCEPTION 'Only admins or enabled volunteers can run this reset';
  END IF;

  PERFORM setval('inventory_asset_id_seq', 1, false);

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.inventory
  )
  UPDATE public.inventory i
  SET asset_id = 'AST-' || LPAD(r.rn::text, 4, '0')
  FROM ranked r
  WHERE i.id = r.id;

  PERFORM setval('inventory_asset_id_seq', COALESCE((SELECT count(*) FROM public.inventory), 0) + 1, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_front_desk_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_volunteer_module('reset_tools') THEN
    RAISE EXCEPTION 'Only admins or enabled volunteers can run this reset';
  END IF;

  TRUNCATE TABLE public.visitors RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.visitor_profiles RESTART IDENTITY CASCADE;
  PERFORM setval('visitors_badge_seq', 1, false);
  PERFORM setval('visitor_profiles_badge_seq', 1, false);
END;
$$;

