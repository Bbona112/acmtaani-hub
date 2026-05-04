import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Battery, BatteryCharging, Clock, MapPin, FileText, Activity } from "lucide-react";
import { format, formatDistanceToNow, parseISO, subHours } from "date-fns";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Progress } from "@/components/ui/progress";

export function AssetDetailDrawer({ asset, open, onOpenChange }: { asset: any | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!asset) return;
    (async () => {
      const since = subHours(new Date(), 24).toISOString();
      const [s, h] = await Promise.all([
        supabase.from("asset_sessions").select("*").eq("asset_id", asset.id).order("started_at", { ascending: false }).limit(20),
        (supabase as any).from("asset_battery_history").select("level, charging, recorded_at").eq("asset_id", asset.id).gte("recorded_at", since).order("recorded_at"),
      ]);
      setSessions(s.data || []);
      setHistory(h.data || []);
    })();
  }, [asset?.id]);

  if (!asset) return null;

  const totalMinutes = sessions.reduce((sum, s) => {
    const end = s.ended_at ? parseISO(s.ended_at) : new Date();
    return sum + Math.max(0, (end.getTime() - parseISO(s.started_at).getTime()) / 60000);
  }, 0);

  const userMap: Record<string, number> = {};
  sessions.forEach(s => { userMap[s.user_name] = (userMap[s.user_name] || 0) + 1; });
  const topUsers = Object.entries(userMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const sparklineData = history.map(h => ({ time: format(parseISO(h.recorded_at), "HH:mm"), level: h.level }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{asset.asset_tag}</span>
            <span>{asset.name}</span>
          </SheetTitle>
          <SheetDescription className="capitalize">{asset.asset_type} · {asset.status === "in_use" ? "In Use" : "In Safe"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-5">
          {/* Battery */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {asset.battery_charging ? <BatteryCharging className="h-4 w-4 text-[hsl(var(--success))]" /> : <Battery className="h-4 w-4" />}
                  Battery {asset.battery_charging && "(Charging)"}
                </div>
                <span className="text-2xl font-bold tabular-nums">{asset.battery_percent ?? "—"}%</span>
              </div>
              {asset.battery_percent != null && <Progress value={asset.battery_percent} className="h-2" />}
              {asset.battery_updated_at && (
                <p className="text-xs text-muted-foreground">Updated {formatDistanceToNow(parseISO(asset.battery_updated_at), { addSuffix: true })}</p>
              )}
              {sparklineData.length > 1 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Last 24 hours</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={sparklineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" fontSize={9} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} fontSize={9} width={28} />
                      <Tooltip />
                      <Line dataKey="level" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sessions</p><p className="text-xl font-bold">{sessions.length}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Hours used</p><p className="text-xl font-bold">{Math.round(totalMinutes / 6) / 10}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Unique users</p><p className="text-xl font-bold">{topUsers.length}</p></CardContent></Card>
          </div>

          {/* Meta */}
          <div className="space-y-2 text-sm">
            {asset.serial_number && <div className="flex gap-2"><FileText className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Serial:</span><span className="font-mono">{asset.serial_number}</span></div>}
            {asset.location && <div className="flex gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Location:</span><span>{asset.location}</span></div>}
            {asset.notes && <div className="rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">{asset.notes}</div>}
          </div>

          {/* Top users */}
          {topUsers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Top users</h3>
              <div className="space-y-1">
                {topUsers.map(u => (
                  <div key={u.name} className="flex items-center justify-between text-sm border-b py-1">
                    <span>{u.name}</span><Badge variant="secondary">{u.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock className="h-4 w-4" />Session history</h3>
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="text-xs border-l-2 border-primary/40 pl-3 py-1">
                  <p className="font-medium">{s.user_name}</p>
                  <p className="text-muted-foreground">{format(parseISO(s.started_at), "MMM d, HH:mm")} → {s.ended_at ? format(parseISO(s.ended_at), "HH:mm") : <span className="text-[hsl(var(--success))]">In use</span>}</p>
                  {s.notes && <p className="text-muted-foreground italic mt-0.5">{s.notes}</p>}
                </div>
              ))}
              {sessions.length === 0 && <p className="text-xs text-muted-foreground">No sessions yet</p>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
