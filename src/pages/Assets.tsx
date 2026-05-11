import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, ArrowRightLeft, Trash2, Battery, BatteryCharging, Activity,
  Pencil, Download, Search, AlertTriangle, Wifi, WifiOff,
  ExternalLink, Copy, QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { useTablePagination } from '@/hooks/useTablePagination';
import { getAppSettings } from '@/lib/appSettings';
import type { Database } from '@/integrations/supabase/types';
import { AssetDetailDrawer } from '@/components/AssetDetailDrawer';
import { Alert, AlertDescription } from '@/components/ui/alert';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in_use', label: 'In Use' },
  { id: 'in_safe', label: 'In Safe' },
  { id: 'low_battery', label: 'Low Battery' },
  { id: 'stale', label: 'Stale Telemetry' },
];

export default function Assets() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [volunteerModules, setVolunteerModules] = useState<string[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [visitors, setVisitors] = useState<any[]>([]);
  const [staleAfterMin, setStaleAfterMin] = useState(20);

  const [addOpen, setAddOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [drawerAsset, setDrawerAsset] = useState<any>(null);

  const [newAsset, setNewAsset] = useState({ name: '', asset_type: 'chromebook', custom_asset_type: '', serial_number: '', notes: '' });
  const [issueTo, setIssueTo] = useState({ kind: 'user', id: '', name: '', notes: '', location: '' });
  const [filterType, setFilterType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linksOpen, setLinksOpen] = useState(false);

  const deviceUrl = (tag: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}/device/${tag}` : `/device/${tag}`;

  const copyDeviceLink = async (tag: string) => {
    try {
      await navigator.clipboard.writeText(deviceUrl(tag));
      toast({ title: 'Link copied', description: deviceUrl(tag) });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const canAssetsAdmin = role === 'admin' || (role === 'volunteer' && volunteerModules.includes('assets_admin'));

  const loadAll = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [a, s, p, v, settings] = await Promise.all([
      supabase.from('assets').select('*').order('asset_tag'),
      supabase.from('asset_sessions').select('*').is('ended_at', null),
      (supabase as any).from('directory_profiles').select('user_id, full_name'),
      supabase.from('visitors').select('id, visitor_name, badge_number, check_in')
        .gte('check_in', today.toISOString()).is('check_out', null),
      supabase.from('app_settings').select('volunteer_admin_modules, battery_stale_after_minutes').limit(1).maybeSingle(),
    ]);
    if (a.data) setAssets(a.data);
    if (s.data) setSessions(s.data);
    if (p.data) setProfiles(p.data);
    if (v.data) setVisitors(v.data);
    const row = settings.data as (Pick<Database['public']['Tables']['app_settings']['Row'], 'volunteer_admin_modules' | 'battery_stale_after_minutes'>) | null;
    setVolunteerModules(Array.isArray(row?.volunteer_admin_modules) ? row!.volunteer_admin_modules! : []);
    setStaleAfterMin(row?.battery_stale_after_minutes || 20);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel('assets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_sessions' }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Helpers
  const sessionFor = (assetId: string) => sessions.find(s => s.asset_id === assetId);
  const isStale = (a: any) => a.battery_updated_at &&
    (Date.now() - new Date(a.battery_updated_at).getTime()) / 60000 > staleAfterMin;
  const batteryHealth = (a: any): 'unsupported' | 'stale' | 'critical' | 'low' | 'charging' | 'healthy' => {
    if (a.asset_type === 'ipad' || a.battery_updated_at == null) return 'unsupported';
    if (isStale(a)) return 'stale';
    if (a.battery_charging) return 'charging';
    if (a.battery_percent < 20) return 'critical';
    if (a.battery_percent < 40) return 'low';
    return 'healthy';
  };

  const addAsset = async () => {
    if (!newAsset.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    const typeToUse = newAsset.asset_type === 'custom' ? newAsset.custom_asset_type.trim().toLowerCase() : newAsset.asset_type;
    const { error } = await supabase.from('assets').insert({
      name: newAsset.name, asset_type: typeToUse || 'other',
      serial_number: newAsset.serial_number, notes: newAsset.notes,
    } as any);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Asset added' }); setNewAsset({ name: '', asset_type: 'chromebook', custom_asset_type: '', serial_number: '', notes: '' }); setAddOpen(false); }
  };
  const updateAsset = async () => {
    const { id, asset_tag, created_at, updated_at, battery_percent, battery_charging, battery_updated_at, ...rest } = editAsset;
    await supabase.from('assets').update(rest).eq('id', id);
    toast({ title: 'Updated' }); setEditAsset(null);
  };
  const deleteAsset = async (id: string) => {
    if (!confirm('Delete this asset?')) return;
    await supabase.from('assets').delete().eq('id', id);
  };

  const issue = async () => {
    if (!selected) return;
    if (!issueTo.id && !issueTo.name.trim()) { toast({ title: 'Select a user/visitor', variant: 'destructive' }); return; }
    const sessionData: any = { asset_id: selected.id, user_name: issueTo.name, notes: issueTo.notes, issued_by: user?.id };
    if (issueTo.kind === 'user') sessionData.user_id = issueTo.id;
    if (issueTo.kind === 'visitor') sessionData.visitor_id = issueTo.id;
    const { error: e1 } = await supabase.from('asset_sessions').insert(sessionData);
    if (e1) { toast({ title: 'Error', description: e1.message, variant: 'destructive' }); return; }
    await supabase.from('assets').update({ status: 'in_use', location: issueTo.location || null }).eq('id', selected.id);
    toast({ title: `${selected.name} issued to ${issueTo.name}` });
    setIssueOpen(false); setSelected(null); setIssueTo({ kind: 'user', id: '', name: '', notes: '', location: '' });
  };

  const returnAsset = async (asset: any) => {
    const session = sessions.find(s => s.asset_id === asset.id);
    if (session) await supabase.from('asset_sessions').update({ ended_at: new Date().toISOString() }).eq('id', session.id);
    await supabase.from('assets').update({ status: 'in_safe' }).eq('id', asset.id);
    toast({ title: 'Returned to safe' });
  };

  const bulkReturn = async () => {
    if (selectedIds.size === 0) return;
    const inUseSelected = assets.filter(a => selectedIds.has(a.id) && a.status === 'in_use');
    for (const a of inUseSelected) { await returnAsset(a); }
    setSelectedIds(new Set());
  };

  // Filtering
  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (filterType !== 'all' && a.asset_type !== filterType) return false;
      const health = batteryHealth(a);
      if (statusFilter === 'in_use' && a.status !== 'in_use') return false;
      if (statusFilter === 'in_safe' && a.status !== 'in_safe') return false;
      if (statusFilter === 'low_battery' && !(health === 'critical' || health === 'low')) return false;
      if (statusFilter === 'stale' && health !== 'stale') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const s = sessionFor(a.id);
        const hay = [a.asset_tag, a.name, a.serial_number, s?.user_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, sessions, filterType, statusFilter, search, staleAfterMin]);

  const inUse = assets.filter(a => a.status === 'in_use').length;
  const inSafe = assets.filter(a => a.status === 'in_safe').length;
  const fleetHealth = useMemo(() => {
    const buckets = { critical: 0, low: 0, healthy: 0, charging: 0, stale: 0, unsupported: 0 };
    assets.forEach(a => { buckets[batteryHealth(a)]++; });
    return buckets;
  }, [assets, staleAfterMin]);
  const lowBatteryCount = fleetHealth.critical + fleetHealth.low;

  const typeOptions = Array.from(new Set(assets.map((a) => a.asset_type).filter(Boolean)));
  const pagination = useTablePagination(filtered, rowsPerPageDefault);

  useEffect(() => {
    getAppSettings().then((s) => {
      setRowsPerPageDefault(s.rows_per_page);
      pagination.setRowsPerPage(s.rows_per_page);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCSV = () => {
    const rows: any[] = [['Tag', 'Name', 'Type', 'Status', 'Battery %', 'Health', 'Charging', 'Updated', 'Current User', 'Started']];
    assets.forEach(a => {
      const s = sessionFor(a.id);
      rows.push([
        a.asset_tag, a.name, a.asset_type, a.status,
        a.battery_percent ?? '', batteryHealth(a),
        a.battery_charging ? 'yes' : 'no',
        a.battery_updated_at || '',
        s?.user_name || '', s?.started_at || '',
      ]);
    });
    const csv = rows.map(r => r.map((c: any) => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `assets-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const total = assets.length || 1;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  const criticalAlerts = assets.filter(a => {
    const h = batteryHealth(a);
    return (h === 'critical' && a.status === 'in_use') || h === 'stale';
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trackable Assets</h1>
          <p className="text-muted-foreground mt-1">Live device telemetry, sessions and utilisation</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && canAssetsAdmin && (
            <Button variant="outline" onClick={bulkReturn}>Return {selectedIds.size}</Button>
          )}
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export</Button>
          {canAssetsAdmin && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Asset</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Asset</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} placeholder="Chromebook 01" /></div>
                  <div><Label>Type</Label>
                    <Select value={newAsset.asset_type} onValueChange={(v) => setNewAsset({ ...newAsset, asset_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chromebook">Chromebook</SelectItem>
                        <SelectItem value="hp_laptop">HP Laptop</SelectItem>
                        <SelectItem value="imac">iMac</SelectItem>
                        <SelectItem value="ipad">iPad</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="custom">Add custom type</SelectItem>
                      </SelectContent>
                    </Select>
                    {newAsset.asset_type === 'custom' && (
                      <Input className="mt-2" placeholder="Type e.g. projector_laptop" value={newAsset.custom_asset_type}
                        onChange={(e) => setNewAsset({ ...newAsset, custom_asset_type: e.target.value })} />
                    )}
                  </div>
                  <div><Label>Serial Number</Label><Input value={newAsset.serial_number} onChange={(e) => setNewAsset({ ...newAsset, serial_number: e.target.value })} /></div>
                  <div><Label>Notes</Label><Input value={newAsset.notes} onChange={(e) => setNewAsset({ ...newAsset, notes: e.target.value })} /></div>
                  <Button onClick={addAsset} className="w-full">Add</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Critical alerts */}
      {criticalAlerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{criticalAlerts.length}</strong> device(s) need attention:{' '}
            {criticalAlerts.slice(0, 3).map(a => a.asset_tag).join(', ')}{criticalAlerts.length > 3 && ` +${criticalAlerts.length - 3} more`}
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs + Fleet Health */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Devices</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{assets.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><Activity className="h-3.5 w-3.5" />In Use</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-primary">{inUse}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">In Safe</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{inSafe}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Low / Critical Battery</CardTitle></CardHeader><CardContent><p className={`text-3xl font-bold ${lowBatteryCount ? 'text-[hsl(var(--destructive))]' : ''}`}>{lowBatteryCount}</p></CardContent></Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Fleet Battery Health</CardTitle></CardHeader>
          <CardContent>
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
              <div className="bg-[hsl(var(--destructive))]" style={{ width: pct(fleetHealth.critical) }} title={`Critical ${fleetHealth.critical}`} />
              <div className="bg-[hsl(38,92%,50%)]" style={{ width: pct(fleetHealth.low) }} title={`Low ${fleetHealth.low}`} />
              <div className="bg-[hsl(152,60%,42%)]" style={{ width: pct(fleetHealth.healthy) }} title={`Healthy ${fleetHealth.healthy}`} />
              <div className="bg-[hsl(190,75%,45%)]" style={{ width: pct(fleetHealth.charging) }} title={`Charging ${fleetHealth.charging}`} />
              <div className="bg-muted-foreground/40" style={{ width: pct(fleetHealth.stale + fleetHealth.unsupported) }} title="Stale/Unsupported" />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
              <span>● {fleetHealth.healthy} healthy</span>
              <span>● {fleetHealth.charging} charging</span>
              <span>● {fleetHealth.low} low</span>
              <span>● {fleetHealth.critical} critical</span>
              <span>● {fleetHealth.stale + fleetHealth.unsupported} no data</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search tag, name, serial, user..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={filterType} onValueChange={setFilterType}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="chromebook">Chromebooks</TabsTrigger>
          <TabsTrigger value="hp_laptop">HP Laptops</TabsTrigger>
          <TabsTrigger value="imac">iMacs</TabsTrigger>
          <TabsTrigger value="ipad">iPads</TabsTrigger>
          {typeOptions.filter((t) => !['chromebook', 'hp_laptop', 'imac', 'ipad'].includes(t)).map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filterType}>
          <Card>
            <CardHeader><CardTitle>Live Device Status</CardTitle><CardDescription>Click any row to see history, battery trend and top users</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  {canAssetsAdmin && <TableHead className="w-8"></TableHead>}
                  <TableHead>Tag</TableHead><TableHead>Device</TableHead><TableHead>Type</TableHead>
                  <TableHead>Status</TableHead><TableHead>Battery</TableHead>
                  <TableHead>Current User</TableHead><TableHead>Started</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pagination.pagedRows.map(a => {
                    const s = sessionFor(a.id);
                    const health = batteryHealth(a);
                    const stale = health === 'stale';
                    return (
                      <TableRow key={a.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDrawerAsset(a)}>
                        {canAssetsAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(a.id)} onChange={(e) => {
                              const next = new Set(selectedIds);
                              e.target.checked ? next.add(a.id) : next.delete(a.id);
                              setSelectedIds(next);
                            }} />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs">{a.asset_tag}</TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="capitalize">{a.asset_type}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === 'in_use' ? 'default' : a.status === 'in_safe' ? 'secondary' : 'outline'}>
                            {a.status === 'in_use' ? 'In Use' : a.status === 'in_safe' ? 'In Safe' : a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {health === 'unsupported' ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><WifiOff className="h-3 w-3" />No telemetry</span>
                          ) : (
                            <div className="flex items-center gap-2 w-44">
                              {a.battery_charging ? <BatteryCharging className="h-4 w-4 text-[hsl(var(--success))]" /> : <Battery className="h-4 w-4" />}
                              <Progress value={a.battery_percent} className="h-2 flex-1" />
                              <span className="text-xs tabular-nums w-10 text-right">{a.battery_percent}%</span>
                              {stale ? (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">stale</Badge>
                              ) : health === 'critical' ? (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">crit</Badge>
                              ) : health === 'low' ? (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0">low</Badge>
                              ) : null}
                            </div>
                          )}
                          {a.battery_updated_at && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(parseISO(a.battery_updated_at), { addSuffix: true })}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{s ? <span className="font-medium">{s.user_name}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs">{s ? formatDistanceToNow(parseISO(s.started_at), { addSuffix: true }) : '—'}</TableCell>
                        <TableCell className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {a.status === 'in_safe' ? (
                            <Button size="sm" variant="outline" onClick={() => { setSelected(a); setIssueOpen(true); }}>
                              <ArrowRightLeft className="h-3 w-3 mr-1" />Issue
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => returnAsset(a)}>Return</Button>
                          )}
                          {canAssetsAdmin && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setEditAsset(a)}><Pencil className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteAsset(a.id)}><Trash2 className="h-3 w-3" /></Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No matching assets</TableCell></TableRow>}
                </TableBody>
              </Table>
              <TablePaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                rowsPerPage={pagination.rowsPerPage}
                onPageChange={pagination.setPage}
                onRowsPerPageChange={pagination.setRowsPerPage}
              />
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Wifi className="h-3 w-3" /> Open <code className="px-1 bg-muted rounded">/device/&lt;asset_tag&gt;</code> on a Chromebook for live battery streaming. iPads and Safari don't expose battery to the web — those show as "No telemetry".
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail drawer */}
      <AssetDetailDrawer asset={drawerAsset} open={!!drawerAsset} onOpenChange={(o) => !o && setDrawerAsset(null)} />

      {/* Issue Dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Issue To</Label>
              <Select value={issueTo.kind} onValueChange={(v) => setIssueTo({ ...issueTo, kind: v, id: '', name: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Staff Member</SelectItem>
                  <SelectItem value="visitor">Signed-in Visitor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{issueTo.kind === 'user' ? 'Select Staff' : 'Select Visitor'}</Label>
              <Select value={issueTo.id} onValueChange={(v) => {
                const found = issueTo.kind === 'user'
                  ? profiles.find(p => p.user_id === v)
                  : visitors.find(vi => vi.id === v);
                setIssueTo({ ...issueTo, id: v, name: found ? (found.full_name || found.visitor_name) : '' });
              }}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {issueTo.kind === 'user'
                    ? profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)
                    : visitors.map(v => <SelectItem key={v.id} value={v.id}>{v.visitor_name} ({v.badge_number})</SelectItem>)
                  }
                </SelectContent>
              </Select>
              {issueTo.kind === 'visitor' && visitors.length === 0 && <p className="text-xs text-muted-foreground mt-1">No signed-in visitors.</p>}
            </div>
            <div><Label>Notes</Label><Input value={issueTo.notes} onChange={(e) => setIssueTo({ ...issueTo, notes: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={issueTo.location} onChange={(e) => setIssueTo({ ...issueTo, location: e.target.value })} placeholder="Where this device is being used" /></div>
            <Button onClick={issue} className="w-full">Issue Device</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editAsset} onOpenChange={(o) => !o && setEditAsset(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Asset</DialogTitle></DialogHeader>
          {editAsset && canAssetsAdmin && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editAsset.name} onChange={(e) => setEditAsset({ ...editAsset, name: e.target.value })} /></div>
              <div><Label>Serial</Label><Input value={editAsset.serial_number || ''} onChange={(e) => setEditAsset({ ...editAsset, serial_number: e.target.value })} /></div>
              <div><Label>Location</Label><Input value={editAsset.location || ''} onChange={(e) => setEditAsset({ ...editAsset, location: e.target.value })} /></div>
              <div><Label>Notes</Label><Input value={editAsset.notes || ''} onChange={(e) => setEditAsset({ ...editAsset, notes: e.target.value })} /></div>
              <Button onClick={updateAsset} className="w-full">Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
