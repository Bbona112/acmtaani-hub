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
import { UserPlus, LogOut, Users, Settings, Trash2, Plus, Download, Printer, Monitor } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function FrontDesk() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [badgeVisitor, setBadgeVisitor] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [newField, setNewField] = useState({ field_key: '', field_label: '', field_type: 'text', required: false });

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

  const syncToSheet = async (visitor: any) => {
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
    } catch {}
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

  const activeCount = visitors.filter(v => !v.check_out).length;
  const enabledFields = fields.filter(f => f.enabled);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Front Desk</h1>
          <p className="text-muted-foreground mt-1">Visitor check-in, badges, and live presence</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          {role === 'admin' && (
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
              {visitors.map(v => (
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

function KioskSettingsForm({ settings, onSave }: { settings: any; onSave: (sheet: string, pin: string) => void }) {
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
