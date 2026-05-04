import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Battery, BatteryCharging, Laptop, CheckCircle2, AlertCircle,
  MapPin, RefreshCw, Lock, Unlock, Clock, History,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

const REPORT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const HISTORY_INTERVAL_MS = 15 * 60 * 1000; // 15 min snapshots
const LOW_BATTERY_THRESHOLD = 15;

export default function DeviceKiosk() {
  const { tag } = useParams<{ tag: string }>();
  const [asset, setAsset] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [lastSession, setLastSession] = useState<any>(null);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telemetryState, setTelemetryState] = useState<'connected' | 'unsupported' | 'error'>('connected');
  const [time, setTime] = useState(new Date());
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [lockMode, setLockMode] = useState(false);
  const lastReportedRef = useRef<{ level: number; charging: boolean; t: number } | null>(null);
  const lastHistoryRef = useRef<number>(0);
  const lowNotifiedRef = useRef(false);

  const reportBattery = useCallback(async (assetId: string, level: number, charging: boolean, force = false) => {
    const pct = Math.round(level * 100);
    const last = lastReportedRef.current;
    const sigChange = !last || Math.abs(pct - last.level) >= 1 || charging !== last.charging;
    const stale = !last || Date.now() - last.t > REPORT_INTERVAL_MS;
    if (!force && !sigChange && !stale) return;

    await supabase.from('assets').update({
      battery_percent: pct, battery_charging: charging,
      battery_updated_at: new Date().toISOString(),
    }).eq('id', assetId);
    lastReportedRef.current = { level: pct, charging, t: Date.now() };

    // History snapshot every 15 min OR on big change
    if (Date.now() - lastHistoryRef.current > HISTORY_INTERVAL_MS || (last && Math.abs(pct - last.level) >= 5)) {
      await (supabase as any).from('asset_battery_history').insert({ asset_id: assetId, level: pct, charging });
      lastHistoryRef.current = Date.now();
    }

    // Low battery notification once per low-cycle
    if (pct <= LOW_BATTERY_THRESHOLD && !charging && !lowNotifiedRef.current) {
      lowNotifiedRef.current = true;
      const { data: s } = await supabase.from('asset_sessions').select('user_id, issued_by, user_name').eq('asset_id', assetId).is('ended_at', null).maybeSingle();
      const targets = [s?.user_id, s?.issued_by].filter(Boolean) as string[];
      for (const uid of targets) {
        await supabase.from('notifications').insert({
          user_id: uid, type: 'warning',
          title: 'Low battery alert',
          message: `${asset?.name || 'Device'} (${asset?.asset_tag || ''}) is at ${pct}% and not charging`,
          related_id: assetId,
        } as any);
      }
    }
    if (pct > 30 || charging) lowNotifiedRef.current = false;
  }, [asset?.name, asset?.asset_tag]);

  useEffect(() => {
    if (!tag) return;
    let mounted = true;
    let batt: any;
    let interval: any;

    const init = async () => {
      const { data: a } = await supabase.from('assets').select('*').eq('asset_tag', tag.toUpperCase()).maybeSingle();
      if (!mounted) return;
      if (!a) { setError(`No asset with tag ${tag}`); return; }
      setAsset(a);
      const { data: s } = await supabase.from('asset_sessions').select('*').eq('asset_id', a.id).is('ended_at', null).maybeSingle();
      if (s) setSession(s);
      const { data: ls } = await supabase.from('asset_sessions').select('user_name, started_at, ended_at').eq('asset_id', a.id).not('ended_at', 'is', null).order('ended_at', { ascending: false }).limit(1).maybeSingle();
      if (ls) setLastSession(ls);

      if ('getBattery' in navigator) {
        try {
          batt = await (navigator as any).getBattery();
          const send = (force = false) => {
            const lvl = batt.level; const ch = batt.charging;
            setBattery({ level: lvl, charging: ch });
            reportBattery(a.id, lvl, ch, force);
          };
          send(true);
          batt.addEventListener('levelchange', () => send());
          batt.addEventListener('chargingchange', () => send());
          interval = setInterval(() => send(), REPORT_INTERVAL_MS);
        } catch {
          setError('Battery API not available on this device'); setTelemetryState('error');
        }
      } else {
        setError('This browser does not support live battery reporting (try Chrome/Edge on a Chromebook or laptop)');
        setTelemetryState('unsupported');
      }
    };
    init();
    const t = setInterval(() => setTime(new Date()), 1000);

    // Visibility: re-report on return
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && batt && asset?.id) {
        reportBattery(asset.id, batt.level, batt.charging, true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted = false;
      clearInterval(t);
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tag, reportBattery]);

  useEffect(() => {
    if (!asset?.id) return;
    const ch = supabase.channel(`device-${asset.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_sessions', filter: `asset_id=eq.${asset.id}` }, async () => {
        const { data: s } = await supabase.from('asset_sessions').select('*').eq('asset_id', asset.id).is('ended_at', null).maybeSingle();
        setSession(s);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [asset?.id]);

  // Wake lock
  const toggleLock = async () => {
    if (lockMode && wakeLock) {
      await wakeLock.release(); setWakeLock(null); setLockMode(false); return;
    }
    if ('wakeLock' in navigator) {
      try {
        const wl = await (navigator as any).wakeLock.request('screen');
        setWakeLock(wl); setLockMode(true);
      } catch { /* user gesture required or unsupported */ }
    }
  };

  const reportNow = async () => {
    if (!asset?.id) return;
    if ('getBattery' in navigator) {
      const batt = await (navigator as any).getBattery();
      await reportBattery(asset.id, batt.level, batt.charging, true);
    }
  };

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

  const pct = battery ? Math.round(battery.level * 100) : null;
  const healthLabel =
    !battery ? null : battery.charging ? 'Charging' : pct! < 20 ? 'Critical' : pct! < 40 ? 'Low' : 'Healthy';
  const healthColor =
    !battery ? '' : battery.charging ? 'text-[hsl(var(--success))]' : pct! < 20 ? 'text-[hsl(var(--destructive))]' : pct! < 40 ? 'text-[hsl(38,92%,50%)]' : 'text-[hsl(var(--success))]';

  const kioskUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 flex flex-col items-center justify-start p-4 sm:p-8">
      <div className="text-center mb-6">
        <p className="text-5xl sm:text-6xl font-bold tabular-nums">{format(time, 'h:mm:ss a')}</p>
        <p className="text-muted-foreground mt-1">{format(time, 'EEEE, MMMM d, yyyy')}</p>
      </div>

      <div className="w-full max-w-3xl grid gap-4 lg:grid-cols-[1fr,auto]">
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Laptop className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground font-mono">{asset.asset_tag}</p>
                <p className="text-2xl font-bold">{asset.name}</p>
                <p className="text-sm text-muted-foreground capitalize">{asset.asset_type}</p>
                {asset.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{asset.location}</p>}
              </div>
              <Button size="sm" variant={lockMode ? 'default' : 'outline'} onClick={toggleLock} title="Keep screen awake">
                {lockMode ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </Button>
            </div>

            {battery && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    {battery.charging ? <BatteryCharging className="h-5 w-5 text-[hsl(var(--success))]" /> : <Battery className="h-5 w-5" />}
                    <span>Battery</span>
                    <Badge variant="outline" className={healthColor}>{healthLabel}</Badge>
                  </div>
                  <span className="text-3xl font-bold tabular-nums">{pct}%</span>
                </div>
                <Progress value={pct!} className="h-3" />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Reports automatically every 5 minutes and on changes</p>
                  <Button size="sm" variant="ghost" onClick={reportNow}><RefreshCw className="h-3 w-3 mr-1" />Report now</Button>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-muted-foreground">{error}</p>}

            <div className="border-t pt-4">
              {session ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))]" />
                  <div>
                    <p className="text-sm text-muted-foreground">Currently in use by</p>
                    <p className="font-bold text-lg">{session.user_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Since {format(parseISO(session.started_at), 'h:mm a')}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-1">
                  <p className="text-muted-foreground">Available — please return to safe</p>
                  {lastSession && (
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <History className="h-3 w-3" />Last used by {lastSession.user_name} {formatDistanceToNow(parseISO(lastSession.ended_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {asset.notes && (
              <div className="rounded-md border border-dashed p-3 text-xs">
                <p className="font-medium mb-1">Notes</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{asset.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* QR card */}
        <Card className="lg:w-48">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-2">
            <QRCodeSVG value={kioskUrl} size={120} />
            <p className="text-[10px] text-muted-foreground leading-tight">Scan to open this device's live page</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground mt-6 max-w-md text-center">
        Telemetry: {telemetryState}. Battery is reported live where supported (Chromebooks, Chrome/Edge laptops). Safari/Firefox and iPads do not expose battery to web pages.
      </p>
    </div>
  );
}
