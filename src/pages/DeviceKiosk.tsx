import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Battery, BatteryCharging, Laptop, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';

export default function DeviceKiosk() {
  const { tag } = useParams<{ tag: string }>();
  const [asset, setAsset] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telemetryState, setTelemetryState] = useState<'connected' | 'unsupported' | 'error'>('connected');
  const [time, setTime] = useState(new Date());

  const reportBattery = useCallback(async (assetId: string, level: number, charging: boolean) => {
    await supabase.from('assets').update({
      battery_percent: Math.round(level * 100),
      battery_charging: charging,
      battery_updated_at: new Date().toISOString(),
    }).eq('id', assetId);
  }, []);

  useEffect(() => {
    if (!tag) return;
    let mounted = true;
    let batt: any;

    const init = async () => {
      const { data: a } = await supabase.from('assets').select('*').eq('asset_tag', tag.toUpperCase()).maybeSingle();
      if (!mounted) return;
      if (!a) { setError(`No asset with tag ${tag}`); return; }
      setAsset(a);
      const { data: s } = await supabase.from('asset_sessions').select('*').eq('asset_id', a.id).is('ended_at', null).maybeSingle();
      if (s) setSession(s);

      // Web Battery API
      if ('getBattery' in navigator) {
        try {
          batt = await (navigator as any).getBattery();
          const send = () => {
            const lvl = batt.level; const ch = batt.charging;
            setBattery({ level: lvl, charging: ch });
            reportBattery(a.id, lvl, ch);
          };
          send();
          batt.addEventListener('levelchange', send);
          batt.addEventListener('chargingchange', send);
          // Re-report every 60s
          const interval = setInterval(send, 60000);
          return () => clearInterval(interval);
        } catch {
          setError('Battery API not available on this device');
          setTelemetryState('error');
        }
      } else {
        setError('This browser does not support live battery reporting');
        setTelemetryState('unsupported');
      }
    };
    init();
    const t = setInterval(() => setTime(new Date()), 1000);

    // Realtime session updates
    const ch = supabase.channel(`device-${tag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_sessions' }, async () => {
        const { data: s } = await supabase.from('asset_sessions').select('*').eq('asset_id', a.id).is('ended_at', null).maybeSingle();
        setSession(s);
      })
      .subscribe();

    return () => { mounted = false; clearInterval(t); supabase.removeChannel(ch); };
  }, [tag, reportBattery]);

  if (error && !asset) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md"><CardContent className="pt-6 text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <p className="font-bold">{error}</p>
        </CardContent></Card>
      </div>
    );
  }

  if (!asset) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <p className="text-5xl font-bold tabular-nums">{format(time, 'h:mm:ss a')}</p>
        <p className="text-muted-foreground mt-1">{format(time, 'EEEE, MMMM d, yyyy')}</p>
      </div>

      <Card className="w-full max-w-lg">
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Laptop className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-mono">{asset.asset_tag}</p>
              <p className="text-2xl font-bold">{asset.name}</p>
              <p className="text-sm text-muted-foreground capitalize">{asset.asset_type}</p>
              {asset.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{asset.location}</p>}
            </div>
          </div>

          {battery && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {battery.charging ? <BatteryCharging className="h-5 w-5 text-[hsl(var(--success))]" /> : <Battery className="h-5 w-5" />}
                  <span>Battery {battery.charging && '(Charging)'}</span>
                </div>
                <span className="text-2xl font-bold tabular-nums">{Math.round(battery.level * 100)}%</span>
              </div>
              <Progress value={battery.level * 100} className="h-3" />
            </div>
          )}

          {error && <p className="text-xs text-muted-foreground">{error}</p>}
          {!error && <p className="text-xs text-muted-foreground">Telemetry: {telemetryState}</p>}

          <div className="border-t pt-4">
            {session ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))]" />
                <div>
                  <p className="text-sm text-muted-foreground">Currently in use by</p>
                  <p className="font-bold text-lg">{session.user_name}</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground">Available — please return to safe</p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-6">Battery status reported live and translated to simple health indicators in ACMtaani Hub</p>
    </div>
  );
}
