
-- Add volunteer to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'volunteer';

-- Inventory items table
CREATE TABLE public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  available_quantity INTEGER NOT NULL DEFAULT 1,
  location TEXT DEFAULT '',
  requires_checkout BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage inventory" ON public.inventory FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inventory checkouts table
CREATE TABLE public.inventory_checkouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  checked_out_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  returned_at TIMESTAMP WITH TIME ZONE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own checkouts" ON public.inventory_checkouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all checkouts" ON public.inventory_checkouts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create checkouts" ON public.inventory_checkouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own checkouts" ON public.inventory_checkouts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage checkouts" ON public.inventory_checkouts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view messages" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can send messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Calendar events table
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT DEFAULT '',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view events" ON public.calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage events" ON public.calendar_events FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
