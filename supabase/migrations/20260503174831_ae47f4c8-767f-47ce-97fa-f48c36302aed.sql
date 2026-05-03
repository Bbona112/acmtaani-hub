
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS volunteer_admin_modules text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ms_form_url text DEFAULT '';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS ms_forms_mapping jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.volunteer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.volunteer_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.volunteer_group_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.volunteer_groups(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, module_key)
);

ALTER TABLE public.volunteer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_group_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage groups" ON public.volunteer_groups;
DROP POLICY IF EXISTS "Authenticated view groups" ON public.volunteer_groups;
CREATE POLICY "Admins manage groups" ON public.volunteer_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated view groups" ON public.volunteer_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage members" ON public.volunteer_group_members;
DROP POLICY IF EXISTS "Users view own membership" ON public.volunteer_group_members;
CREATE POLICY "Admins manage members" ON public.volunteer_group_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view own membership" ON public.volunteer_group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage group modules" ON public.volunteer_group_modules;
DROP POLICY IF EXISTS "Authenticated view group modules" ON public.volunteer_group_modules;
CREATE POLICY "Admins manage group modules" ON public.volunteer_group_modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated view group modules" ON public.volunteer_group_modules FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_volunteer_groups_updated ON public.volunteer_groups;
CREATE TRIGGER trg_volunteer_groups_updated BEFORE UPDATE ON public.volunteer_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.user_has_module(_user_id uuid, _module_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR (
      public.has_role(_user_id, 'volunteer')
      AND EXISTS (
        SELECT 1 FROM public.app_settings s
        WHERE _module_key = ANY(COALESCE(s.volunteer_admin_modules, ARRAY[]::text[]))
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.volunteer_group_members m
      JOIN public.volunteer_group_modules gm ON gm.group_id = m.group_id
      WHERE m.user_id = _user_id AND gm.module_key = _module_key
    );
$$;

CREATE OR REPLACE FUNCTION public.my_module_keys()
RETURNS TABLE(module_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT mk FROM (
    SELECT unnest(COALESCE(s.volunteer_admin_modules, ARRAY[]::text[])) AS mk
    FROM public.app_settings s
    WHERE public.has_role(auth.uid(), 'volunteer')
    UNION
    SELECT gm.module_key
    FROM public.volunteer_group_members m
    JOIN public.volunteer_group_modules gm ON gm.group_id = m.group_id
    WHERE m.user_id = auth.uid()
  ) t WHERE mk IS NOT NULL;
$$;
