import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2, UserPlus, LogOut, CheckCircle2, X } from 'lucide-react';
import { format } from 'date-fns';

export default function VisitorKiosk() {
  const { toast } = useToast();
  const [fields, setFields] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);
  const [mode, setMode] = useState<'idle' | 'checkin' | 'checkout'>('idle');
  const [exitOpen, setExitOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [checkoutBadge, setCheckoutBadge] = useState('');

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    supabase.from('visitor_form_fields').select('*').eq('enabled', true).order('display_order').then(({ data }) => {
      if (data) setFields(data);
    });
    const { data } = supabase.storage.from('site-assets').getPublicUrl('logo.png');
    fetch(data.publicUrl, { method: 'HEAD' }).then(r => { if (r.ok) setLogoUrl(data.publicUrl); }).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const submitCheckIn = async () => {
    const reqMissing = fields.filter(f => f.required && !form[f.field_key]?.trim());
    if (reqMissing.length) { toast({ title: 'Required', description: reqMissing[0].field_label, variant: 'destructive' }); return; }
    const { visitor_name = '', company = '', host_name = '', purpose = '', phone = '', ...extras } = form;
    const { data, error } = await supabase.from('visitors').insert({
      visitor_name, company, host_name, purpose, phone, extra_fields: extras, source: 'kiosk',
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setSuccess(data); setForm({});
    const { data: settings } = await supabase.from('kiosk_settings').select('google_sheet_url').limit(1).maybeSingle();
    if (settings?.google_sheet_url) {
      try {
        await fetch(settings.google_sheet_url, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, kind: 'check_in' }),
        });
      } catch {}
    }
    setTimeout(() => { setSuccess(null); setMode('idle'); }, 8000);
  };

  const submitCheckOut = async () => {
    if (!checkoutBadge.trim()) return;
    const { data: v } = await supabase.from('visitors').select('*').eq('badge_number', checkoutBadge.trim().toUpperCase()).is('check_out', null).maybeSingle();
    if (!v) { toast({ title: 'Badge not found or already checked out', variant: 'destructive' }); return; }
    await supabase.from('visitors').update({ check_out: new Date().toISOString() }).eq('id', v.id);
    setSuccess({ ...v, check_out: new Date().toISOString() });
    setCheckoutBadge('');
    setTimeout(() => { setSuccess(null); setMode('idle'); }, 5000);
  };

  const tryExit = async () => {
    const { data } = await supabase.from('kiosk_settings').select('exit_pin').limit(1).maybeSingle();
    if (pinInput === (data?.exit_pin || '1234')) { window.location.href = '/'; }
    else { toast({ title: 'Incorrect PIN', variant: 'destructive' }); setPinInput(''); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <header className="flex items-center justify-between p-6">
        <div className="flex items-center gap-3">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-contain bg-white p-1" />
            : <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center"><Building2 className="h-6 w-6 text-primary-foreground" /></div>}
          <div>
            <p className="text-2xl font-bold">ACMtaani Hub</p>
            <p className="text-sm text-muted-foreground">Visitor Kiosk</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{format(currentTime, 'h:mm a')}</p>
          <p className="text-xs text-muted-foreground">{format(currentTime, 'EEEE, MMMM d')}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setExitOpen(true)}><X className="h-5 w-5" /></Button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        {success ? (
          <Card className="w-full max-w-lg border-2 border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/5">
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <CheckCircle2 className="h-16 w-16 text-[hsl(var(--success))] mx-auto" />
              <h2 className="text-3xl font-bold">{success.check_out ? 'Goodbye!' : 'Welcome!'}</h2>
              <p className="text-xl">{success.visitor_name}</p>
              {!success.check_out && (
                <>
                  <p className="text-muted-foreground">Your badge number is</p>
                  <p className="text-4xl font-mono font-bold tracking-wider">{success.badge_number}</p>
                  <p className="text-sm text-muted-foreground">Please remember this for check-out</p>
                </>
              )}
            </CardContent>
          </Card>
        ) : mode === 'idle' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
            <Card className="cursor-pointer hover:border-primary transition-all hover:shadow-lg" onClick={() => setMode('checkin')}>
              <CardContent className="pt-12 pb-12 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Check In</h3>
                <p className="text-muted-foreground">New visitor arrival</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary transition-all hover:shadow-lg" onClick={() => setMode('checkout')}>
              <CardContent className="pt-12 pb-12 text-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <LogOut className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Check Out</h3>
                <p className="text-muted-foreground">Leaving the building</p>
              </CardContent>
            </Card>
          </div>
        ) : mode === 'checkin' ? (
          <Card className="w-full max-w-xl">
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-2xl font-bold">Welcome — please sign in</h2>
              {fields.map(f => (
                <div key={f.id} className="space-y-1">
                  <Label className="text-base">{f.field_label}{f.required && ' *'}</Label>
                  <Input className="h-12 text-lg" type={f.field_type} value={form[f.field_key] || ''} onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })} />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { setMode('idle'); setForm({}); }} className="flex-1 h-12">Cancel</Button>
                <Button onClick={submitCheckIn} className="flex-1 h-12">Check In</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-2xl font-bold">Check Out</h2>
              <div className="space-y-1">
                <Label>Enter your badge number</Label>
                <Input className="h-14 text-2xl text-center font-mono tracking-wider" placeholder="V-00001" value={checkoutBadge} onChange={(e) => setCheckoutBadge(e.target.value.toUpperCase())} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode('idle')} className="flex-1 h-12">Cancel</Button>
                <Button onClick={submitCheckOut} className="flex-1 h-12">Check Out</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={exitOpen} onOpenChange={(o) => { setExitOpen(o); if (!o) setPinInput(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Exit Kiosk Mode</DialogTitle></DialogHeader>
          <Input type="password" placeholder="PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryExit()} className="h-12 text-center text-xl" />
          <Button onClick={tryExit} className="w-full">Exit</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
