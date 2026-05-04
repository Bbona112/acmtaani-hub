
DROP VIEW IF EXISTS public.asset_health_v;
CREATE VIEW public.asset_health_v
WITH (security_invoker = true) AS
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
