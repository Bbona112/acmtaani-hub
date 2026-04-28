import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, Mail, Phone, Building, Shield, Pencil, Hash } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

export default function Directory() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [volunteerModules, setVolunteerModules] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<any>(null);
  const [editRole, setEditRole] = useState('');

  const canDirectoryAdmin = role === 'admin' || (role === 'volunteer' && volunteerModules.includes('directory_admin'));

  const load = async () => {
    // For admins: full profile data (admin RLS allows). For others: safe directory view.
    if (canDirectoryAdmin) {
      const { data } = await supabase.from('profiles').select('*').order('full_name');
      if (data) setProfiles(data);
      const { data: r } = await supabase.from('user_roles').select('user_id, role');
      if (r) {
        const m: Record<string, string> = {};
        r.forEach((x: { user_id: string; role: string }) => { m[x.user_id] = x.role; });
        setRoles(m);
      }
    } else {
      const { data } = await (supabase as any).from('directory_profiles').select('*').order('full_name');
      if (data) setProfiles(data);
    }
  };

  useEffect(() => {
    supabase.from('app_settings').select('volunteer_admin_modules').limit(1).maybeSingle().then(({ data }) => {
      const row = data as (Pick<Database['public']['Tables']['app_settings']['Row'], 'volunteer_admin_modules'> & { volunteer_admin_modules?: string[] }) | null;
      setVolunteerModules(Array.isArray(row?.volunteer_admin_modules) ? row!.volunteer_admin_modules! : []);
    });
  }, []);

  useEffect(() => { load(); }, [role, volunteerModules.join('|')]);

  const filtered = profiles.filter((p) =>
    [p.full_name, p.email, p.department, p.position, p.employee_id].some((f) =>
      f?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const startEdit = (p: any) => {
    setEditProfile({ ...p });
    setEditRole(roles[p.user_id] || 'employee');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editProfile) return;
    const { error } = await supabase.from('profiles').update({
      full_name: editProfile.full_name, department: editProfile.department,
      position: editProfile.position, phone: editProfile.phone,
    }).eq('id', editProfile.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    // Update role if changed
    const currentRole = roles[editProfile.user_id];
    if (editRole !== currentRole) {
      if (currentRole) {
        await supabase.from('user_roles').update({ role: editRole as any }).eq('user_id', editProfile.user_id);
      } else {
        await supabase.from('user_roles').insert({ user_id: editProfile.user_id, role: editRole as any });
      }
    }
    toast({ title: 'Updated successfully' });
    setEditOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employee Directory</h1>
        <p className="text-muted-foreground mt-1">Search and browse the staff directory</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email, department, ID..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          {editProfile && (
            <div className="space-y-4 mt-2">
              <div><Label>Employee ID</Label><Input value={editProfile.employee_id || ''} disabled className="bg-muted font-mono" /></div>
              <div className="space-y-1"><Label>Full Name</Label><Input value={editProfile.full_name} onChange={(e) => setEditProfile({ ...editProfile, full_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Department</Label><Input value={editProfile.department || ''} onChange={(e) => setEditProfile({ ...editProfile, department: e.target.value })} /></div>
              <div className="space-y-1"><Label>Position</Label><Input value={editProfile.position || ''} onChange={(e) => setEditProfile({ ...editProfile, position: e.target.value })} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={editProfile.phone || ''} onChange={(e) => setEditProfile({ ...editProfile, phone: e.target.value })} /></div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={saveEdit} className="w-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const initials = p.full_name ? p.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';
          const userRole = roles[p.user_id];
          const avatarUrl = p.avatar_url || null;
          return (
            <Card key={p.id} className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    {avatarUrl && <AvatarImage src={avatarUrl} />}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{p.full_name || 'Unnamed'}</p>
                      {canDirectoryAdmin && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(p)}><Pencil className="h-3 w-3" /></Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.position || 'No position'}</p>
                    {p.employee_id && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Hash className="h-3 w-3" /> {p.employee_id}</div>
                    )}
                    {p.department && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Building className="h-3 w-3" /> {p.department}</div>
                    )}
                    {p.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {p.email}</div>
                    )}
                    {p.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {p.phone}</div>
                    )}
                    {canDirectoryAdmin && userRole && (
                      <Badge variant="outline" className="text-xs mt-1"><Shield className="h-3 w-3 mr-1" /> {userRole}</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-12">No employees found.</p>}
      </div>
    </div>
  );
}
