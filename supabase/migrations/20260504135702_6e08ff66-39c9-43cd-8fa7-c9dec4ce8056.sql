
-- Battery history
CREATE TABLE IF NOT EXISTS public.asset_battery_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  level integer NOT NULL,
  charging boolean,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abh_asset_time ON public.asset_battery_history(asset_id, recorded_at DESC);
ALTER TABLE public.asset_battery_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record battery history"
  ON public.asset_battery_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated view battery history"
  ON public.asset_battery_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage battery history"
  ON public.asset_battery_history FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Task comments
CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tc_task_time ON public.task_comments(task_id, created_at DESC);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view comments"
  ON public.task_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users add own comments"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own comments"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own comments"
  ON public.task_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage comments"
  ON public.task_comments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_tc_updated BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Asset health view
CREATE OR REPLACE VIEW public.asset_health_v AS
SELECT
  a.id,
  a.asset_tag,
  a.name,
  a.asset_type,
  a.status,
  a.battery_percent,
  a.battery_charging,
  a.battery_updated_at,
  CASE
    WHEN a.asset_type = 'ipad' THEN 'unsupported'
    WHEN a.battery_updated_at IS NULL THEN 'unsupported'
    WHEN EXTRACT(EPOCH FROM (now() - a.battery_updated_at))/60
         > COALESCE((SELECT battery_stale_after_minutes FROM public.app_settings LIMIT 1), 20) THEN 'stale'
    WHEN a.battery_charging THEN 'charging'
    WHEN a.battery_percent < 20 THEN 'critical'
    WHEN a.battery_percent < 40 THEN 'low'
    ELSE 'healthy'
  END AS battery_health,
  CASE WHEN a.battery_updated_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (now() - a.battery_updated_at))/60
    ELSE NULL END AS minutes_since_update
FROM public.assets a;

ALTER TABLE public.asset_battery_history REPLICA IDENTITY FULL;
ALTER TABLE public.task_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_battery_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
