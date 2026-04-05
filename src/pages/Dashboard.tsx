import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, CalendarOff, ListTodo } from 'lucide-react';

export default function Dashboard() {
  const { role, user, profile } = useAuth();
  const [stats, setStats] = useState({ totalEmployees: 0, clockedIn: 0, pendingLeaves: 0, myTasks: 0 });

  useEffect(() => {
    async function loadStats() {
      if (!user) return;

      const [profilesRes, attendanceRes, leavesRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).is('clock_out', null),
        role === 'admin'
          ? supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
          : supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).neq('status', 'done'),
      ]);

      setStats({
        totalEmployees: profilesRes.count || 0,
        clockedIn: attendanceRes.count || 0,
        pendingLeaves: leavesRes.count || 0,
        myTasks: tasksRes.count || 0,
      });
    }
    loadStats();
  }, [user, role]);

  const statCards = role === 'admin'
    ? [
        { label: 'Total Employees', value: stats.totalEmployees, icon: Users, color: 'text-primary' },
        { label: 'Currently Clocked In', value: stats.clockedIn, icon: Clock, color: 'text-[hsl(var(--success))]' },
        { label: 'Pending Leave Requests', value: stats.pendingLeaves, icon: CalendarOff, color: 'text-[hsl(var(--warning))]' },
        { label: 'Open Tasks', value: stats.myTasks, icon: ListTodo, color: 'text-primary' },
      ]
    : [
        { label: 'My Open Tasks', value: stats.myTasks, icon: ListTodo, color: 'text-primary' },
        { label: 'Pending Leaves', value: stats.pendingLeaves, icon: CalendarOff, color: 'text-[hsl(var(--warning))]' },
      ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {profile?.full_name || 'there'}</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'admin' ? 'Admin Dashboard — overview of your organization' : 'Your personal dashboard'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
