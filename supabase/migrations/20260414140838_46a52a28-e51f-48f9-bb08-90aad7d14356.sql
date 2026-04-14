
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  related_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create duty_roster table
CREATE TABLE public.duty_roster (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  date date NOT NULL,
  shift_start time NOT NULL DEFAULT '09:00',
  shift_end time NOT NULL DEFAULT '17:00',
  role_label text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.duty_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view roster"
  ON public.duty_roster FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage roster"
  ON public.duty_roster FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_duty_roster_updated_at
  BEFORE UPDATE ON public.duty_roster
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create direct_messages table
CREATE TABLE public.direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own DMs"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send DMs"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipients can update DMs"
  ON public.direct_messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

-- Fix security: Change user_roles policies from public to authenticated
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix calendar_events delete policy from public to authenticated
DROP POLICY IF EXISTS "Admins can delete events" ON public.calendar_events;
CREATE POLICY "Admins can delete events"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix inventory delete policy from public to authenticated
DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory;
CREATE POLICY "Admins can delete inventory"
  ON public.inventory FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix tasks delete policy from public to authenticated
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;
CREATE POLICY "Admins can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policy for attendance updates (admin clock-out)
CREATE POLICY "Admins can update all attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Change employee ID prefix from EMP to ACM
ALTER TABLE public.profiles ALTER COLUMN employee_id SET DEFAULT ('ACM-' || lpad((nextval('profiles_employee_id_seq'::regclass))::text, 4, '0'));

CREATE OR REPLACE FUNCTION public.generate_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
    NEW.employee_id := 'ACM-' || LPAD(nextval('profiles_employee_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$;
