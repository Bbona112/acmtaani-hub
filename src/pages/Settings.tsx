import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";

type VisitorFieldRow = Database["public"]["Tables"]["visitor_form_fields"]["Row"];
type AppSettingsRow = Database["public"]["Tables"]["app_settings"]["Row"] & {
  ms_form_url?: string;
  volunteer_admin_modules?: string[];
};

const VOLUNTEER_MODULES: { key: string; label: string; description: string }[] = [
  { key: "master_settings", label: "Master Settings", description: "Allow access to the Master Settings page and saving settings." },
  { key: "frontdesk_admin_tools", label: "Front Desk Admin Tools", description: "Allow managing visitor form fields and kiosk settings." },
  { key: "attendance_admin", label: "Attendance Admin", description: "Allow viewing and editing attendance for all staff (with audit trail)." },
  { key: "assets_admin", label: "Assets Admin", description: "Allow adding/editing/deleting trackable assets." },
  { key: "inventory_admin", label: "Inventory Admin", description: "Allow adding/editing/deleting inventory items." },
  { key: "directory_admin", label: "Directory Admin", description: "Allow editing employee profiles and changing roles." },
  { key: "reset_tools", label: "Reset Tools", description: "Allow running operational reset tools (destructive)." },
];

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
    ms_form_url: "",
  });
  const [volunteerModules, setVolunteerModules] = useState<string[]>([]);
  const [kiosk, setKiosk] = useState({ id: "", exit_pin: "1234", google_sheet_url: "" });
  const [fields, setFields] = useState<VisitorFieldRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("*").limit(1).maybeSingle();
      if (data) {
        const row = data as AppSettingsRow;
        setSettingsId(data.id);
        setForm({
          rows_per_page: data.rows_per_page ?? 10,
          battery_stale_after_minutes: data.battery_stale_after_minutes ?? 20,
          enable_guided_tour: data.enable_guided_tour ?? true,
          enable_manual_page: data.enable_manual_page ?? true,
          enable_advanced_analytics: data.enable_advanced_analytics ?? true,
          default_checkout_location: data.default_checkout_location ?? "",
          ms_form_url: data.ms_form_url ?? "",
        });
        setVolunteerModules(Array.isArray(row.volunteer_admin_modules) ? row.volunteer_admin_modules : []);
      }
      const { data: kioskData } = await supabase.from("kiosk_settings").select("*").limit(1).maybeSingle();
      if (kioskData) setKiosk({ id: kioskData.id, exit_pin: kioskData.exit_pin, google_sheet_url: kioskData.google_sheet_url || "" });
      const { data: formFields } = await supabase.from("visitor_form_fields").select("*").order("display_order");
      if (formFields) setFields(formFields);
      setLoading(false);
    })();
  }, []);

  const canManageSettings = role === "admin" || (role === "volunteer" && volunteerModules.includes("master_settings"));
  const canUseResetTools = role === "admin" || (role === "volunteer" && volunteerModules.includes("reset_tools"));

  const save = async () => {
    if (!canManageSettings) return;
    const payload = { ...form, volunteer_admin_modules: volunteerModules, updated_by: user?.id };
    if (settingsId) {
      await supabase.from("app_settings").update(payload as never).eq("id", settingsId);
    } else {
      const { data } = await supabase.from("app_settings").insert(payload as never).select().single();
      if (data?.id) setSettingsId(data.id);
    }
    await supabase.from("kiosk_settings").update({
      exit_pin: kiosk.exit_pin,
      google_sheet_url: kiosk.google_sheet_url,
      updated_by: user?.id,
    }).eq("id", kiosk.id);
    toast({ title: "Settings saved" });
  };

  const toggleField = async (id: string, key: "enabled" | "required", value: boolean) => {
    await supabase.from("visitor_form_fields").update({ [key]: value } as never).eq("id", id);
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  };

  const runReset = async (fnName: "reset_asset_tag_numbering" | "reset_inventory_asset_id_numbering" | "reset_front_desk_data", confirmText: string) => {
    if (!confirm(confirmText)) return;
    const { error } = await supabase.rpc(fnName);
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reset complete" });
  };

  if (loading) return <p className="text-muted-foreground">Loading settings...</p>;
  if (!canManageSettings) return <p className="text-muted-foreground">You do not have permission to access Master Settings.</p>;

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
        <CardHeader><CardTitle>Kiosk and Visitor Intake</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Microsoft Form URL (Visitor check-in)</Label>
            <Input
              value={form.ms_form_url}
              onChange={(e) => setForm({ ...form, ms_form_url: e.target.value })}
              placeholder="https://forms.office.com/..."
            />
            <p className="text-xs text-muted-foreground">
              Front Desk will display this link/QR so visitors can sign in using Microsoft Forms.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Kiosk Exit PIN</Label>
            <Input value={kiosk.exit_pin} onChange={(e) => setKiosk({ ...kiosk, exit_pin: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Google Sheet Webhook URL</Label>
            <Input value={kiosk.google_sheet_url} onChange={(e) => setKiosk({ ...kiosk, google_sheet_url: e.target.value })} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell>{field.field_label}</TableCell>
                  <TableCell><Switch checked={field.required} onCheckedChange={(v) => toggleField(field.id, "required", v)} /></TableCell>
                  <TableCell><Switch checked={field.enabled} onCheckedChange={(v) => toggleField(field.id, "enabled", v)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      <Card>
        <CardHeader><CardTitle>Volunteer Admin Module Access</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose which admin-level modules volunteers are allowed to access. This is enforced in the UI and database policies.
          </p>
          <div className="space-y-3">
            {VOLUNTEER_MODULES.map((m) => (
              <div key={m.key} className="flex items-start justify-between gap-4 p-3 border rounded">
                <div className="space-y-1">
                  <p className="font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{m.key}</p>
                </div>
                <Switch
                  checked={volunteerModules.includes(m.key)}
                  onCheckedChange={(v) => {
                    setVolunteerModules((prev) => (
                      v ? Array.from(new Set([...prev, m.key])) : prev.filter((x) => x !== m.key)
                    ));
                  }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {canUseResetTools && (
        <Card>
          <CardHeader><CardTitle>Admin Reset Tools</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => runReset("reset_asset_tag_numbering", "Reset and re-number all asset tags?")}
            >
              Reset Asset Tag Numbering
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => runReset("reset_inventory_asset_id_numbering", "Reset and re-number all inventory Asset IDs?")}
            >
              Reset Inventory Asset ID Numbering
            </Button>
            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={() => runReset("reset_front_desk_data", "Delete all front-desk visitor data and reset badges?")}
            >
              Reset Front Desk Data
            </Button>
          </CardContent>
        </Card>
      )}
      <Button onClick={save}>Save Settings</Button>
    </div>
  );
}
