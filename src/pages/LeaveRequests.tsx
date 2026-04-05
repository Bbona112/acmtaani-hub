import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Check, X } from 'lucide-react';
import { format } from 'date-fns';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

export default function LeaveRequests() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', reason: '' });

  const loadRequests = async () => {
    const query = role === 'admin'
      ? supabase.from('leave_requests').select('*, profiles!leave_requests_user_id_fkey(full_name)').order('created_at', { ascending: false })
      : supabase.from('leave_requests').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
    const { data } = await query;
    if (data) setRequests(data);
  };

  useEffect(() => { if (user) loadRequests(); }, [user, role]);

  const submitRequest = async () => {
    if (!form.start_date || !form.end_date || !user) return;
    const { error } = await supabase.from('leave_requests').insert({
      user_id: user.id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Leave request submitted' });
      setDialogOpen(false);
      setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' });
      loadRequests();
    }
  };

  const reviewRequest = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: `Request ${status}` });
      loadRequests();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Requests</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'admin' ? 'Review and manage leave requests' : 'Submit and track your leave requests'}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Start Date</label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">End Date</label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <Textarea placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button onClick={submitRequest} className="w-full">Submit Request</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                {role === 'admin' && <TableHead>Employee</TableHead>}
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                {role === 'admin' && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  {role === 'admin' && <TableCell>{(r as any).profiles?.full_name || '—'}</TableCell>}
                  <TableCell className="capitalize">{r.leave_type}</TableCell>
                  <TableCell>{format(new Date(r.start_date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{format(new Date(r.end_date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[r.status]}>{r.status}</Badge>
                  </TableCell>
                  {role === 'admin' && (
                    <TableCell>
                      {r.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => reviewRequest(r.id, 'approved')}>
                            <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reviewRequest(r.id, 'rejected')}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow><TableCell colSpan={role === 'admin' ? 6 : 4} className="text-center text-muted-foreground py-8">No requests yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
