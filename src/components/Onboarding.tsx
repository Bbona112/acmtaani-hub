import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';

export function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    department: profile?.department || '',
    position: profile?.position || '',
    phone: profile?.phone || '',
  });

  const open = !!user && !!profile && profile.onboarding_completed === false;
  const totalSteps = 3;

  const handleNext = async () => {
    if (step < totalSteps) { setStep(step + 1); return; }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ ...form, onboarding_completed: true })
      .eq('user_id', user.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Welcome aboard!', description: 'Your profile is set up.' }); await refreshProfile(); }
    setSaving(false);
  };

  const skip = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('user_id', user.id);
    await refreshProfile();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Welcome to ACMtaani Hub</DialogTitle>
              <DialogDescription>Step {step} of {totalSteps}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex gap-1.5 mt-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        <div className="space-y-4 py-4">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Tell us about you</h3>
              <div className="space-y-1">
                <Label>Full name</Label>
                <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1">
                <Label>Phone (optional)</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+254..." />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Your role at the hub</h3>
              <div className="space-y-1">
                <Label>Department</Label>
                <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering, Operations" />
              </div>
              <div className="space-y-1">
                <Label>Position</Label>
                <Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="e.g. Software Engineer" />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3 text-sm">
              <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> You're all set!</h3>
              <p className="text-muted-foreground">Here's what you can do next:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Clock in from the Attendance page or scan your badge at the kiosk</li>
                <li>• Check your assigned tasks and update progress</li>
                <li>• Browse upcoming events on the Calendar</li>
                <li>• Chat with teammates in the Chat module</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-between">
          <Button variant="ghost" size="sm" onClick={skip}>Skip for now</Button>
          <div className="flex gap-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button onClick={handleNext} disabled={saving}>
              {step === totalSteps ? (saving ? 'Finishing...' : 'Get started') : <>Next <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
