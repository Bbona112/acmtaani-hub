-- Microsoft Forms intake settings + attendance edit audit trail

-- App settings: Microsoft Form link + CSV mapping, plus volunteer module toggles
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ms_form_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ms_forms_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS volunteer_admin_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Attendance edit audit (admins only)
CREATE TABLE IF NOT EXISTS public.attendance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  before jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view attendance audit" ON public.attendance_audit;
CREATE POLICY "Admins view attendance audit"
  ON public.attendance_audit FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins write attendance audit" ON public.attendance_audit;
CREATE POLICY "Admins write attendance audit"
  ON public.attendance_audit FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_audit;

