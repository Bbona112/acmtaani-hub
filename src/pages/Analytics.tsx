import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  format, subDays, startOfDay, endOfDay, eachDayOfInterval, parseISO,
  differenceInMinutes, isAfter,
} from "date-fns";
import { Download, TrendingUp, Users, Clock, ListChecks, Laptop, Package, AlertTriangle, UserCheck } from "lucide-react";

type RangePreset = "7d" | "30d" | "90d" | "6mo" | "12mo";

const COLORS = ["hsl(230,65%,55%)", "hsl(152,60%,42%)", "hsl(38,92%,50%)", "hsl(340,75%,55%)", "hsl(265,70%,60%)", "hsl(190,75%,45%)"];

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export default function Analytics() {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [department, setDepartment] = useState<string>("all");
  const [employee, setEmployee] = useState<string>("all");

  const [profiles, setProfiles] = useState<any[]>([]);
  const [visitors, setVisitors] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [checkouts, setCheckouts] = useState<any[]>([]);

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : preset === "6mo" ? 180 : 365;
  const since = startOfDay(subDays(new Date(), days - 1));

  useEffect(() => {
    async function load() {
      const sinceIso = since.toISOString();
      const [p, v, at, t, a, s, inv, co] = await Promise.all([
        (supabase as any).from("directory_profiles").select("user_id, full_name, department, position"),
        supabase.from("visitors").select("id, visitor_name, company, host_name, check_in, check_out, visitor_profile_id").gte("check_in", sinceIso),
        supabase.from("attendance").select("user_id, clock_in, clock_out, hours_worked").gte("clock_in", sinceIso),
        supabase.from("tasks").select("id, title, status, priority, assigned_to, created_at, updated_at, due_date, approval_status"),
        supabase.from("assets").select("id, asset_tag, name, asset_type, status, battery_percent, battery_charging, battery_updated_at"),
        supabase.from("asset_sessions").select("asset_id, user_name, started_at, ended_at").gte("started_at", sinceIso),
        supabase.from("inventory").select("id, name, category, quantity, available_quantity"),
        supabase.from("inventory_checkouts").select("inventory_item_id, user_id, quantity, checked_out_at, returned_at").gte("checked_out_at", sinceIso),
      ]);
      setProfiles(p.data || []);
      setVisitors(v.data || []);
      setAttendance(at.data || []);
      setTasks(t.data || []);
      setAssets(a.data || []);
      setSessions(s.data || []);
      setInventory(inv.data || []);
      setCheckouts(co.data || []);
    }
    load();
  }, [preset]);

  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.user_id, p])), [profiles]);
  const departments = useMemo(() => Array.from(new Set(profiles.map(p => p.department).filter(Boolean))), [profiles]);

  const filteredAttendance = useMemo(() => attendance.filter(a => {
    const p = profileMap[a.user_id];
    if (department !== "all" && p?.department !== department) return false;
    if (employee !== "all" && a.user_id !== employee) return false;
    return true;
  }), [attendance, department, employee, profileMap]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (employee !== "all" && t.assigned_to !== employee) return false;
    if (department !== "all") {
      const p = profileMap[t.assigned_to];
      if (p?.department !== department) return false;
    }
    return true;
  }), [tasks, department, employee, profileMap]);

  // ===== KPIs =====
  const today = startOfDay(new Date());
  const weekStart = subDays(today, 6);
  const monthStart = subDays(today, 29);

  const visitorsToday = visitors.filter(v => isAfter(parseISO(v.check_in), today)).length;
  const visitorsWeek = visitors.filter(v => isAfter(parseISO(v.check_in), weekStart)).length;
  const visitorsMonth = visitors.filter(v => isAfter(parseISO(v.check_in), monthStart)).length;
  const uniqueProfiles = new Set(visitors.map(v => v.visitor_profile_id).filter(Boolean));
  const repeatVisitors = visitors.length > 0 ? Math.round((uniqueProfiles.size > 0 ? (visitors.length - uniqueProfiles.size) / visitors.length : 0) * 100) : 0;

  const activeStaffNow = filteredAttendance.filter(a => !a.clock_out).length;
  const totalHours = filteredAttendance.reduce((s, a) => s + Number(a.hours_worked || 0), 0);
  const avgHoursPerDay = totalHours > 0 ? (totalHours / days).toFixed(1) : "0";

  const tasksDoneWeek = filteredTasks.filter(t => t.status === "done" && isAfter(parseISO(t.updated_at), weekStart)).length;
  const overdueTasks = filteredTasks.filter(t => t.due_date && t.status !== "done" && new Date(t.due_date) < today).length;

  const lateClockIns = filteredAttendance.filter(a => {
    const h = new Date(a.clock_in).getHours();
    return h >= 9 && h < 18 && new Date(a.clock_in).getMinutes() > 15 && h === 9;
  }).length;
  const onTimeRate = filteredAttendance.length > 0 ? Math.round(((filteredAttendance.length - lateClockIns) / filteredAttendance.length) * 100) : 100;

  const devicesInUse = assets.filter(a => a.status === "in_use").length;
  const lowBatteryDevices = assets.filter(a => a.battery_percent != null && a.battery_percent < 20 && !a.battery_charging).length;

  // ===== Time series =====
  const dailyTrend = useMemo(() => {
    const range = eachDayOfInterval({ start: since, end: new Date() });
    return range.map(d => {
      const dStr = format(d, "MMM d");
      const dayStart = startOfDay(d).getTime();
      const dayEnd = endOfDay(d).getTime();
      const inDay = (iso: string) => { const t = parseISO(iso).getTime(); return t >= dayStart && t <= dayEnd; };
      return {
        date: dStr,
        visitors: visitors.filter(v => inDay(v.check_in)).length,
        attendance: filteredAttendance.filter(a => inDay(a.clock_in)).length,
        tasks: filteredTasks.filter(t => inDay(t.updated_at) && t.status === "done").length,
        sessions: sessions.filter(s => inDay(s.started_at)).length,
      };
    });
  }, [visitors, filteredAttendance, filteredTasks, sessions, since]);

  // ===== People =====
  const hoursByDept = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAttendance.forEach(a => {
      const dept = profileMap[a.user_id]?.department || "Unassigned";
      map[dept] = (map[dept] || 0) + Number(a.hours_worked || 0);
    });
    return Object.entries(map).map(([department, hours]) => ({ department, hours: Math.round(hours * 10) / 10 }));
  }, [filteredAttendance, profileMap]);

  const topContributors = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAttendance.forEach(a => { map[a.user_id] = (map[a.user_id] || 0) + Number(a.hours_worked || 0); });
    return Object.entries(map)
      .map(([uid, hours]) => ({ name: profileMap[uid]?.full_name || "Unknown", hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours).slice(0, 10);
  }, [filteredAttendance, profileMap]);

  // ===== Tasks =====
  const taskFunnel = useMemo(() => {
    const status = (s: string) => filteredTasks.filter(t => t.status === s).length;
    return [
      { stage: "Todo", count: status("todo") },
      { stage: "In Progress", count: status("in_progress") },
      { stage: "Done", count: status("done") },
      { stage: "Approved", count: filteredTasks.filter(t => t.approval_status === "approved").length },
    ];
  }, [filteredTasks]);

  const tasksByPriority = useMemo(() => {
    const map: Record<string, number> = { low: 0, medium: 0, high: 0 };
    filteredTasks.forEach(t => { map[t.priority] = (map[t.priority] || 0) + 1; });
    return Object.entries(map).map(([priority, count]) => ({ name: priority, value: count }));
  }, [filteredTasks]);

  const tasksByAssignee = useMemo(() => {
    const map: Record<string, { done: number; total: number }> = {};
    filteredTasks.forEach(t => {
      const name = profileMap[t.assigned_to]?.full_name || "Unassigned";
      if (!map[name]) map[name] = { done: 0, total: 0 };
      map[name].total++;
      if (t.status === "done") map[name].done++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, done: v.done, total: v.total }))
      .sort((a, b) => b.done - a.done).slice(0, 10);
  }, [filteredTasks, profileMap]);

  const avgCycleTime = useMemo(() => {
    const done = filteredTasks.filter(t => t.status === "done");
    if (done.length === 0) return 0;
    const total = done.reduce((s, t) => s + Math.abs(differenceInMinutes(parseISO(t.updated_at), parseISO(t.created_at))), 0);
    return Math.round(total / done.length / 60);
  }, [filteredTasks]);

  // ===== Visitors =====
  const visitorByHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
    visitors.forEach(v => { buckets[new Date(v.check_in).getHours()].count++; });
    return buckets;
  }, [visitors]);

  const topHosts = useMemo(() => {
    const map: Record<string, number> = {};
    visitors.forEach(v => { if (v.host_name) map[v.host_name] = (map[v.host_name] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [visitors]);

  const topCompanies = useMemo(() => {
    const map: Record<string, number> = {};
    visitors.forEach(v => { if (v.company) map[v.company] = (map[v.company] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [visitors]);

  const repeatRatio = useMemo(() => {
    const seen: Record<string, number> = {};
    visitors.forEach(v => { const k = v.visitor_profile_id || v.visitor_name; seen[k] = (seen[k] || 0) + 1; });
    const repeat = Object.values(seen).filter(c => c > 1).length;
    const first = Object.values(seen).filter(c => c === 1).length;
    return [{ name: "First-time", value: first }, { name: "Returning", value: repeat }];
  }, [visitors]);

  // ===== Assets =====
  const assetUtilisation = useMemo(() => {
    const totalSeconds = days * 24 * 3600;
    return assets.map(a => {
      const used = sessions.filter(s => s.asset_id === a.id).reduce((sum, s) => {
        const end = s.ended_at ? parseISO(s.ended_at) : new Date();
        return sum + Math.max(0, (end.getTime() - parseISO(s.started_at).getTime()) / 1000);
      }, 0);
      return { tag: a.asset_tag, name: a.name, util: Math.min(100, Math.round((used / totalSeconds) * 100)), hours: Math.round(used / 360) / 10 };
    }).sort((a, b) => b.hours - a.hours).slice(0, 12);
  }, [assets, sessions, days]);

  const topAssetUsers = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { map[s.user_name] = (map[s.user_name] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [sessions]);

  // ===== Inventory =====
  const checkoutTrend = useMemo(() => {
    const range = eachDayOfInterval({ start: since, end: new Date() });
    return range.map(d => {
      const dayStart = startOfDay(d).getTime(); const dayEnd = endOfDay(d).getTime();
      return { date: format(d, "MMM d"), checkouts: checkouts.filter(c => { const t = parseISO(c.checked_out_at).getTime(); return t >= dayStart && t <= dayEnd; }).length };
    });
  }, [checkouts, since]);

  const topBorrowed = useMemo(() => {
    const map: Record<string, number> = {};
    checkouts.forEach(c => { map[c.inventory_item_id] = (map[c.inventory_item_id] || 0) + Number(c.quantity || 1); });
    return Object.entries(map)
      .map(([id, count]) => ({ name: inventory.find(i => i.id === id)?.name || "Unknown", count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  }, [checkouts, inventory]);

  const currentlyOut = checkouts.filter(c => !c.returned_at);

  const Kpi = ({ icon: Icon, label, value, hint, tone = "default" }: any) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
          <Icon className="h-3.5 w-3.5" />{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${tone === "warn" ? "text-[hsl(var(--destructive))]" : ""}`}>{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Operational and executive insights across the workspace</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="6mo">Last 6 months</SelectItem>
              <SelectItem value="12mo">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={employee} onValueChange={setEmployee}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All employees" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Visitors today" value={visitorsToday} hint={`${visitorsWeek} this week · ${visitorsMonth} this month`} />
        <Kpi icon={UserCheck} label="Active staff now" value={activeStaffNow} hint={`${onTimeRate}% on-time rate`} />
        <Kpi icon={Clock} label="Avg hours / day" value={avgHoursPerDay} hint={`${Math.round(totalHours)}h total`} />
        <Kpi icon={ListChecks} label="Tasks done (week)" value={tasksDoneWeek} hint={`${avgCycleTime}h avg cycle`} />
        <Kpi icon={AlertTriangle} label="Overdue tasks" value={overdueTasks} tone={overdueTasks > 0 ? "warn" : "default"} />
        <Kpi icon={Laptop} label="Devices in use" value={devicesInUse} hint={`${assets.length} total devices`} />
        <Kpi icon={AlertTriangle} label="Low battery" value={lowBatteryDevices} tone={lowBatteryDevices > 0 ? "warn" : "default"} hint="Below 20% & not charging" />
        <Kpi icon={TrendingUp} label="Returning visitors" value={`${repeatVisitors}%`} hint={`${uniqueProfiles.size} unique`} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="people">People & Attendance</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Combined Activity</CardTitle><CardDescription>Visitors, attendance, completed tasks and device sessions</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(`activity-${preset}.csv`,
                [["Date", "Visitors", "Attendance", "Tasks done", "Device sessions"], ...dailyTrend.map(d => [d.date, d.visitors, d.attendance, d.tasks, d.sessions])])}>
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={dailyTrend}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.5} /><stop offset="100%" stopColor={COLORS[0]} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Area type="monotone" dataKey="visitors" stroke={COLORS[0]} fill="url(#g1)" strokeWidth={2} />
                  <Line type="monotone" dataKey="attendance" stroke={COLORS[1]} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tasks" stroke={COLORS[2]} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sessions" stroke={COLORS[3]} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PEOPLE */}
        <TabsContent value="people" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Hours by department</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => downloadCSV("hours-by-dept.csv", [["Department", "Hours"], ...hoursByDept.map(d => [d.department, d.hours])])}><Download className="h-3 w-3" /></Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={hoursByDept}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="department" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                    <Bar dataKey="hours" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Top contributors</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => downloadCSV("top-contributors.csv", [["Name", "Hours"], ...topContributors.map(c => [c.name, c.hours])])}><Download className="h-3 w-3" /></Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topContributors} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={120} fontSize={11} /><Tooltip />
                    <Bar dataKey="hours" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Daily clock-in trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                  <Line dataKey="attendance" stroke={COLORS[1]} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div><CardTitle>Status funnel</CardTitle><CardDescription>Avg cycle time: {avgCycleTime}h</CardDescription></div>
                <Button size="sm" variant="ghost" onClick={() => downloadCSV("task-funnel.csv", [["Stage", "Count"], ...taskFunnel.map(s => [s.stage, s.count])])}><Download className="h-3 w-3" /></Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={taskFunnel}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="stage" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                    <Bar dataKey="count" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>By priority</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={tasksByPriority} dataKey="value" nameKey="name" outerRadius={90} label>
                      {tasksByPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Legend /><Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Assignee leaderboard</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => downloadCSV("assignees.csv", [["Name", "Done", "Total"], ...tasksByAssignee.map(a => [a.name, a.done, a.total])])}><Download className="h-3 w-3" /></Button>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, tasksByAssignee.length * 32)}>
                <BarChart data={tasksByAssignee} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={140} fontSize={11} /><Tooltip />
                  <Bar dataKey="total" fill="hsl(var(--muted))" /><Bar dataKey="done" fill={COLORS[1]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VISITORS */}
        <TabsContent value="visitors" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Peak hours</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => downloadCSV("visitors-by-hour.csv", [["Hour", "Visitors"], ...visitorByHour.map(h => [h.hour, h.count])])}><Download className="h-3 w-3" /></Button>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={visitorByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" fontSize={10} /><YAxis fontSize={11} /><Tooltip />
                    <Bar dataKey="count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>First-time vs Returning</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={repeatRatio} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                      {repeatRatio.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Legend /><Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Top hosts</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topHosts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={120} fontSize={11} /><Tooltip />
                    <Bar dataKey="count" fill={COLORS[3]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top companies</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topCompanies} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={120} fontSize={11} /><Tooltip />
                    <Bar dataKey="count" fill={COLORS[4]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ASSETS */}
        <TabsContent value="assets" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Device utilisation</CardTitle><CardDescription>Hours in use over the selected window</CardDescription></div>
              <Button size="sm" variant="ghost" onClick={() => downloadCSV("device-utilisation.csv", [["Tag", "Name", "Hours", "Util %"], ...assetUtilisation.map(a => [a.tag, a.name, a.hours, a.util])])}><Download className="h-3 w-3" /></Button>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(220, assetUtilisation.length * 28)}>
                <BarChart data={assetUtilisation} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} /><YAxis dataKey="tag" type="category" width={80} fontSize={11} /><Tooltip />
                  <Bar dataKey="hours" fill={COLORS[5]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Top device users</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topAssetUsers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={120} fontSize={11} /><Tooltip />
                    <Bar dataKey="count" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Low-battery alerts</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-60 overflow-auto">
                {assets.filter(a => a.battery_percent != null && a.battery_percent < 30 && !a.battery_charging).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm border-b pb-1">
                    <span className="font-mono text-xs">{a.asset_tag} <span className="font-sans">{a.name}</span></span>
                    <Badge variant={a.battery_percent < 20 ? "destructive" : "secondary"}>{a.battery_percent}%</Badge>
                  </div>
                ))}
                {assets.filter(a => a.battery_percent != null && a.battery_percent < 30 && !a.battery_charging).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">All devices healthy</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* INVENTORY */}
        <TabsContent value="inventory" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Checkouts trend</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => downloadCSV("checkouts.csv", [["Date", "Checkouts"], ...checkoutTrend.map(c => [c.date, c.checkouts])])}><Download className="h-3 w-3" /></Button>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={checkoutTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                  <Line dataKey="checkouts" stroke={COLORS[2]} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Top borrowed items</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topBorrowed} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" width={140} fontSize={11} /><Tooltip />
                    <Bar dataKey="count" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" />Currently out ({currentlyOut.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-60 overflow-auto">
                {currentlyOut.slice(0, 12).map((c, i) => {
                  const item = inventory.find(it => it.id === c.inventory_item_id);
                  const user = profileMap[c.user_id];
                  const days = Math.floor((Date.now() - parseISO(c.checked_out_at).getTime()) / 86400000);
                  return (
                    <div key={i} className="flex items-center justify-between text-sm border-b pb-1">
                      <div>
                        <p className="font-medium">{item?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{user?.full_name || "Unknown"} · {days}d ago</p>
                      </div>
                      {days > 1 && <Badge variant="destructive">Overdue</Badge>}
                    </div>
                  );
                })}
                {currentlyOut.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nothing checked out</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
