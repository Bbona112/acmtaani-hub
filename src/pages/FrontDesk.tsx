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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, LogOut, Users, Settings, Trash2, Plus, Download, Printer, Monitor, ExternalLink, QrCode, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePaginationControls } from '@/components/TablePaginationControls';
import { getAppSettings } from '@/lib/appSettings';
import { QRCodeCanvas } from 'qrcode.react';
import type { Database } from '@/integrations/supabase/types';

type VisitorRow = Database['public']['Tables']['visitors']['Row'];
type VisitorFieldRow = Database['public']['Tables']['visitor_form_fields']['Row'];
type KioskSettingsRow = Database['public']['Tables']['kiosk_settings']['Row'];
type AppSettingsRow = Database['public']['Tables']['app_settings']['Row'] & {
  ms_form_url?: string;
  ms_forms_mapping?: Record<string, string>;
  volunteer_admin_modules?: string[];
};

export default function FrontDesk() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [fields, setFields] = useState<VisitorFieldRow[]>([]);
  const [settings, setSettings] = useState<KioskSettingsRow | null>(null);
  const [app, setApp] = useState<AppSettingsRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formLinkOpen, setFormLinkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [badgeVisitor, setBadgeVisitor] = useState<VisitorRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [rowsPerPageDefault, setRowsPerPageDefault] = useState(10);
  const [newField, setNewField] = useState({ field_key: '', field_label: '', field_type: 'text', required: false });
  const [importText, setImportText] = useState('');
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({
    check_in: '',
    visitor_name: '',
    company: '',
    host_name: '',
    purpose: '',
    phone: '',
  });

  const canFrontDeskAdminTools = role === 'admin' || (role === 'volunteer' && (app?.volunteer_admin_modules || []).includes('frontdesk_admin_tools'));

  const loadAll = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [v, f, s] = await Promise.all([
      supabase.from('visitors').select('*').gte('check_in', today.toISOString()).order('check_in', { ascending: false }),
      supabase.from('visitor_form_fields').select('*').order('display_order'),
      supabase.from('kiosk_settings').select('*').limit(1).maybeSingle(),
    ]);
    if (v.data) setVisitors(v.data);
    if (f.data) setFields(f.data);
    if (s.data) setSettings(s.data);
    const { data: appSettings } = await supabase.from('app_settings').select('*').limit(1).maybeSingle();
    if (appSettings) {
      const row = appSettings as AppSettingsRow;
      setApp(row);
      if (row?.ms_forms_mapping && typeof row.ms_forms_mapping === 'object') {
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

  const checkIn = async () => {
    const reqMissing = fields.filter(f => f.enabled && f.required && !form[f.field_key]?.trim());
    if (reqMissing.length) {
      toast({ title: 'Missing required field', description: reqMissing[0].field_label, variant: 'destructive' });
      return;
    }
    const { visitor_name = '', company = '', host_name = '', purpose = '', phone = '', ...extras } = form;
    if (!visitor_name.trim()) {
      toast({ title: 'Visitor name required', variant: 'destructive' }); return;
    }
    const { data, error } = await supabase.from('visitors').insert({
      visitor_name, company, host_name, purpose, phone,
      extra_fields: extras, checked_in_by: user?.id, source: 'frontdesk',
    }).select().single();
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Visitor checked in!' });
    setForm({}); setDialogOpen(false); setBadgeVisitor(data);
    syncToSheet(data);
  };

  const syncToSheet = async (visitor: VisitorRow) => {
    if (!settings?.google_sheet_url) return;
    try {
      await fetch(settings.google_sheet_url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badge_number: visitor.badge_number,
          visitor_name: visitor.visitor_name, company: visitor.company,
          host_name: visitor.host_name, purpose: visitor.purpose,
          phone: visitor.phone, check_in: visitor.check_in,
        }),
      });
    } catch {
      // optional webhook sync
    }
  };

  const checkOut = async (id: string) => {
    const { error } = await supabase.from('visitors').update({ check_out: new Date().toISOString() }).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Visitor checked out' });
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

  const addField = async () => {
    if (!newField.field_key.trim() || !newField.field_label.trim()) {
      toast({ title: 'Key and label required', variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('visitor_form_fields').insert({
      ...newField, display_order: fields.length + 1,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { setNewField({ field_key: '', field_label: '', field_type: 'text', required: false }); loadAll(); }
  };
  const toggleField = async (id: string, key: 'required' | 'enabled', val: boolean) => {
    const update = key === 'required' ? { required: val } : { enabled: val };
    await supabase.from('visitor_form_fields').update(update).eq('id', id);
    loadAll();
  };
  const deleteField = async (id: string) => {
    await supabase.from('visitor_form_fields').delete().eq('id', id);
    loadAll();
  };
  const saveSettings = async (sheet: string, pin: string) => {
    if (settings) await supabase.from('kiosk_settings').update({ google_sheet_url: sheet, exit_pin: pin, updated_by: user?.id }).eq('id', settings.id);
    toast({ title: 'Saved' }); setSettingsOpen(false); loadAll();
  };

  const parseCsv = (csv: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line: string) => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
          inQuotes = !inQuotes;
          continue;
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
    const pick = (candidates: string[]) => headers.find((h) => candidates.some((c) => h.toLowerCase() === c.toLowerCase())) || '';
    setImportMapping((m) => ({
      ...m,
      check_in: m.check_in || pick(['Completion time', 'Submit time', 'Timestamp', 'Date']),
      visitor_name: m.visitor_name || pick(['Name', 'Full Name', 'Visitor Name', 'visitor_name']),
      company: m.company || pick(['Company', 'Organization', 'Organisation']),
      host_name: m.host_name || pick(['Host', 'Host Name']),
      purpose: m.purpose || pick(['Purpose', 'Reason for visit']),
      phone: m.phone || pick(['Phone', 'Phone Number', 'Mobile']),
    }));
  };

  const applyImportText = (text: string) => {
    setImportText(text);
    const parsed = parseCsv(text);
    setImportHeaders(parsed.headers);
    if (parsed.headers.length) inferMapping(parsed.headers);
  };

  const saveMappingToSettings = async (mapping: Record<string, string>) => {
    if (role !== 'admin') return;
    if (!app?.id) return;
    await supabase.from('app_settings').update({ ms_forms_mapping: mapping, updated_by: user?.id } as never).eq('id', app.id);
  };

  const importFromMsFormsCsv = async () => {
    if (!user) return;
    const { headers, rows } = parseCsv(importText);
    if (headers.length === 0 || rows.length === 0) {
      toast({ title: 'No rows to import', variant: 'destructive' });
      return;
    }
    if (!importMapping.visitor_name) {
      toast({ title: 'Map a Visitor Name column first', variant: 'destructive' });
      return;
    }

    await saveMappingToSettings(importMapping);

    const inserts = rows.map((r) => {
      const name = (r[importMapping.visitor_name] || '').trim();
      if (!name) return null;
      const checkInRaw = importMapping.check_in ? (r[importMapping.check_in] || '').trim() : '';
      const checkIn = checkInRaw ? new Date(checkInRaw) : new Date();
      const checkInIso = isNaN(checkIn.getTime()) ? new Date().toISOString() : checkIn.toISOString();
      return {
        visitor_name: name,
        company: importMapping.company ? (r[importMapping.company] || '').trim() : '',
        host_name: importMapping.host_name ? (r[importMapping.host_name] || '').trim() : '',
        purpose: importMapping.purpose ? (r[importMapping.purpose] || '').trim() : '',
        phone: importMapping.phone ? (r[importMapping.phone] || '').trim() : '',
        check_in: checkInIso,
        checked_in_by: user.id,
        source: 'msforms',
        extra_fields: r,
      };
    }).filter((x): x is Database['public']['Tables']['visitors']['Insert'] => Boolean(x));

    if (inserts.length === 0) {
      toast({ title: 'No valid rows found (missing names)', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('visitors').insert(inserts);
    if (error) {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Imported', description: `${inserts.length} visitor(s) added` });
    setImportOpen(false);
    setImportText('');
    setImportHeaders([]);
    loadAll();
  };

  const activeCount = visitors.filter(v => !v.check_out).length;
  const enabledFields = fields.filter(f => f.enabled);
  const pagination = useTablePagination(visitors, rowsPerPageDefault);

  useEffect(() => {
    getAppSettings().then((s) => {
      setRowsPerPageDefault(s.rows_per_page);
      pagination.setRowsPerPage(s.rows_per_page);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Front Desk</h1>
          <p className="text-muted-foreground mt-1">Visitor check-in, badges, and live presence</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          {app?.ms_form_url && (
            <>
              <Button variant="outline" onClick={() => window.open(app.ms_form_url, '_blank')}><ExternalLink className="h-4 w-4 mr-2" />Open Form</Button>
              <Button variant="outline" onClick={() => setFormLinkOpen(true)}><QrCode className="h-4 w-4 mr-2" />Form QR</Button>
            </>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Import Form CSV</Button>
          {canFrontDeskAdminTools && (
            <>
              <Button variant="outline" asChild><Link to="/visitor-kiosk"><Monitor className="h-4 w-4 mr-2" />Open Kiosk</Link></Button>
              <Button variant="outline" onClick={() => setFieldsOpen(true)}><Settings className="h-4 w-4 mr-2" />Form Fields</Button>
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>Kiosk Settings</Button>
            </>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" />Check In Visitor</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Check In Visitor</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                {enabledFields.map(f => (
                  <div key={f.id} className="space-y-1">
                    <Label>{f.field_label}{f.required && ' *'}</Label>
                    <Input
                      type={f.field_type}
                      value={form[f.field_key] || ''}
                      onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    />
                  </div>
                ))}
                <Button onClick={checkIn} className="w-full">Check In & Print Badge</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">In Building</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{activeCount}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">New Today</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{visitors.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Checked Out</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{visitors.length - activeCount}</p></CardContent></Card>
      </div>

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
            page={pagination.page}
            totalPages={pagination.totalPages}
            rowsPerPage={pagination.rowsPerPage}
            onPageChange={pagination.setPage}
            onRowsPerPageChange={pagination.setRowsPerPage}
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

      {/* Microsoft Form QR */}
      <Dialog open={formLinkOpen} onOpenChange={setFormLinkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Microsoft Form (Visitor Check-in)</DialogTitle></DialogHeader>
          {app?.ms_form_url ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center p-3 border rounded bg-white">
                <QRCodeCanvas value={app.ms_form_url} size={220} />
              </div>
              <p className="text-xs text-muted-foreground break-all">{app.ms_form_url}</p>
              <Button onClick={() => navigator.clipboard.writeText(app.ms_form_url)} variant="outline" className="w-full">Copy Link</Button>
              <Button onClick={() => window.open(app.ms_form_url, '_blank')} className="w-full">Open Form</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Set the Microsoft Form URL in Master Settings first.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Import MS Forms CSV */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Microsoft Forms CSV</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paste CSV (exported from Microsoft Forms responses)</Label>
              <textarea
                className="w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={importText}
                onChange={(e) => applyImportText(e.target.value)}
                placeholder='Paste CSV here (first row must be headers)'
              />
              <p className="text-xs text-muted-foreground">
                Tip: open the CSV in Excel and copy all, then paste here.
              </p>
            </div>

            {importHeaders.length > 0 && (
              <div className="space-y-2">
                <Label>Column Mapping</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['check_in','visitor_name','company','host_name','purpose','phone'] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">{k === 'check_in' ? 'Check-in Time' : k.replace('_', ' ')}</Label>
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
                <p className="text-xs text-muted-foreground">
                  Only <span className="font-medium">visitor_name</span> is required; all others are optional.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setImportText(''); setImportHeaders([]); }} className="flex-1">Clear</Button>
              <Button onClick={importFromMsFormsCsv} className="flex-1">Import</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form Fields Editor */}
      <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Visitor Form Fields</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.id} className="flex items-center gap-2 p-2 border rounded">
                <span className="font-mono text-xs w-24 shrink-0">{f.field_key}</span>
                <span className="flex-1">{f.field_label}</span>
                <div className="flex items-center gap-2 text-xs"><span>Required</span><Switch checked={f.required} onCheckedChange={(v) => toggleField(f.id, 'required', v)} /></div>
                <div className="flex items-center gap-2 text-xs"><span>Enabled</span><Switch checked={f.enabled} onCheckedChange={(v) => toggleField(f.id, 'enabled', v)} /></div>
                <Button size="sm" variant="ghost" onClick={() => deleteField(f.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            <div className="border-t pt-3 space-y-2">
              <Label>Add New Field</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="field_key (lowercase)" value={newField.field_key} onChange={(e) => setNewField({ ...newField, field_key: e.target.value.toLowerCase().replace(/\s/g, '_') })} />
                <Input placeholder="Display Label" value={newField.field_label} onChange={(e) => setNewField({ ...newField, field_label: e.target.value })} />
              </div>
              <div className="flex items-center gap-2"><Switch checked={newField.required} onCheckedChange={(v) => setNewField({ ...newField, required: v })} /><span className="text-sm">Required</span></div>
              <Button onClick={addField} size="sm"><Plus className="h-3 w-3 mr-1" />Add Field</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kiosk Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Kiosk Settings</DialogTitle></DialogHeader>
          <KioskSettingsForm settings={settings} onSave={saveSettings} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KioskSettingsForm({ settings, onSave }: { settings: KioskSettingsRow | null; onSave: (sheet: string, pin: string) => void }) {
  const [sheet, setSheet] = useState(settings?.google_sheet_url || '');
  const [pin, setPin] = useState(settings?.exit_pin || '1234');
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Google Sheets Webhook URL</Label>
        <Input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://script.google.com/.../exec" />
        <p className="text-xs text-muted-foreground">Create an Apps Script Web App that accepts POST requests and appends to your sheet.</p>
      </div>
      <div className="space-y-1">
        <Label>Kiosk Exit PIN</Label>
        <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} />
      </div>
      <Button onClick={() => onSave(sheet, pin)} className="w-full">Save</Button>
    </div>
  );
}
