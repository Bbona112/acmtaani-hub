-- Admin utilities for operational resets and sequence re-numbering

-- Ensure staff-cards bucket exists for environments missing earlier migrations
INSERT INTO storage.buckets (id, name, public)
SELECT 'staff-cards', 'staff-cards', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'staff-cards'
);

CREATE OR REPLACE FUNCTION public.reset_asset_tag_numbering()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run this reset';
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
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run this reset';
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
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run this reset';
  END IF;

  TRUNCATE TABLE public.visitors RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.visitor_profiles RESTART IDENTITY CASCADE;
  PERFORM setval('visitors_badge_seq', 1, false);
  PERFORM setval('visitor_profiles_badge_seq', 1, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_asset_tag_numbering() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_inventory_asset_id_numbering() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_front_desk_data() TO authenticated;
