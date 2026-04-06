import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, LogOut, Users } from 'lucide-react';
import { format } from 'date-fns';

export default function FrontDesk() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    visitor_name: '',
    company: '',
    host_name: '',
    purpose: '',
  });

  const loadVisitors = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('visitors')
      .select('*')
      .gte('check_in', today.toISOString())
      .order('check_in', { ascending: false });
    if (data) setVisitors(data);
  };

  useEffect(() => { loadVisitors(); }, []);

  const checkIn = async () => {
    if (!form.visitor_name.trim()) {
      toast({ title: 'Error', description: 'Visitor name is required', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('visitors').insert({
      ...form,
      checked_in_by: user?.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Visitor checked in!' });
      setForm({ visitor_name: '', company: '', host_name: '', purpose: '' });
      setDialogOpen(false);
      await loadVisitors();
    }
  };

  const checkOut = async (id: string) => {
    const { error } = await supabase
      .from('visitors')
      .update({ check_out: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Visitor checked out!' });
      await loadVisitors();
    }
  };

  const activeCount = visitors.filter(v => !v.check_out).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Front Desk</h1>
          <p className="text-muted-foreground mt-1">Manage visitors entering and using the space</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Check In Visitor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Check In Visitor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Visitor Name *</Label>
                <Input
                  value={form.visitor_name}
                  onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label>Host (Who they're visiting)</Label>
                <Input
                  value={form.host_name}
                  onChange={(e) => setForm({ ...form, host_name: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Input
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  placeholder="Meeting, Interview, Delivery..."
                />
              </div>
              <Button onClick={checkIn} className="w-full">
                <UserPlus className="h-4 w-4 mr-2" /> Check In
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Currently In Building</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{activeCount}</p></CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Today</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{visitors.length}</p></CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Today's Visitors</CardTitle>
          <CardDescription>Visitor log for {format(new Date(), 'MMMM d, yyyy')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitor</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visitors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.visitor_name}</TableCell>
                  <TableCell>{v.company || '—'}</TableCell>
                  <TableCell>{v.host_name || '—'}</TableCell>
                  <TableCell>{format(new Date(v.check_in), 'h:mm a')}</TableCell>
                  <TableCell>{v.check_out ? format(new Date(v.check_out), 'h:mm a') : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={v.check_out ? 'secondary' : 'default'}>
                      {v.check_out ? 'Left' : 'In Building'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!v.check_out && (
                      <Button size="sm" variant="outline" onClick={() => checkOut(v.id)}>
                        <LogOut className="h-3 w-3 mr-1" /> Out
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {visitors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No visitors today
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
