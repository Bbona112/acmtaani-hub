import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, CalendarDays, Users, Trash2, BarChart3 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { getAppSettings } from '@/lib/appSettings';

export default function DutyRoster() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [addOpen, setAddOpen] = useState(false);
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);
  const [newEntry, setNewEntry] = useState({ user_id: '', date: '', shift_start: '09:00', shift_end: '17:00', role_label: '', notes: '' });

  const weekStart = startOfWeek(currentWeek);
  const weekEnd = endOfWeek(currentWeek);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const monthStart = startOfMonth(currentWeek);
  const monthEnd = endOfMonth(currentWeek);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const load = async () => {
    const { data } = await supabase.from('duty_roster').select('*')
      .gte('date', format(viewMode === 'week' ? weekStart : monthStart, 'yyyy-MM-dd'))
      .lte('date', format(viewMode === 'week' ? weekEnd : monthEnd, 'yyyy-MM-dd'))
      .order('date');
    if (data) setEntries(data);
  };

  const loadProfiles = async () => {
    const { data } = await (supabase as any).from('directory_profiles').select('user_id, full_name, position').order('full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => { load(); loadProfiles(); }, [currentWeek, viewMode]);

  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    profiles.forEach(p => { m[p.user_id] = p; });
    return m;
  }, [profiles]);

  const addEntry = async () => {
    if (!newEntry.user_id || !newEntry.date) return;
    const { error } = await supabase.from('duty_roster').insert(newEntry as any);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Shift added' }); setAddOpen(false); setNewEntry({ user_id: '', date: '', shift_start: '09:00', shift_end: '17:00', role_label: '', notes: '' }); load(); }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Remove this shift?')) return;
    await supabase.from('duty_roster').delete().eq('id', id);
    toast({ title: 'Shift removed' }); load();
  };

  // Dashboard stats
  const shiftsThisWeek = entries.length;
  const uniqueMembers = new Set(entries.map(e => e.user_id)).size;
  const shiftsByDay = weekDays.map(d => ({
    day: format(d, 'EEE'),
    shifts: entries.filter(e => isSameDay(parseISO(e.date), d)).length,
  }));

  // My shifts
  const myShifts = entries.filter(e => e.user_id === user?.id);
  const myShiftPagination = useTablePagination(myShifts, rowsPerPageDefault);

  useEffect(() => {
    getAppSettings().then((s) => {
      setRowsPerPageDefault(s.rows_per_page);
      myShiftPagination.setRowsPerPage(s.rows_per_page);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Duty Roster</h1>
          <p className="text-muted-foreground mt-1">Weekly and monthly shift schedule for team members</p>
        </div>
        {role === 'admin' && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Shift</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Shift</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Select value={newEntry.user_id} onValueChange={v => setNewEntry({ ...newEntry, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={newEntry.date} onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Shift Start</Label><Input type="time" value={newEntry.shift_start} onChange={e => setNewEntry({ ...newEntry, shift_start: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Shift End</Label><Input type="time" value={newEntry.shift_end} onChange={e => setNewEntry({ ...newEntry, shift_end: e.target.value })} /></div>
                </div>
                <Input placeholder="Role / Label (e.g. Reception, Workshop Lead)" value={newEntry.role_label} onChange={e => setNewEntry({ ...newEntry, role_label: e.target.value })} />
                <Input placeholder="Notes (optional)" value={newEntry.notes} onChange={e => setNewEntry({ ...newEntry, notes: e.target.value })} />
                <Button onClick={addEntry} className="w-full">Add Shift</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <Button variant={viewMode === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('week')}>Week</Button>
        <Button variant={viewMode === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('month')}>Month</Button>
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(viewMode === 'week' ? subWeeks(currentWeek, 1) : subMonths(currentWeek, 1))}>← Prev</Button>
        <span className="font-semibold">{viewMode === 'week' ? `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}` : format(currentWeek, 'MMMM yyyy')}</span>
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(viewMode === 'week' ? addWeeks(currentWeek, 1) : addMonths(currentWeek, 1))}>Next →</Button>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule"><CalendarDays className="h-4 w-4 mr-1" /> Schedule</TabsTrigger>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="my-shifts"><Users className="h-4 w-4 mr-1" /> My Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <div className="grid gap-3 md:grid-cols-7">
            {(viewMode === 'week' ? weekDays : monthDays).map(day => {
              const dayEntries = entries.filter(e => isSameDay(parseISO(e.date), day));
              const isToday = isSameDay(day, new Date());
              return (
                <Card key={day.toISOString()} className={`border-border/50 ${isToday ? 'ring-2 ring-primary' : ''}`}>
                  <CardHeader className="pb-2 px-3 pt-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{format(day, 'EEE')}</CardTitle>
                    <p className={`text-lg font-bold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</p>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-2">
                    {dayEntries.map(entry => (
                      <div key={entry.id} className="bg-primary/5 rounded-md p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold truncate">{profileMap[entry.user_id]?.full_name || '—'}</span>
                          {role === 'admin' && <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-destructive" onClick={() => deleteEntry(entry.id)}><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                        <p className="text-muted-foreground">{entry.shift_start?.slice(0,5)} – {entry.shift_end?.slice(0,5)}</p>
                        {entry.role_label && <Badge variant="outline" className="text-[10px]">{entry.role_label}</Badge>}
                      </div>
                    ))}
                    {dayEntries.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2">—</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card className="border-border/50"><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{shiftsThisWeek}</p><p className="text-sm text-muted-foreground">Total Shifts</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{uniqueMembers}</p><p className="text-sm text-muted-foreground">Members Scheduled</p></CardContent></Card>
            <Card className="border-border/50"><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{myShifts.length}</p><p className="text-sm text-muted-foreground">My Shifts</p></CardContent></Card>
          </div>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Shifts by Day</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={shiftsByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="shifts" fill="hsl(230,65%,55%)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="my-shifts" className="mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">My Shifts This Week</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Role</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {myShiftPagination.pagedRows.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{format(parseISO(s.date), 'EEE, MMM d')}</TableCell>
                      <TableCell>{s.shift_start?.slice(0,5)}</TableCell>
                      <TableCell>{s.shift_end?.slice(0,5)}</TableCell>
                      <TableCell>{s.role_label || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{s.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {myShifts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No shifts scheduled</TableCell></TableRow>}
                </TableBody>
              </Table>
              <TablePaginationControls
                page={myShiftPagination.page}
                totalPages={myShiftPagination.totalPages}
                rowsPerPage={myShiftPagination.rowsPerPage}
                onPageChange={myShiftPagination.setPage}
                onRowsPerPageChange={myShiftPagination.setRowsPerPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
