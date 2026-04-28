import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, QrCode, Clock, CheckCircle2, XCircle, Maximize, Keyboard } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ScanResult {
  type: 'clock_in' | 'clock_out' | 'error';
  name: string;
  message: string;
  time: string;
}

export default function Kiosk() {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const processQR = useCallback(async (decodedText: string) => {
    if (processingRef.current) return;
    if (!decodedText.startsWith('EMS:')) return;

    processingRef.current = true;
    const userId = decodedText.replace('EMS:', '');

    try {
      await clockToggleByUserId(userId);
    } catch {
      setLastResult({ type: 'error', name: '', message: 'Something went wrong', time: format(new Date(), 'h:mm:ss a') });
    }

    setTimeout(() => { processingRef.current = false; }, 3000);
  }, []);

  const clockToggleByUserId = async (userId: string) => {
    const { data: profile } = await supabase
      .from('directory_profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile) {
      setLastResult({ type: 'error', name: '', message: 'Member not found', time: format(new Date(), 'h:mm:ss a') });
      return;
    }

    const { data: activeSession } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession) {
      const now = new Date();
      const clockInTime = new Date(activeSession.clock_in);
      const hours = ((now.getTime() - clockInTime.getTime()) / 3600000).toFixed(2);
      await supabase
        .from('attendance')
        .update({ clock_out: now.toISOString(), hours_worked: parseFloat(hours) })
        .eq('id', activeSession.id);

      setLastResult({
        type: 'clock_out',
        name: profile.full_name,
        message: `Clocked out — ${hours} hours worked`,
        time: format(now, 'h:mm:ss a'),
      });
      return;
    }

    await supabase.from('attendance').insert({ user_id: userId });
    setLastResult({
      type: 'clock_in',
      name: profile.full_name,
      message: 'Clocked in successfully',
      time: format(new Date(), 'h:mm:ss a'),
    });
  };

  const submitManual = async () => {
    if (processingRef.current) return;
    const raw = manualInput.trim();
    if (!raw) return;

    processingRef.current = true;
    try {
      // Allow pasting EMS:<userId> as well
      if (raw.startsWith('EMS:')) {
        await clockToggleByUserId(raw.replace('EMS:', ''));
        setManualInput('');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .eq('employee_id', raw)
        .maybeSingle();

      if (!profile?.user_id) {
        setLastResult({ type: 'error', name: '', message: 'Employee ID not found', time: format(new Date(), 'h:mm:ss a') });
        return;
      }
      await clockToggleByUserId(profile.user_id);
      setManualInput('');
    } catch {
      setLastResult({ type: 'error', name: '', message: 'Something went wrong', time: format(new Date(), 'h:mm:ss a') });
    } finally {
      setTimeout(() => { processingRef.current = false; }, 3000);
    }
  };

  const startScanning = useCallback(async () => {
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => processQR(decodedText),
        () => undefined
      );
      setScanning(true);
    } catch (err) {
      console.error('Camera error:', err);
    }
  }, [processQR]);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch {
        // ignore stop errors
      }
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => { stopScanning(); };
  }, [stopScanning]);

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative">
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <Building2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold">ACMtaani Kiosk</span>
      </div>

      <Button variant="ghost" size="icon" className="absolute top-6 right-6" onClick={goFullscreen}>
        <Maximize className="h-5 w-5" />
      </Button>

      <div className="text-center mb-8">
        <p className="text-6xl font-bold tracking-tight">{format(currentTime, 'h:mm:ss a')}</p>
        <p className="text-xl text-muted-foreground mt-2">{format(currentTime, 'EEEE, MMMM d, yyyy')}</p>
      </div>

      <Card className="w-full max-w-md border-border/50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={mode === 'manual' ? 'default' : 'outline'}
              onClick={() => { setMode('manual'); stopScanning(); }}
            >
              <Keyboard className="h-4 w-4 mr-2" /> Manual
            </Button>
            <Button
              className="flex-1"
              variant={mode === 'scan' ? 'default' : 'outline'}
              onClick={() => setMode('scan')}
            >
              <QrCode className="h-4 w-4 mr-2" /> Scan
            </Button>
          </div>

          {mode === 'manual' ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>Enter Employee ID</Label>
                <Input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitManual()}
                  placeholder="e.g. EMP-0012"
                  className="h-12 text-lg text-center font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Press Enter to clock in/out. (You can also paste an <code className="px-1 bg-muted rounded">EMS:&lt;id&gt;</code> code.)
                </p>
              </div>
              <Button onClick={submitManual} className="w-full" size="lg">Submit</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <QrCode className="h-5 w-5" />
                <span className="font-medium">Scan Your Badge</span>
              </div>

              <div id="qr-reader" className="w-full aspect-square max-h-[300px] rounded-lg overflow-hidden bg-muted" />

              {!scanning ? (
                <Button onClick={startScanning} className="w-full" size="lg">
                  <QrCode className="h-5 w-5 mr-2" /> Start Scanner
                </Button>
              ) : (
                <Button onClick={stopScanning} variant="outline" className="w-full" size="lg">
                  Stop Scanner
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card className={`w-full max-w-md mt-6 border-2 ${
          lastResult.type === 'clock_in' ? 'border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/5' :
          lastResult.type === 'clock_out' ? 'border-primary/50 bg-primary/5' :
          'border-destructive/50 bg-destructive/5'
        }`}>
          <CardContent className="pt-6 flex items-start gap-4">
            {lastResult.type === 'clock_in' && <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))] shrink-0 mt-0.5" />}
            {lastResult.type === 'clock_out' && <Clock className="h-8 w-8 text-primary shrink-0 mt-0.5" />}
            {lastResult.type === 'error' && <XCircle className="h-8 w-8 text-destructive shrink-0 mt-0.5" />}
            <div>
              {lastResult.name && <p className="text-xl font-bold">{lastResult.name}</p>}
              <p className="text-muted-foreground">{lastResult.message}</p>
              <Badge variant="secondary" className="mt-2">{lastResult.time}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground mt-8">
        Hold your badge QR code in front of the camera to clock in or out
      </p>
    </div>
  );
}
