import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";

export default function Analytics() {
  const [visitsByMonth, setVisitsByMonth] = useState<any[]>([]);
  const [attendanceByMonth, setAttendanceByMonth] = useState<any[]>([]);
  const [assetByType, setAssetByType] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5)).toISOString();
      const [{ data: visits }, { data: attendance }, { data: assets }] = await Promise.all([
        supabase.from("visitors").select("check_in").gte("check_in", sixMonthsAgo),
        supabase.from("attendance").select("clock_in, hours_worked").gte("clock_in", sixMonthsAgo),
        supabase.from("assets").select("asset_type"),
      ]);

      const monthBuckets: Record<string, number> = {};
      (visits || []).forEach((v: any) => {
        const key = format(new Date(v.check_in), "MMM yyyy");
        monthBuckets[key] = (monthBuckets[key] || 0) + 1;
      });
      setVisitsByMonth(Object.entries(monthBuckets).map(([month, count]) => ({ month, count })));

      const attendanceBuckets: Record<string, number> = {};
      (attendance || []).forEach((a: any) => {
        const key = format(new Date(a.clock_in), "MMM yyyy");
        attendanceBuckets[key] = (attendanceBuckets[key] || 0) + Number(a.hours_worked || 0);
      });
      setAttendanceByMonth(Object.entries(attendanceBuckets).map(([month, hours]) => ({ month, hours: Math.round(hours * 10) / 10 })));

      const typeBuckets: Record<string, number> = {};
      (assets || []).forEach((a: any) => {
        const key = a.asset_type || "unknown";
        typeBuckets[key] = (typeBuckets[key] || 0) + 1;
      });
      setAssetByType(Object.entries(typeBuckets).map(([type, count]) => ({ type, count })));
    }
    load();
  }, []);

  const totalVisits = useMemo(() => visitsByMonth.reduce((s, r) => s + r.count, 0), [visitsByMonth]);
  const totalHours = useMemo(() => attendanceByMonth.reduce((s, r) => s + r.hours, 0), [attendanceByMonth]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Operational and executive insights</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Total Visits (6 mo)</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{totalVisits}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Total Attendance Hours (6 mo)</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{totalHours}</p></CardContent></Card>
      </div>
      <Tabs defaultValue="operational">
        <TabsList>
          <TabsTrigger value="operational">Operational</TabsTrigger>
          <TabsTrigger value="executive">Executive</TabsTrigger>
        </TabsList>
        <TabsContent value="operational" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Visitors Per Month</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={visitsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="count" stroke="hsl(230,65%,55%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="executive" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Attendance Hours Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={attendanceByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="hours" fill="hsl(152,60%,42%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Asset Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={assetByType}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(38,92%,50%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
