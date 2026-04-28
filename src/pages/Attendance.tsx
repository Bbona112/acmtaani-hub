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
import { Clock, LogIn, LogOut, Users, BarChart3, Pencil } from 'lucide-react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { getAppSettings } from '@/lib/appSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Database } from '@/integrations/supabase/types';

type AttendanceRow = Database['public']['Tables']['attendance']['Row'];
type AttendanceUpdate = Database['public']['Tables']['attendance']['Update'];
type AdminProfileRow = Pick<Database['public']['Tables']['profiles']['Row'], 'user_id' | 'full_name' | 'employee_id'>;
type DirectoryProfileRow = Pick<Database['public']['Views']['directory_profiles']['Row'], 'user_id' | 'full_name'>;
type ProfileRow = AdminProfileRow | DirectoryProfileRow;

type EditAttendanceRecord = AttendanceRow & { clock_in_local: string; clock_out_local: string };

const CHART_COLORS = ['hsl(230,65%,55%)', 'hsl(152,60%,42%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(280,60%,50%)'];

export default function Attendance() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [volunteerModules, setVolunteerModules] = useState<string[]>([]);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EditAttendanceRecord | null>(null);
  const [editReason, setEditReason] = useState('');

  const isAttendanceAdmin = role === 'admin' || (role === 'volunteer' && volunteerModules.includes('attendance_admin'));

  const loadRecords = async () => {
    if (!user) return;
    const query = isAttendanceAdmin
      ? supabase.from('attendance').select('*').order('clock_in', { ascending: false }).limit(500)
      : supabase.from('attendance').select('*').eq('user_id', user.id).order('clock_in', { ascending: false }).limit(100);
    const { data } = await query;
    if (data) {
      setRecords(data);
      const active = data.find((r) => r.user_id === user.id && !r.clock_out);
      setActiveSession(active || null);
    }
  };

  const loadProfiles = async () => {
    // Attendance admins: use safe directory view (no PII) for names.
    // Full profiles require directory_admin; not needed for attendance.
    const src = supabase.from('directory_profiles').select('user_id, full_name');
    const { data } = await src;
    if (data) setProfiles(data as ProfileRow[]);
  };

  useEffect(() => {
    supabase.from('app_settings').select('volunteer_admin_modules').limit(1).maybeSingle().then(({ data }) => {
      const row = data as (Pick<Database['public']['Tables']['app_settings']['Row'], 'volunteer_admin_modules'> & { volunteer_admin_modules?: string[] }) | null;
      setVolunteerModules(Array.isArray(row?.volunteer_admin_modules) ? row!.volunteer_admin_modules! : []);
    });
  }, []);

  useEffect(() => {
    loadRecords();
    if (isAttendanceAdmin) loadProfiles();
    const channel = supabase.channel('attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => loadRecords())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role, isAttendanceAdmin]);

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

  const adminClockOut = async (record: AttendanceRow) => {
    const now = new Date();
    const hours = ((now.getTime() - new Date(record.clock_in).getTime()) / 3600000).toFixed(2);
    const { error } = await supabase.from('attendance').update({ clock_out: now.toISOString(), hours_worked: parseFloat(hours) }).eq('id', record.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Member clocked out', description: `${profileMap[record.user_id]?.name || 'Member'} — ${hours}h` });
  };

  const openEdit = (record: AttendanceRow) => {
    setEditRecord({
      ...record,
      clock_in_local: format(new Date(record.clock_in), "yyyy-MM-dd'T'HH:mm"),
      clock_out_local: record.clock_out ? format(new Date(record.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
    });
    setEditReason('');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!isAttendanceAdmin) return;
    if (!editRecord) return;
    if (!editReason.trim()) {
      toast({ title: 'Reason required', description: 'Add a short reason for this change.', variant: 'destructive' });
      return;
    }
    const newClockIn = new Date(editRecord.clock_in_local);
    const newClockOut = editRecord.clock_out_local ? new Date(editRecord.clock_out_local) : null;
    if (isNaN(newClockIn.getTime()) || (newClockOut && isNaN(newClockOut.getTime()))) {
      toast({ title: 'Invalid date/time', variant: 'destructive' });
      return;
    }
    if (newClockOut && newClockOut.getTime() < newClockIn.getTime()) {
      toast({ title: 'Clock-out must be after clock-in', variant: 'destructive' });
      return;
    }

    const before = { clock_in: editRecord.clock_in, clock_out: editRecord.clock_out, hours_worked: editRecord.hours_worked };
    const hours = newClockOut ? ((newClockOut.getTime() - newClockIn.getTime()) / 3600000) : null;
    const after: AttendanceUpdate = { clock_in: newClockIn.toISOString(), clock_out: newClockOut ? newClockOut.toISOString() : null, hours_worked: hours != null ? Math.round(hours * 100) / 100 : null };

    const { error } = await supabase.from('attendance').update(after).eq('id', editRecord.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await (supabase as unknown as { from: (table: 'attendance_audit') => { insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } })
      .from('attendance_audit')
      .insert({
        attendance_id: editRecord.id,
        edited_by: user?.id,
        reason: editReason.trim(),
        before,
        after,
      });
    toast({ title: 'Updated attendance' });
    setEditOpen(false);
    setEditRecord(null);
    loadRecords();
  };

  const profileMap = useMemo(() => {
    const m: Record<string, { name: string; empId: string }> = {};
    profiles.forEach((p) => {
      const empId = 'employee_id' in p ? (p.employee_id || '') : '';
      m[p.user_id as string] = { name: p.full_name || 'Unknown', empId };
    });
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
  const individualPagination = useTablePagination(filteredRecords, rowsPerPageDefault);
  const personalPagination = useTablePagination(records, rowsPerPageDefault);

  useEffect(() => {
    getAppSettings().then((s) => {
      setRowsPerPageDefault(s.rows_per_page);
      individualPagination.setRowsPerPage(s.rows_per_page);
      personalPagination.setRowsPerPage(s.rows_per_page);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="text-muted-foreground mt-1">{isAttendanceAdmin ? 'All staff attendance (real-time)' : 'Your daily attendance (real-time)'}</p>
        </div>
        <div className="flex gap-2">
          {isAttendanceAdmin && <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>}
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

      {isAttendanceAdmin && (
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
                    {individualPagination.pagedRows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{profileMap[r.user_id]?.name || '—'}</TableCell>
                        <TableCell>{format(new Date(r.clock_in), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{format(new Date(r.clock_in), 'h:mm a')}</TableCell>
                        <TableCell>{r.clock_out ? format(new Date(r.clock_out), 'h:mm a') : '—'}</TableCell>
                        <TableCell>{r.hours_worked ? `${r.hours_worked}h` : '—'}</TableCell>
                        <TableCell><Badge variant={r.clock_out ? 'secondary' : 'default'}>{r.clock_out ? 'Complete' : 'Active'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredRecords.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No records</TableCell></TableRow>}
                  </TableBody>
                </Table>
                <TablePaginationControls
                  page={individualPagination.page}
                  totalPages={individualPagination.totalPages}
                  rowsPerPage={individualPagination.rowsPerPage}
                  onPageChange={individualPagination.setPage}
                  onRowsPerPageChange={individualPagination.setRowsPerPage}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="live" className="space-y-4 mt-4">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[hsl(var(--success))] animate-pulse" /> Currently Clocked In ({currentlyClockedIn.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Employee ID</TableHead><TableHead>Clocked In At</TableHead><TableHead></TableHead><TableHead></TableHead></TableRow></TableHeader>
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
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {currentlyClockedIn.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No one currently clocked in</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Attendance</DialogTitle></DialogHeader>
          {editRecord && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Clock In</Label>
                <Input type="datetime-local" value={editRecord.clock_in_local} onChange={(e) => setEditRecord({ ...editRecord, clock_in_local: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Clock Out (optional)</Label>
                <Input type="datetime-local" value={editRecord.clock_out_local} onChange={(e) => setEditRecord({ ...editRecord, clock_out_local: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Reason (required)</Label>
                <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="e.g. missed scan, corrected time" />
              </div>
              <Button onClick={saveEdit} className="w-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!isAttendanceAdmin && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Your Attendance Log</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {personalPagination.pagedRows.map(r => (
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
              <TablePaginationControls
                page={personalPagination.page}
                totalPages={personalPagination.totalPages}
                rowsPerPage={personalPagination.rowsPerPage}
                onPageChange={personalPagination.setPage}
                onRowsPerPageChange={personalPagination.setRowsPerPage}
              />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
