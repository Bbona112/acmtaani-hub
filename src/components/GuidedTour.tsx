import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const TOUR_STEPS = [
  "Dashboard: see live KPIs for attendance, tasks, inventory, visitors, and alerts.",
  "Front Desk: fast visitor check-in/out, return visitor search, and badge handling.",
  "Assets and Inventory: issue/return trackable devices and consumables with history.",
  "Duty Roster and Calendar: plan shifts and events, then track execution.",
  "Profile and Manual: update your profile, view staff card, and open the full app manual.",
];

export function GuidedTour() {
  const { user, profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const stepText = useMemo(() => TOUR_STEPS[step] ?? TOUR_STEPS[0], [step]);

  const completeTour = async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ tour_completed: true, tour_step: "completed" } as any)
      .eq("user_id", user.id);
    await refreshProfile();
    setOpen(false);
    setStep(0);
  };

  const startTour = () => {
    setStep(0);
    setOpen(true);
  };

  if (!profile) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={startTour}>
        Start App Tour
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>App Tour ({step + 1}/{TOUR_STEPS.length})</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{stepText}</p>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              Back
            </Button>
            {step < TOUR_STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={completeTour}>Finish</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
