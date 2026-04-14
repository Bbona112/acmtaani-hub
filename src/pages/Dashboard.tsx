import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, ListTodo, Package, CalendarDays, MessageCircle, ArrowRightLeft, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format, subDays, startOfDay, parseISO } from 'date-fns';

const COLORS = ['hsl(230,65%,55%)', 'hsl(152,60%,42%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(280,60%,50%)'];

export default function Dashboard() {
  const { role, user, profile } = useAuth();
  const [stats, setStats] = useState({
    totalMembers: 0, clockedIn: 0, myTasks: 0, totalTasks: 0, doneTasks: 0,
    inventoryItems: 0, checkedOut: 0, upcomingEvents: 0, unreadMessages: 0, unreadNotifications: 0,
  });
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [taskStatusData, setTaskStatusData] = useState<any[]>([]);

  useEffect(() => {
    async function loadStats() {
      if (!user) return;

      const [profilesRes, attendanceRes, myTasksRes, totalTasksRes, doneTasksRes, inventoryRes, checkoutsRes, eventsRes, messagesRes, notifRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).is('clock_out', null),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).neq('status', 'done'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done'),
        supabase.from('inventory').select('id', { count: 'exact', head: true }),
        supabase.from('inventory_checkouts').select('id', { count: 'exact', head: true }).is('returned_at', null),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true }).gte('start_time', new Date().toISOString()),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
      ]);

      setStats({
        totalMembers: profilesRes.count || 0, clockedIn: attendanceRes.count || 0,
        myTasks: myTasksRes.count || 0, totalTasks: totalTasksRes.count || 0, doneTasks: doneTasksRes.count || 0,
        inventoryItems: inventoryRes.count || 0, checkedOut: checkoutsRes.count || 0,
        upcomingEvents: eventsRes.count || 0, unreadMessages: messagesRes.count || 0,
        unreadNotifications: notifRes.count || 0,
      });

      // Load attendance trend (last 7 days)
      const weekAgo = subDays(new Date(), 6).toISOString();
      const { data: attData } = await supabase.from('attendance').select('clock_in, hours_worked').gte('clock_in', weekAgo);
      if (attData) {
        const byDay: Record<string, { sessions: number; hours: number }> = {};
        for (let i = 6; i >= 0; i--) {
          const d = format(subDays(new Date(), i), 'MMM d');
          byDay[d] = { sessions: 0, hours: 0 };
        }
        attData.forEach(r => {
          const d = format(parseISO(r.clock_in), 'MMM d');
          if (byDay[d]) { byDay[d].sessions++; byDay[d].hours += r.hours_worked || 0; }
        });
        setAttendanceData(Object.entries(byDay).map(([day, v]) => ({ day, sessions: v.sessions, hours: Math.round(v.hours * 10) / 10 })));
      }

      // Task status breakdown
      const { data: allTasks } = await supabase.from('tasks').select('status');
      if (allTasks) {
        const counts = { todo: 0, in_progress: 0, done: 0 };
        allTasks.forEach(t => { if (counts[t.status as keyof typeof counts] !== undefined) counts[t.status as keyof typeof counts]++; });
        setTaskStatusData([
          { name: 'To Do', value: counts.todo },
          { name: 'In Progress', value: counts.in_progress },
          { name: 'Done', value: counts.done },
        ]);
      }
    }
    loadStats();

    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => loadStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(r => Object.values(r).join(',')).join('\n');
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  };

  const adminCards = [
    { label: 'Total Members', value: stats.totalMembers, icon: Users, color: 'text-primary' },
    { label: 'Currently Clocked In', value: stats.clockedIn, icon: Clock, color: 'text-[hsl(var(--success))]' },
    { label: 'Open Tasks', value: stats.totalTasks, icon: ListTodo, color: 'text-primary' },
    { label: 'Tasks Completed', value: stats.doneTasks, icon: ListTodo, color: 'text-[hsl(var(--success))]' },
    { label: 'Inventory Items', value: stats.inventoryItems, icon: Package, color: 'text-[hsl(var(--warning))]' },
    { label: 'Items Checked Out', value: stats.checkedOut, icon: ArrowRightLeft, color: 'text-destructive' },
    { label: 'Upcoming Events', value: stats.upcomingEvents, icon: CalendarDays, color: 'text-primary' },
    { label: 'Chat Messages', value: stats.unreadMessages, icon: MessageCircle, color: 'text-[hsl(var(--warning))]' },
  ];

  const memberCards = [
    { label: 'My Open Tasks', value: stats.myTasks, icon: ListTodo, color: 'text-primary' },
    { label: 'Currently Clocked In', value: stats.clockedIn, icon: Clock, color: 'text-[hsl(var(--success))]' },
    { label: 'Upcoming Events', value: stats.upcomingEvents, icon: CalendarDays, color: 'text-primary' },
    { label: 'Items Checked Out', value: stats.checkedOut, icon: ArrowRightLeft, color: 'text-[hsl(var(--warning))]' },
    { label: 'Notifications', value: stats.unreadNotifications, icon: ClipboardList, color: 'text-destructive' },
  ];

  const statCards = role === 'admin' ? adminCards : memberCards;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {profile?.full_name || 'there'}</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'admin' ? 'Admin Dashboard — overview of ACMtaani Hub' : 'Your personal dashboard'}
          </p>
        </div>
        {role === 'admin' && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCSV(attendanceData, 'attendance-report.csv')}>Export Attendance</Button>
            <Button variant="outline" size="sm" onClick={() => exportCSV(taskStatusData, 'tasks-report.csv')}>Export Tasks</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(s => (
          <Card key={s.label} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{s.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {role === 'admin' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Attendance Trend (7 days)</CardTitle></CardHeader>
            <CardContent>
              {attendanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="sessions" stroke="hsl(230,65%,55%)" strokeWidth={2} name="Sessions" />
                    <Line type="monotone" dataKey="hours" stroke="hsl(152,60%,42%)" strokeWidth={2} name="Hours" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground text-center py-12">No attendance data</p>}
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">Task Status</CardTitle></CardHeader>
            <CardContent>
              {taskStatusData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={taskStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {taskStatusData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground text-center py-12">No task data</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
