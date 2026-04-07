
-- Fix overly permissive INSERT policy on visitors
DROP POLICY IF EXISTS "Authenticated users can create visitor records" ON public.visitors;
CREATE POLICY "Authenticated users can create visitor records" ON public.visitors FOR INSERT TO authenticated WITH CHECK (auth.uid() = checked_in_by);

-- Fix overly permissive UPDATE policy on visitors
DROP POLICY IF EXISTS "Authenticated users can update visitor records" ON public.visitors;
CREATE POLICY "Admins can update visitor records" ON public.visitors FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
