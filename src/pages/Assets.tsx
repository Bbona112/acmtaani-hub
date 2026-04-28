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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Laptop, Plus, ArrowRightLeft, Trash2, Battery, BatteryCharging, Activity, Pencil, Download } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { useTablePagination } from '@/hooks/useTablePagination';
import { getAppSettings } from '@/lib/appSettings';
import type { Database } from '@/integrations/supabase/types';

export default function Assets() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [volunteerModules, setVolunteerModules] = useState<string[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [visitors, setVisitors] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [newAsset, setNewAsset] = useState({ name: '', asset_type: 'chromebook', custom_asset_type: '', serial_number: '', notes: '' });
  const [issueTo, setIssueTo] = useState({ kind: 'user', id: '', name: '', notes: '', location: '' });
  const [filterType, setFilterType] = useState('all');
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);

  const canAssetsAdmin = role === 'admin' || (role === 'volunteer' && volunteerModules.includes('assets_admin'));

  const loadAll = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [a, s, p, v] = await Promise.all([
      supabase.from('assets').select('*').order('asset_tag'),
      supabase.from('asset_sessions').select('*').is('ended_at', null),
      supabase.from('directory_profiles').select('user_id, full_name'),
      supabase.from('visitors')
        .select('id, visitor_name, badge_number, check_in')
        .gte('check_in', today.toISOString())
        .is('check_out', null),
    ]);
    if (a.data) setAssets(a.data);
    if (s.data) setSessions(s.data);
    if (p.data) setProfiles(p.data);
    if (v.data) setVisitors(v.data);

    const { data: appSettings } = await supabase.from('app_settings').select('volunteer_admin_modules').limit(1).maybeSingle();
    const row = appSettings as (Pick<Database['public']['Tables']['app_settings']['Row'], 'volunteer_admin_modules'> & { volunteer_admin_modules?: string[] }) | null;
    setVolunteerModules(Array.isArray(row?.volunteer_admin_modules) ? row!.volunteer_admin_modules! : []);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel('assets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_sessions' }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const addAsset = async () => {
    if (!newAsset.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    const typeToUse = newAsset.asset_type === 'custom' ? newAsset.custom_asset_type.trim().toLowerCase() : newAsset.asset_type;
    const { error } = await supabase.from('assets').insert({
      name: newAsset.name,
      asset_type: typeToUse || 'other',
      serial_number: newAsset.serial_number,
      notes: newAsset.notes,
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
    const sessionData: any = {
      asset_id: selected.id, user_name: issueTo.name, notes: issueTo.notes, issued_by: user?.id,
    };
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

  const filtered = filterType === 'all' ? assets : assets.filter(a => a.asset_type === filterType);
  const inUse = assets.filter(a => a.status === 'in_use').length;
  const inSafe = assets.filter(a => a.status === 'in_safe').length;

  const sessionFor = (assetId: string) => sessions.find(s => s.asset_id === assetId);
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
    const rows = [['Tag', 'Name', 'Type', 'Status', 'User', 'Battery', 'Started']];
    assets.forEach(a => {
      const s = sessionFor(a.id);
      rows.push([a.asset_tag, a.name, a.asset_type, a.status, s?.user_name || '', a.battery_percent != null ? `${a.battery_percent}%` : '', s?.started_at || '']);
    });
    const csv = rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `assets-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trackable Assets</h1>
          <p className="text-muted-foreground mt-1">HP laptops and other trackable devices with live telemetry</p>
        </div>
        <div className="flex gap-2">
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
                      <Input
                        className="mt-2"
                        placeholder="Type e.g. projector_laptop"
                        value={newAsset.custom_asset_type}
                        onChange={(e) => setNewAsset({ ...newAsset, custom_asset_type: e.target.value })}
                      />
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Devices</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{assets.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4" />In Use</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-primary">{inUse}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">In Safe</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{inSafe}</p></CardContent></Card>
      </div>

      <Tabs value={filterType} onValueChange={setFilterType}>
        <TabsList>
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
            <CardHeader><CardTitle>Live Device Status</CardTitle><CardDescription>Real-time view of who's using what</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tag</TableHead><TableHead>Device</TableHead><TableHead>Type</TableHead>
                  <TableHead>Status</TableHead><TableHead>Battery</TableHead>
                  <TableHead>Current User</TableHead><TableHead>Started</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pagination.pagedRows.map(a => {
                    const s = sessionFor(a.id);
                    const staleMins = a.battery_updated_at ? Math.round((Date.now() - new Date(a.battery_updated_at).getTime()) / 60000) : null;
                    const batteryLabel = a.battery_percent == null
                      ? 'No telemetry'
                      : a.battery_percent < 20
                        ? 'Critical'
                        : a.battery_percent < 40
                          ? 'Low'
                          : 'Healthy';
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.asset_tag}</TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="capitalize">{a.asset_type}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === 'in_use' ? 'default' : a.status === 'in_safe' ? 'secondary' : 'outline'}>
                            {a.status === 'in_use' ? 'In Use' : a.status === 'in_safe' ? 'In Safe' : a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.battery_percent != null ? (
                            <div className="flex items-center gap-2 w-40">
                              {a.battery_charging ? <BatteryCharging className="h-4 w-4 text-[hsl(var(--success))]" /> : <Battery className="h-4 w-4" />}
                              <Progress value={a.battery_percent} className="h-2 flex-1" />
                              <span className="text-xs tabular-nums">{a.battery_percent}%</span>
                              <span className="text-[10px] text-muted-foreground">{batteryLabel}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">No telemetry</span>}
                          {staleMins != null && <p className="text-[10px] text-muted-foreground">Updated {staleMins}m ago</p>}
                        </TableCell>
                        <TableCell>{s ? <span className="font-medium">{s.user_name}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs">{s ? formatDistanceToNow(new Date(s.started_at), { addSuffix: true }) : '—'}</TableCell>
                        <TableCell className="flex gap-1">
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
                  {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No assets</TableCell></TableRow>}
                </TableBody>
              </Table>
              <TablePaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                rowsPerPage={pagination.rowsPerPage}
                onPageChange={pagination.setPage}
                onRowsPerPageChange={pagination.setRowsPerPage}
              />
              <p className="text-xs text-muted-foreground mt-3">
                💡 To enable live battery tracking on a device, open <code className="px-1 bg-muted rounded">/device/&lt;asset_tag&gt;</code> in that Chromebook's browser.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
