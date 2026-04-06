
-- Create visitors table for front desk management
CREATE TABLE public.visitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_name TEXT NOT NULL,
  company TEXT DEFAULT '',
  host_employee_id UUID,
  host_name TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  check_in TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  check_out TIMESTAMP WITH TIME ZONE,
  checked_in_by UUID,
  badge_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

-- Policies: any authenticated user can manage visitors (front desk staff)
CREATE POLICY "Authenticated users can view visitors"
  ON public.visitors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create visitor records"
  ON public.visitors FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update visitor records"
  ON public.visitors FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Admins can delete visitor records"
  ON public.visitors FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
