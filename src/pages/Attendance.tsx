import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut, Users, BarChart3 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['hsl(230,65%,55%)', 'hsl(152,60%,42%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(280,60%,50%)'];

export default function Attendance() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('all');

  const loadRecords = async () => {
    if (!user) return;
    const query = role === 'admin'
      ? supabase.from('attendance').select('*').order('clock_in', { ascending: false }).limit(500)
      : supabase.from('attendance').select('*').eq('user_id', user.id).order('clock_in', { ascending: false }).limit(100);
    const { data } = await query;
    if (data) {
      setRecords(data);
      const active = data.find((r: any) => r.user_id === user.id && !r.clock_out);
      setActiveSession(active || null);
    }
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name, employee_id');
    if (data) setProfiles(data);
  };

  useEffect(() => {
    loadRecords();
    if (role === 'admin') loadProfiles();
    const channel = supabase.channel('attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => loadRecords())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const clockIn = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('attendance').insert({ user_id: user.id });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Clocked in!' });
    setLoading(false);
  };

  const clockOut = async () => {
    if (!activeSession) return;
    setLoading(true);
    const now = new Date();
    const hours = ((now.getTime() - new Date(activeSession.clock_in).getTime()) / 3600000).toFixed(2);
    const { error } = await supabase.from('attendance').update({ clock_out: now.toISOString(), hours_worked: parseFloat(hours) }).eq('id', activeSession.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Clocked out!', description: `${hours} hours worked` });
    setLoading(false);
  };

  const adminClockOut = async (record: any) => {
    const now = new Date();
    const hours = ((now.getTime() - new Date(record.clock_in).getTime()) / 3600000).toFixed(2);
    const { error } = await supabase.from('attendance').update({ clock_out: now.toISOString(), hours_worked: parseFloat(hours) }).eq('id', record.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Member clocked out', description: `${profileMap[record.user_id]?.name || 'Member'} — ${hours}h` });
  };

  const profileMap = useMemo(() => {
    const m: Record<string, { name: string; empId: string }> = {};
    profiles.forEach(p => { m[p.user_id] = { name: p.full_name, empId: p.employee_id || '' }; });
    return m;
  }, [profiles]);

  const filteredRecords = selectedUser === 'all' ? records : records.filter(r => r.user_id === selectedUser);

  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());
  const weeklyData = useMemo(() => {
    const thisWeek = records.filter(r => {
      const d = parseISO(r.clock_in);
      return isWithinInterval(d, { start: weekStart, end: weekEnd }) && r.hours_worked;
    });
    const byUser: Record<string, number> = {};
    thisWeek.forEach(r => { byUser[r.user_id] = (byUser[r.user_id] || 0) + (r.hours_worked || 0); });
    return Object.entries(byUser).map(([uid, hours]) => ({
      name: profileMap[uid]?.name || 'Unknown', hours: Math.round(hours * 10) / 10,
    })).sort((a, b) => b.hours - a.hours).slice(0, 10);
  }, [records, profileMap]);

  const statusData = useMemo(() => {
    const clockedIn = records.filter(r => !r.clock_out).length;
    const clockedOut = records.filter(r => r.clock_out).length;
    return [{ name: 'Active', value: clockedIn }, { name: 'Completed', value: clockedOut }];
  }, [records]);

  const currentlyClockedIn = records.filter(r => !r.clock_out);

  const exportCSV = () => {
    const data = filteredRecords.map(r => ({
      Member: profileMap[r.user_id]?.name || '—',
      Date: format(new Date(r.clock_in), 'yyyy-MM-dd'),
      ClockIn: format(new Date(r.clock_in), 'HH:mm'),
      ClockOut: r.clock_out ? format(new Date(r.clock_out), 'HH:mm') : '',
      Hours: r.hours_worked || '',
    }));
    if (!data.length) return;
    const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'attendance-report.csv'; link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-muted-foreground mt-1">{role === 'admin' ? 'All staff attendance (real-time)' : 'Your daily attendance (real-time)'}</p>
        </div>
        <div className="flex gap-2">
          {role === 'admin' && <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>}
          {!activeSession ? (
            <Button onClick={clockIn} disabled={loading}><LogIn className="h-4 w-4 mr-2" /> Clock In</Button>
          ) : (
            <Button onClick={clockOut} disabled={loading} variant="outline"><LogOut className="h-4 w-4 mr-2" /> Clock Out</Button>
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

      {role === 'admin' && (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-1" /> Overview</TabsTrigger>
            <TabsTrigger value="individual"><Users className="h-4 w-4 mr-1" /> Individual</TabsTrigger>
            <TabsTrigger value="live"><Clock className="h-4 w-4 mr-1" /> Live</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-lg">Weekly Hours by Employee</CardTitle></CardHeader>
                <CardContent>
                  {weeklyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="hours" fill="hsl(230,65%,55%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-muted-foreground text-center py-12">No data this week</p>}
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardHeader><CardTitle className="text-lg">Session Status</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="individual" className="space-y-4 mt-4">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.employee_id})</SelectItem>)}
              </SelectContent>
            </Select>
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead><TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.slice(0, 50).map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{profileMap[r.user_id]?.name || '—'}</TableCell>
                        <TableCell>{format(new Date(r.clock_in), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{format(new Date(r.clock_in), 'h:mm a')}</TableCell>
                        <TableCell>{r.clock_out ? format(new Date(r.clock_out), 'h:mm a') : '—'}</TableCell>
                        <TableCell>{r.hours_worked ? `${r.hours_worked}h` : '—'}</TableCell>
                        <TableCell><Badge variant={r.clock_out ? 'secondary' : 'default'}>{r.clock_out ? 'Complete' : 'Active'}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {filteredRecords.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No records</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="live" className="space-y-4 mt-4">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[hsl(var(--success))] animate-pulse" /> Currently Clocked In ({currentlyClockedIn.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Employee ID</TableHead><TableHead>Clocked In At</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {currentlyClockedIn.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{profileMap[r.user_id]?.name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{profileMap[r.user_id]?.empId || '—'}</TableCell>
                        <TableCell>{format(new Date(r.clock_in), 'h:mm a')}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => adminClockOut(r)}>
                            <LogOut className="h-3 w-3 mr-1" /> Clock Out
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {currentlyClockedIn.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No one currently clocked in</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {role !== 'admin' && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Your Attendance Log</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {records.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{format(new Date(r.clock_in), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{format(new Date(r.clock_in), 'h:mm a')}</TableCell>
                    <TableCell>{r.clock_out ? format(new Date(r.clock_out), 'h:mm a') : '—'}</TableCell>
                    <TableCell>{r.hours_worked ? `${r.hours_worked}h` : '—'}</TableCell>
                    <TableCell><Badge variant={r.clock_out ? 'secondary' : 'default'}>{r.clock_out ? 'Complete' : 'Active'}</Badge></TableCell>
                  </TableRow>
                ))}
                {records.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No records yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
