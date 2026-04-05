import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';

export default function Attendance() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadRecords = async () => {
    if (!user) return;
    const query = role === 'admin'
      ? supabase.from('attendance').select('*, profiles!attendance_user_id_fkey(full_name)').order('clock_in', { ascending: false }).limit(50)
      : supabase.from('attendance').select('*').eq('user_id', user.id).order('clock_in', { ascending: false }).limit(50);
    const { data } = await query;
    if (data) {
      setRecords(data);
      const active = data.find((r: any) => r.user_id === user.id && !r.clock_out);
      setActiveSession(active || null);
    }
  };

  useEffect(() => { loadRecords(); }, [user, role]);

  const clockIn = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('attendance').insert({ user_id: user.id });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Clocked in!' });
    await loadRecords();
    setLoading(false);
  };

  const clockOut = async () => {
    if (!activeSession) return;
    setLoading(true);
    const now = new Date();
    const clockInTime = new Date(activeSession.clock_in);
    const hours = ((now.getTime() - clockInTime.getTime()) / 3600000).toFixed(2);
    const { error } = await supabase
      .from('attendance')
      .update({ clock_out: now.toISOString(), hours_worked: parseFloat(hours) })
      .eq('id', activeSession.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Clocked out!', description: `${hours} hours worked` });
    await loadRecords();
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'admin' ? 'View all staff attendance' : 'Track your daily attendance'}
          </p>
        </div>
        <div className="flex gap-2">
          {!activeSession ? (
            <Button onClick={clockIn} disabled={loading}>
              <LogIn className="h-4 w-4 mr-2" /> Clock In
            </Button>
          ) : (
            <Button onClick={clockOut} disabled={loading} variant="outline">
              <LogOut className="h-4 w-4 mr-2" /> Clock Out
            </Button>
          )}
        </div>
      </div>

      {activeSession && (
        <Card className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-[hsl(var(--success))]" />
            <span className="font-medium">Currently clocked in since {format(new Date(activeSession.clock_in), 'h:mm a')}</span>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg">Attendance Log</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {role === 'admin' && <TableHead>Employee</TableHead>}
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  {role === 'admin' && <TableCell>{(r as any).profiles?.full_name || '—'}</TableCell>}
                  <TableCell>{format(new Date(r.clock_in), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{format(new Date(r.clock_in), 'h:mm a')}</TableCell>
                  <TableCell>{r.clock_out ? format(new Date(r.clock_out), 'h:mm a') : '—'}</TableCell>
                  <TableCell>{r.hours_worked ? `${r.hours_worked}h` : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={r.clock_out ? 'secondary' : 'default'}>
                      {r.clock_out ? 'Complete' : 'Active'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow><TableCell colSpan={role === 'admin' ? 6 : 5} className="text-center text-muted-foreground py-8">No records yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
