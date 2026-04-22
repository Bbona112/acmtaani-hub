import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  rows_per_page: number;
  battery_stale_after_minutes: number;
  enable_guided_tour: boolean;
  enable_manual_page: boolean;
  enable_advanced_analytics: boolean;
  default_checkout_location: string;
};

export const defaultAppSettings: AppSettings = {
  rows_per_page: 10,
  battery_stale_after_minutes: 20,
  enable_guided_tour: true,
  enable_manual_page: true,
  enable_advanced_analytics: true,
  default_checkout_location: "",
};

export async function getAppSettings(): Promise<AppSettings> {
  const { data } = await (supabase as any)
    .from("app_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (!data) return defaultAppSettings;
  return {
    rows_per_page: data.rows_per_page ?? 10,
    battery_stale_after_minutes: data.battery_stale_after_minutes ?? 20,
    enable_guided_tour: data.enable_guided_tour ?? true,
    enable_manual_page: data.enable_manual_page ?? true,
    enable_advanced_analytics: data.enable_advanced_analytics ?? true,
    default_checkout_location: data.default_checkout_location ?? "",
  };
}
