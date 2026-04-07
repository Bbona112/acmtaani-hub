import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, ListTodo, Package, CalendarDays, MessageCircle } from 'lucide-react';

export default function Dashboard() {
  const { role, user, profile } = useAuth();
  const [stats, setStats] = useState({
    totalMembers: 0,
    clockedIn: 0,
    myTasks: 0,
    totalTasks: 0,
    inventoryItems: 0,
    checkedOut: 0,
    upcomingEvents: 0,
    unreadMessages: 0,
  });

  useEffect(() => {
    async function loadStats() {
      if (!user) return;

      const [profilesRes, attendanceRes, myTasksRes, totalTasksRes, inventoryRes, checkoutsRes, eventsRes, messagesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).is('clock_out', null),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).neq('status', 'done'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase.from('inventory').select('id', { count: 'exact', head: true }),
        supabase.from('inventory_checkouts').select('id', { count: 'exact', head: true }).is('returned_at', null),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true }).gte('start_time', new Date().toISOString()),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalMembers: profilesRes.count || 0,
        clockedIn: attendanceRes.count || 0,
        myTasks: myTasksRes.count || 0,
        totalTasks: totalTasksRes.count || 0,
        inventoryItems: inventoryRes.count || 0,
        checkedOut: checkoutsRes.count || 0,
        upcomingEvents: eventsRes.count || 0,
        unreadMessages: messagesRes.count || 0,
      });
    }
    loadStats();

    // Real-time subscription for live updates
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => loadStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const adminCards = [
    { label: 'Total Members', value: stats.totalMembers, icon: Users, color: 'text-primary' },
    { label: 'Currently Clocked In', value: stats.clockedIn, icon: Clock, color: 'text-[hsl(var(--success))]' },
    { label: 'Open Tasks', value: stats.totalTasks, icon: ListTodo, color: 'text-primary' },
    { label: 'Inventory Items', value: stats.inventoryItems, icon: Package, color: 'text-[hsl(var(--warning))]' },
    { label: 'Items Checked Out', value: stats.checkedOut, icon: Package, color: 'text-destructive' },
    { label: 'Upcoming Events', value: stats.upcomingEvents, icon: CalendarDays, color: 'text-primary' },
  ];

  const memberCards = [
    { label: 'My Open Tasks', value: stats.myTasks, icon: ListTodo, color: 'text-primary' },
    { label: 'Currently Clocked In', value: stats.clockedIn, icon: Clock, color: 'text-[hsl(var(--success))]' },
    { label: 'Upcoming Events', value: stats.upcomingEvents, icon: CalendarDays, color: 'text-primary' },
    { label: 'Items Checked Out', value: stats.checkedOut, icon: Package, color: 'text-[hsl(var(--warning))]' },
  ];

  const statCards = role === 'admin' ? adminCards : memberCards;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {profile?.full_name || 'there'}</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'admin' ? 'Admin Dashboard — overview of ACMtaani Hub' : 'Your personal dashboard'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
