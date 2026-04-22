import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { User, Save, Download, Printer, Upload, Hash } from 'lucide-react';
import { GuidedTour } from '@/components/GuidedTour';

export default function ProfileSettings() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const staffCardInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ full_name: '', department: '', position: '', phone: '' });

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', department: profile.department || '', position: profile.position || '', phone: profile.phone || '' });
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('profiles').update(form).eq('user_id', user.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Profile updated!' }); await refreshProfile(); }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadErr) { toast({ title: 'Upload failed', description: uploadErr.message, variant: 'destructive' }); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('user_id', user.id);
    toast({ title: 'Photo uploaded!' });
    await refreshProfile();
    setUploading(false);
  };

  const handleStaffCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || role !== 'admin') return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/staff-card.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('staff-cards').upload(path, file, { upsert: true });
    if (uploadErr) {
      toast({ title: 'Upload failed', description: uploadErr.message, variant: 'destructive' });
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('staff-cards').getPublicUrl(path);
    await supabase.from('profiles').update({ staff_card_url: publicUrl } as any).eq('user_id', user.id);
    toast({ title: 'Staff card uploaded!' });
    await refreshProfile();
    setUploading(false);
  };

  const downloadBadge = useCallback(() => {
    const canvas = document.createElement('canvas');
    const w = 600, h = 400;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.roundRect(0, 0, w, h, 16); ctx.fill();
    ctx.fillStyle = '#1a1a2e'; ctx.roundRect(0, 0, w, 80, [16, 16, 0, 0]); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillText('ACMtaani Hub', 24, 50);
    ctx.fillStyle = '#111111'; ctx.font = 'bold 26px system-ui, sans-serif'; ctx.fillText(profile?.full_name || 'Member', 24, 130);
    ctx.fillStyle = '#4444cc'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText(profile?.position || 'Member', 24, 160);
    ctx.fillStyle = '#666666'; ctx.font = '16px system-ui, sans-serif'; ctx.fillText(profile?.department || '', 24, 185);
    ctx.fillStyle = '#888888'; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(profile?.email || '', 24, 220);
    if (profile?.employee_id) { ctx.fillStyle = '#444444'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillText(`ID: ${profile.employee_id}`, 24, 250); }
    ctx.fillStyle = '#999999'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('Scan QR to clock in/out', w - 200, h - 30);
    const qrCanvas = qrCanvasRef.current?.querySelector('canvas');
    if (qrCanvas) ctx.drawImage(qrCanvas, w - 210, 100, 180, 180);
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 2; ctx.roundRect(1, 1, w - 2, h - 2, 16); ctx.stroke();
    const link = document.createElement('a');
    link.download = `badge-${(profile?.full_name || 'member').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png'); link.click();
  }, [profile]);

  const printBadge = useCallback(() => {
    const pw = window.open('', '_blank');
    if (!pw) return;
    const qrCanvas = qrCanvasRef.current?.querySelector('canvas');
    const qrDataUrl = qrCanvas?.toDataURL('image/png') || '';
    pw.document.write(`<html><head><title>Badge</title><style>@page{size:3.375in 2.125in;margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:system-ui,sans-serif}.badge{width:3.375in;height:2.125in;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff}.header{background:#1a1a2e;color:#fff;padding:8px 12px;font-size:10px;font-weight:bold}.body{display:flex;padding:10px 12px;gap:10px}.info{flex:1}.name{font-size:14px;font-weight:bold;margin-bottom:4px}.position{font-size:11px;color:#4444cc;font-weight:bold;margin-bottom:2px}.detail{font-size:9px;color:#666;margin-bottom:2px}.qr img{width:90px;height:90px}.footer{text-align:right;padding:0 12px 6px;font-size:7px;color:#999}</style></head><body><div class="badge"><div class="header">ACMtaani Hub</div><div class="body"><div class="info"><div class="name">${profile?.full_name || ''}</div><div class="position">${profile?.position || 'Member'}</div><div class="detail">${profile?.department || ''}</div><div class="detail">${profile?.employee_id || ''}</div><div class="detail" style="margin-top:6px">${profile?.email || ''}</div></div><div class="qr"><img src="${qrDataUrl}" /></div></div><div class="footer">Scan QR to clock in/out</div></div></body></html>`);
    pw.document.close(); pw.onload = () => { pw.print(); };
  }, [profile]);

  const initials = profile?.full_name ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your personal information</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" /> Personal Information</CardTitle>
            <CardDescription>Update your profile details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar upload */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? 'Uploading...' : 'Upload Photo'}
                </Button>
              </div>
            </div>

            {profile?.employee_id && (
              <div className="space-y-2">
                <Label>Employee ID</Label>
                <div className="flex items-center gap-2 text-sm font-mono bg-muted p-2 rounded"><Hash className="h-4 w-4" /> {profile.employee_id}</div>
              </div>
            )}
            <div className="space-y-2"><Label htmlFor="full_name">Full Name</Label><Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="department">Department</Label><Input id="department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="position">Position</Label><Input id="position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={profile?.email || ''} disabled className="bg-muted" /></div>
            <Button onClick={handleSave} disabled={loading}><Save className="h-4 w-4 mr-2" />{loading ? 'Saving...' : 'Save Changes'}</Button>
            <div className="pt-2">
              <GuidedTour />
            </div>
            <div className="space-y-2 border-t pt-4">
              <Label>Staff Card</Label>
              {profile?.staff_card_url ? (
                <a href={profile.staff_card_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">View uploaded staff card</a>
              ) : (
                <p className="text-xs text-muted-foreground">No staff card uploaded</p>
              )}
              {role === 'admin' && (
                <div>
                  <input ref={staffCardInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleStaffCardUpload} />
                  <Button variant="outline" size="sm" onClick={() => staffCardInputRef.current?.click()} disabled={uploading}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? 'Uploading...' : 'Upload Staff Card'}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Your Badge QR</CardTitle>
            <CardDescription>Show this at the kiosk to clock in/out</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {user && (
              <>
                <div className="bg-white p-4 rounded-lg border border-border"><QRCodeSVG value={`EMS:${user.id}`} size={160} level="M" bgColor="#ffffff" /></div>
                <div ref={qrCanvasRef} className="hidden"><QRCodeCanvas value={`EMS:${user.id}`} size={300} level="M" bgColor="#ffffff" /></div>
              </>
            )}
            <p className="text-xs text-muted-foreground text-center max-w-[180px]">This QR code is unique to your account</p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" size="sm" className="flex-1" onClick={downloadBadge}><Download className="h-3.5 w-3.5 mr-1" /> Download</Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={printBadge}><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
