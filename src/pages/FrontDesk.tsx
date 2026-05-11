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
import { useToast } from '@/hooks/use-toast';
import { LogOut, Settings, Download, Printer, Monitor, ExternalLink, QrCode, Upload, Search, TrendingUp, History, RefreshCw, UserCheck } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { getAppSettings } from '@/lib/appSettings';
import { QRCodeCanvas } from 'qrcode.react';
import type { Database } from '@/integrations/supabase/types';

type VisitorRow = Database['public']['Tables']['visitors']['Row'];
type KioskSettingsRow = Database['public']['Tables']['kiosk_settings']['Row'];
type AppSettingsRow = Database['public']['Tables']['app_settings']['Row'] & {
  ms_form_url?: string;
  ms_forms_mapping?: Record<string, string>;
  volunteer_admin_modules?: string[];
};

const DEFAULT_MAPPING: Record<string, string> = {
  check_in: '', visitor_name: '', company: '', host_name: '', purpose: '', phone: '',
};

export default function FrontDesk() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [recentVisitors, setRecentVisitors] = useState<VisitorRow[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profileSearch, setProfileSearch] = useState('');
  const [historyVisitor, setHistoryVisitor] = useState<any | null>(null);
  const [history, setHistory] = useState<VisitorRow[]>([]);
  const [settings, setSettings] = useState<KioskSettingsRow | null>(null);
  const [app, setApp] = useState<AppSettingsRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formLinkOpen, setFormLinkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [badgeVisitor, setBadgeVisitor] = useState<VisitorRow | null>(null);
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);
  const [importText, setImportText] = useState('');
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>(DEFAULT_MAPPING);
  const [syncing, setSyncing] = useState(false);

  const canFrontDeskAdminTools = role === 'admin' || (role === 'volunteer' && (app?.volunteer_admin_modules || []).includes('frontdesk_admin_tools'));

  const loadAll = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = startOfDay(subDays(new Date(), 6));
    const [v, recent, s, p] = await Promise.all([
      supabase.from('visitors').select('*').gte('check_in', today.toISOString()).order('check_in', { ascending: false }),
      supabase.from('visitors').select('*').gte('check_in', weekAgo.toISOString()).order('check_in', { ascending: false }),
      supabase.from('kiosk_settings').select('*').limit(1).maybeSingle(),
      supabase.from('visitor_profiles').select('*').order('last_seen_at', { ascending: false }).limit(500),
    ]);
    if (v.data) setVisitors(v.data);
    if (recent.data) setRecentVisitors(recent.data);
    if (s.data) setSettings(s.data);
    if (p.data) setProfiles(p.data);
    const { data: appSettings } = await supabase.from('app_settings').select('*').limit(1).maybeSingle();
    if (appSettings) {
      const row = appSettings as AppSettingsRow;
      setApp(row);
      if (row?.ms_forms_mapping && typeof row.ms_forms_mapping === 'object' && Object.keys(row.ms_forms_mapping).length > 0) {
        setImportMapping((prev) => ({ ...prev, ...(row.ms_forms_mapping || {}) }));
      }
    }
  };

  useEffect(() => {
    loadAll();
    const channel = supabase.channel('visitors-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors' }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Today's check-in lookup by normalized name
  const todayByName = useMemo(() => {
    const map = new Map<string, VisitorRow>();
    visitors.forEach(v => map.set(v.visitor_name.trim().toLowerCase(), v));
    return map;
  }, [visitors]);

  // Quick check-in from a profile (imported via form)
  const quickCheckIn = async (p: any) => {
    if (!user) { toast({ title: 'Sign in required', variant: 'destructive' }); return; }
    const existing = todayByName.get((p.full_name || '').trim().toLowerCase());
    if (existing && !existing.check_out) {
      toast({ title: `${p.full_name} is already checked in`, description: `Badge ${existing.badge_number}` });
      setBadgeVisitor(existing); return;
    }
    const { data, error } = await supabase.from('visitors').insert({
      visitor_name: p.full_name, company: p.company || '', phone: p.phone || '',
      extra_fields: p.extra_fields || {}, checked_in_by: user.id, source: 'frontdesk',
      visitor_profile_id: p.id,
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Checked in', description: `${p.full_name} · ${data.badge_number}` });
    setBadgeVisitor(data);
    setProfileSearch('');
  };

  const checkOut = async (id: string) => {
    const { error } = await supabase.from('visitors').update({ check_out: new Date().toISOString() }).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Visitor checked out' });
  };

  const openHistory = async (p: any) => {
    setHistoryVisitor(p);
    const { data } = await supabase.from('visitors').select('*')
      .eq('visitor_profile_id', p.id).order('check_in', { ascending: false }).limit(50);
    setHistory(data || []);
  };

  const exportCSV = () => {
    const rows = [
      ['Badge', 'Name', 'Company', 'Host', 'Purpose', 'Phone', 'Check In', 'Check Out'],
      ...visitors.map(v => [v.badge_number, v.visitor_name, v.company, v.host_name, v.purpose, v.phone, v.check_in, v.check_out || '']),
    ];
    const csv = rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `visitors-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const saveSettings = async (sheetCsv: string, pin: string, webhook: string) => {
    if (settings) {
      await supabase.from('kiosk_settings').update({
        google_sheet_url: sheetCsv, exit_pin: pin, updated_by: user?.id,
      }).eq('id', settings.id);
    }
    if (app?.id) {
      await supabase.from('app_settings').update({ ms_form_url: webhook } as never).eq('id', app.id);
    }
    toast({ title: 'Saved' }); setSettingsOpen(false); loadAll();
  };

  // CSV parsing
  const parseCsv = (csv: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const parseLine = (line: string) => {
      const out: string[] = []; let cur = ''; let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
          inQuotes = !inQuotes; continue;
        }
        if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
        cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map((l) => {
      const cells = parseLine(l);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });
      return obj;
    });
    return { headers, rows };
  };

  const inferMapping = (headers: string[]) => {
    const pick = (cands: string[]) => headers.find((h) => cands.some((c) => h.toLowerCase() === c.toLowerCase())) || '';
    setImportMapping((m) => ({
      ...m,
      check_in: m.check_in || pick(['Timestamp', 'Completion time', 'Submit time', 'Date']),
      visitor_name: m.visitor_name || pick(['Name', 'Full Name', 'Visitor Name', 'visitor_name']),
      company: m.company || pick(['Company', 'Organization', 'Organisation']),
      host_name: m.host_name || pick(['Host', 'Host Name']),
      purpose: m.purpose || pick(['Purpose', 'Reason', 'Reason for visit']),
      phone: m.phone || pick(['Phone', 'Phone Number', 'Mobile']),
    }));
  };

  const applyImportText = (text: string) => {
    setImportText(text);
    const parsed = parseCsv(text);
    setImportHeaders(parsed.headers);
    if (parsed.headers.length) inferMapping(parsed.headers);
  };

  const runImport = async (rowsParsed?: { headers: string[]; rows: Record<string, string>[] }) => {
    if (!user) return;
    const { headers, rows } = rowsParsed || parseCsv(importText);
    if (headers.length === 0 || rows.length === 0) {
      toast({ title: 'No rows to import', variant: 'destructive' });
      return;
    }
    if (!importMapping.visitor_name) {
      toast({ title: 'Map a Visitor Name column first', variant: 'destructive' });
      return;
    }
    if (role === 'admin' && app?.id) {
      await supabase.from('app_settings').update({ ms_forms_mapping: importMapping, updated_by: user?.id } as never).eq('id', app.id);
    }

    // Build profile inserts (deduped by name+phone) + visitor inserts
    const profileMap = new Map<string, any>();
    const visitorInserts: any[] = [];
    rows.forEach((r) => {
      const name = (r[importMapping.visitor_name] || '').trim();
      if (!name) return;
      const phone = importMapping.phone ? (r[importMapping.phone] || '').trim() : '';
      const company = importMapping.company ? (r[importMapping.company] || '').trim() : '';
      const key = `${name.toLowerCase()}|${phone.replace(/\D/g, '')}`;
      profileMap.set(key, { full_name: name, phone, company, extra_fields: r });
      const checkInRaw = importMapping.check_in ? (r[importMapping.check_in] || '').trim() : '';
      const ci = checkInRaw ? new Date(checkInRaw) : new Date();
      const ciIso = isNaN(ci.getTime()) ? new Date().toISOString() : ci.toISOString();
      visitorInserts.push({
        visitor_name: name, company,
        host_name: importMapping.host_name ? (r[importMapping.host_name] || '').trim() : '',
        purpose: importMapping.purpose ? (r[importMapping.purpose] || '').trim() : '',
        phone, check_in: ciIso, checked_in_by: user.id, source: 'gform', extra_fields: r,
      });
    });

    // Upsert profiles
    const profileArr = Array.from(profileMap.values());
    if (profileArr.length) {
      await supabase.from('visitor_profiles').upsert(profileArr as any, { onConflict: 'normalized_name,normalized_phone' as any, ignoreDuplicates: true });
    }
    if (visitorInserts.length === 0) {
      toast({ title: 'No valid rows (missing names)', variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('visitors').insert(visitorInserts);
    if (error) {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' }); return;
    }
    toast({ title: 'Imported', description: `${visitorInserts.length} visitor(s) added` });
    setImportOpen(false); setImportText(''); setImportHeaders([]);
    loadAll();
  };

  const syncFromSheet = async () => {
    if (!settings?.google_sheet_url) {
      toast({ title: 'Set Google Sheet CSV URL in Kiosk Settings first', variant: 'destructive' });
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(settings.google_sheet_url, { method: 'GET' });
      const text = await res.text();
      const parsed = parseCsv(text);
      setImportHeaders(parsed.headers);
      if (parsed.headers.length) inferMapping(parsed.headers);
      // Need mapping — open dialog if not previously saved
      if (!importMapping.visitor_name) {
        setImportText(text);
        setImportOpen(true);
        toast({ title: 'Map columns and click Import' });
      } else {
        await runImport(parsed);
      }
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message || 'Could not fetch sheet (check sharing settings — must be "Publish to web" CSV)', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const activeCount = visitors.filter(v => !v.check_out).length;
  const pagination = useTablePagination(visitors, rowsPerPageDefault);

  useEffect(() => {
    getAppSettings().then((s) => {
      setRowsPerPageDefault(s.rows_per_page);
      pagination.setRowsPerPage(s.rows_per_page);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search results (profiles imported from form responses)
  const searchResults = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    if (!q) return [];
    return profiles.filter(p =>
      [p.full_name, p.phone, p.company].some((x: string) => x?.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [profileSearch, profiles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Front Desk</h1>
          <p className="text-muted-foreground mt-1">Visitors sign in via the form, then check in by name here</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={syncFromSheet} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />Sync from Sheet
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Paste CSV</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export</Button>
          {app?.ms_form_url && (
            <>
              <Button variant="outline" onClick={() => window.open(app.ms_form_url, '_blank')}><ExternalLink className="h-4 w-4 mr-2" />Open Form</Button>
              <Button variant="outline" onClick={() => setFormLinkOpen(true)}><QrCode className="h-4 w-4 mr-2" />Form QR</Button>
            </>
          )}
          {canFrontDeskAdminTools && (
            <>
              <Button variant="outline" asChild><Link to="/visitor-kiosk"><Monitor className="h-4 w-4 mr-2" />Open Kiosk</Link></Button>
              <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4 mr-2" />Settings</Button>
            </>
          )}
        </div>
      </div>

      {/* Quick Check-In by Name */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" />Check In By Name</CardTitle>
          <CardDescription>Type a visitor's name to check them in. Names come from the imported Google Form responses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus className="pl-9 h-11 text-base"
              placeholder="Start typing visitor's name..."
              value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)}
            />
          </div>
          {profileSearch.trim() && (
            <div className="space-y-1 max-h-72 overflow-auto">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  No match. Ask the visitor to sign in via the Google Form, then click <strong>Sync from Sheet</strong>.
                </p>
              ) : searchResults.map((p) => {
                const today = todayByName.get((p.full_name || '').trim().toLowerCase());
                const inBuilding = today && !today.check_out;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded border hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{p.full_name}</p>
                        {inBuilding && <Badge>In Building</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {[p.company, p.phone, p.badge_number].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openHistory(p)} title="Visit history"><History className="h-4 w-4" /></Button>
                    {inBuilding ? (
                      <Button size="sm" variant="outline" onClick={() => checkOut(today!.id)}><LogOut className="h-3 w-3 mr-1" />Check Out</Button>
                    ) : (
                      <Button size="sm" onClick={() => quickCheckIn(p)}><UserCheck className="h-3 w-3 mr-1" />Check In</Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">In Building Now</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{activeCount}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{visitors.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Checked Out</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{visitors.length - activeCount}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Last 7 Days</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{recentVisitors.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Visitors — Last 7 Days</CardTitle></CardHeader>
        <CardContent style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={Array.from({ length: 7 }).map((_, i) => {
              const d = startOfDay(subDays(new Date(), 6 - i));
              const next = startOfDay(subDays(new Date(), 5 - i));
              const count = recentVisitors.filter(v => new Date(v.check_in) >= d && new Date(v.check_in) < next).length;
              return { day: format(d, 'EEE'), count };
            })}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <RTooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today's Visitors</CardTitle>
          <CardDescription>{format(new Date(), 'EEEE, MMMM d, yyyy')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Badge</TableHead><TableHead>Visitor</TableHead><TableHead>Company</TableHead>
              <TableHead>Host</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead>
              <TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pagination.pagedRows.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.badge_number}</TableCell>
                  <TableCell className="font-medium">{v.visitor_name}</TableCell>
                  <TableCell>{v.company || '—'}</TableCell>
                  <TableCell>{v.host_name || '—'}</TableCell>
                  <TableCell>{format(new Date(v.check_in), 'h:mm a')}</TableCell>
                  <TableCell>{v.check_out ? format(new Date(v.check_out), 'h:mm a') : '—'}</TableCell>
                  <TableCell><Badge variant={v.check_out ? 'secondary' : 'default'}>{v.check_out ? 'Left' : 'In Building'}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setBadgeVisitor(v)}><Printer className="h-3 w-3" /></Button>
                    {!v.check_out && (
                      <Button size="sm" variant="outline" onClick={() => checkOut(v.id)}><LogOut className="h-3 w-3 mr-1" />Out</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {visitors.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No visitors today</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePaginationControls
            page={pagination.page} totalPages={pagination.totalPages}
            rowsPerPage={pagination.rowsPerPage}
            onPageChange={pagination.setPage} onRowsPerPageChange={pagination.setRowsPerPage}
          />
        </CardContent>
      </Card>

      {/* Badge Print Dialog */}
      <Dialog open={!!badgeVisitor} onOpenChange={() => setBadgeVisitor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Visitor Badge</DialogTitle></DialogHeader>
          {badgeVisitor && (
            <div id="badge-print" className="bg-white text-black border-2 border-black rounded-lg p-6 mx-auto" style={{ width: '3.375in', height: '2.125in' }}>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-wider">VISITOR</p>
                <p className="text-lg font-bold mt-2 leading-tight">{badgeVisitor.visitor_name}</p>
                {badgeVisitor.company && <p className="text-sm">{badgeVisitor.company}</p>}
                {badgeVisitor.host_name && <p className="text-xs mt-1">Host: {badgeVisitor.host_name}</p>}
                <p className="text-xs font-mono mt-2">{badgeVisitor.badge_number}</p>
                <p className="text-[10px] text-gray-600">{format(new Date(badgeVisitor.check_in), 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>
          )}
          <Button onClick={() => window.print()} className="w-full"><Printer className="h-4 w-4 mr-2" />Print Badge</Button>
        </DialogContent>
      </Dialog>

      {/* Form QR */}
      <Dialog open={formLinkOpen} onOpenChange={setFormLinkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Visitor Sign-in Form</DialogTitle></DialogHeader>
          {app?.ms_form_url ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center p-3 border rounded bg-white">
                <QRCodeCanvas value={app.ms_form_url} size={220} />
              </div>
              <p className="text-xs text-muted-foreground break-all">{app.ms_form_url}</p>
              <Button onClick={() => navigator.clipboard.writeText(app.ms_form_url || '')} variant="outline" className="w-full">Copy Link</Button>
              <Button onClick={() => window.open(app.ms_form_url, '_blank')} className="w-full">Open Form</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Set the Form URL in Settings first.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Import / Sheet sync dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Form Responses (CSV)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paste CSV from Google Form / Microsoft Form responses</Label>
              <textarea
                className="w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                value={importText}
                onChange={(e) => applyImportText(e.target.value)}
                placeholder='Paste CSV here (first row must be headers). Or set a "Publish to web" CSV link in Settings and use Sync from Sheet.'
              />
            </div>

            {importHeaders.length > 0 && (
              <div className="space-y-2">
                <Label>Map Columns</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['check_in','visitor_name','company','host_name','purpose','phone'] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">{k === 'check_in' ? 'Timestamp' : k.replace('_', ' ')}</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={importMapping[k] || ''}
                        onChange={(e) => setImportMapping({ ...importMapping, [k]: e.target.value })}
                      >
                        <option value="">(not mapped)</option>
                        {importHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Only <span className="font-medium">visitor name</span> is required.</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setImportText(''); setImportHeaders([]); }} className="flex-1">Clear</Button>
              <Button onClick={() => runImport()} className="flex-1">Import</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Front Desk Settings</DialogTitle></DialogHeader>
          <SettingsForm settings={settings} formUrl={app?.ms_form_url || ''} onSave={saveSettings} />
        </DialogContent>
      </Dialog>

      {/* Visitor History */}
      <Dialog open={!!historyVisitor} onOpenChange={(o) => !o && setHistoryVisitor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{historyVisitor?.full_name} — Visit History</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {history.length === 0 && <p className="text-sm text-muted-foreground">No prior visits recorded.</p>}
            {history.map(v => (
              <div key={v.id} className="flex items-center justify-between border rounded p-2 text-sm">
                <div>
                  <p className="font-medium">{format(new Date(v.check_in), 'PPp')}</p>
                  <p className="text-xs text-muted-foreground">{v.purpose || '—'} {v.host_name ? `· Host: ${v.host_name}` : ''}</p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{v.badge_number}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsForm({ settings, formUrl, onSave }: {
  settings: KioskSettingsRow | null;
  formUrl: string;
  onSave: (sheetCsv: string, pin: string, formUrl: string) => void;
}) {
  const [sheet, setSheet] = useState(settings?.google_sheet_url || '');
  const [pin, setPin] = useState(settings?.exit_pin || '1234');
  const [form, setForm] = useState(formUrl);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Google Form URL (for visitors to sign in)</Label>
        <Input value={form} onChange={(e) => setForm(e.target.value)} placeholder="https://forms.gle/..." />
        <p className="text-xs text-muted-foreground">Shown as the QR code visitors scan.</p>
      </div>
      <div className="space-y-1">
        <Label>Linked Google Sheet — Published CSV URL</Label>
        <Input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv" />
        <p className="text-xs text-muted-foreground">In Sheets: File → Share → Publish to web → CSV.</p>
      </div>
      <div className="space-y-1">
        <Label>Kiosk Exit PIN</Label>
        <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} />
      </div>
      <Button onClick={() => onSave(sheet, pin, form)} className="w-full">Save</Button>
    </div>
  );
}
