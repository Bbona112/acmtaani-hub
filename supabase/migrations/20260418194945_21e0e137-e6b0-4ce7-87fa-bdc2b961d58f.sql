-- ============ TASKS upgrades ============
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Validation triggers (no CHECK constraints on mutable fields)
CREATE OR REPLACE FUNCTION public.validate_task_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.priority NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'priority must be low, medium, or high';
  END IF;
  IF NEW.progress < 0 OR NEW.progress > 100 THEN
    RAISE EXCEPTION 'progress must be between 0 and 100';
  END IF;
  IF NEW.approval_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'approval_status must be pending, approved, or rejected';
  END IF;
  -- Auto-set progress to 100 when marked done
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.progress = 100;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_task_fields_trigger ON public.tasks;
CREATE TRIGGER validate_task_fields_trigger
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_task_fields();

-- ============ ONBOARDING flag ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- ============ SECURITY FIX: profiles ============
-- Drop overly permissive policy
DROP POLICY IF EXISTS "Anyone authenticated can view profiles" ON public.profiles;

-- Users can see their own full profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Safe directory view (no email/phone/employee_id) for cross-user lookups
CREATE OR REPLACE VIEW public.directory_profiles
WITH (security_invoker = on) AS
  SELECT id, user_id, full_name, avatar_url, department, position, created_at
  FROM public.profiles;

GRANT SELECT ON public.directory_profiles TO authenticated;

-- Allow authenticated users to read non-sensitive columns via the view
-- (they can also still read full rows for their own profile + admins via existing policies)
CREATE POLICY "Authenticated can view directory-safe columns"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);
-- NOTE: we keep a permissive base policy because the view uses security_invoker.
-- The real protection comes from the app reading the view in directory contexts.
-- Drop it and replace with a stricter pattern:
DROP POLICY IF EXISTS "Authenticated can view directory-safe columns" ON public.profiles;

-- Final policy: users see own row; admins see all
-- (own-row policy already created above, admin policy already exists)

-- ============ SECURITY FIX: notifications ============
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Users can create own notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can create any notification"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Edge function (service role) bypasses RLS automatically.

-- ============ SECURITY FIX: visitors ============
DROP POLICY IF EXISTS "Authenticated users can view visitors" ON public.visitors;

CREATE POLICY "Admins can view all visitors"
  ON public.visitors FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view visitors they checked in"
  ON public.visitors FOR SELECT TO authenticated
  USING (auth.uid() = checked_in_by);