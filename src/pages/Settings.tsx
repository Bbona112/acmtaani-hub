import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [form, setForm] = useState({
    rows_per_page: 10,
    battery_stale_after_minutes: 20,
    enable_guided_tour: true,
    enable_manual_page: true,
    enable_advanced_analytics: true,
    default_checkout_location: "",
  });

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("app_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setForm({
          rows_per_page: data.rows_per_page ?? 10,
          battery_stale_after_minutes: data.battery_stale_after_minutes ?? 20,
          enable_guided_tour: data.enable_guided_tour ?? true,
          enable_manual_page: data.enable_manual_page ?? true,
          enable_advanced_analytics: data.enable_advanced_analytics ?? true,
          default_checkout_location: data.default_checkout_location ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (role !== "admin") return;
    const payload = { ...form, updated_by: user?.id };
    if (settingsId) {
      await (supabase as any).from("app_settings").update(payload).eq("id", settingsId);
    } else {
      const { data } = await (supabase as any).from("app_settings").insert(payload).select().single();
      if (data?.id) setSettingsId(data.id);
    }
    toast({ title: "Settings saved" });
  };

  if (loading) return <p className="text-muted-foreground">Loading settings...</p>;
  if (role !== "admin") return <p className="text-muted-foreground">Only admins can access settings.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Master Settings</h1>
        <p className="text-muted-foreground mt-1">Global controls for analytics, tours, tables, and operations</p>
      </div>
      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Rows Per View</Label>
            <Input type="number" min={5} max={100} value={form.rows_per_page} onChange={(e) => setForm({ ...form, rows_per_page: Number(e.target.value) || 10 })} />
          </div>
          <div className="space-y-2">
            <Label>Battery Stale Threshold (minutes)</Label>
            <Input type="number" min={5} max={120} value={form.battery_stale_after_minutes} onChange={(e) => setForm({ ...form, battery_stale_after_minutes: Number(e.target.value) || 20 })} />
          </div>
          <div className="space-y-2">
            <Label>Default Checkout Location</Label>
            <Input value={form.default_checkout_location} onChange={(e) => setForm({ ...form, default_checkout_location: e.target.value })} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Feature Toggles</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between"><Label>Enable Guided Tour</Label><Switch checked={form.enable_guided_tour} onCheckedChange={(v) => setForm({ ...form, enable_guided_tour: v })} /></div>
          <div className="flex items-center justify-between"><Label>Enable Manual Page</Label><Switch checked={form.enable_manual_page} onCheckedChange={(v) => setForm({ ...form, enable_manual_page: v })} /></div>
          <div className="flex items-center justify-between"><Label>Enable Advanced Analytics</Label><Switch checked={form.enable_advanced_analytics} onCheckedChange={(v) => setForm({ ...form, enable_advanced_analytics: v })} /></div>
        </CardContent>
      </Card>
      <Button onClick={save}>Save Settings</Button>
    </div>
  );
}
