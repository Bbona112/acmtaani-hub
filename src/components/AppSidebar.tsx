import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Clock, ListTodo, LogOut, Settings, Monitor, Package, MessageCircle, CalendarDays, Upload, ClipboardList, UserCheck, Laptop, BookOpen, BarChart3, BookText } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'My Tasks', url: '/tasks', icon: ListTodo },
  { title: 'Attendance', url: '/attendance', icon: Clock },
  { title: 'Duty Roster', url: '/duty-roster', icon: ClipboardList },
  { title: 'Front Desk', url: '/front-desk', icon: UserCheck },
  { title: 'Directory', url: '/directory', icon: Users },
  { title: 'Assets', url: '/assets', icon: Laptop },
  { title: 'Library', url: '/books', icon: BookOpen },
  { title: 'Analytics', url: '/analytics', icon: BarChart3 },
  { title: 'Manual', url: '/manual', icon: BookText },
  { title: 'Inventory', url: '/inventory', icon: Package },
  { title: 'Chat', url: '/chat', icon: MessageCircle },
  { title: 'Calendar', url: '/calendar', icon: CalendarDays },
  { title: 'Kiosk Mode', url: '/kiosk', icon: Monitor },
  { title: 'Profile', url: '/profile', icon: Settings },
  { title: 'Master Settings', url: '/settings', icon: Settings, adminOnly: true },
];

type AppSettingsRow = Database['public']['Tables']['app_settings']['Row'] & { volunteer_admin_modules?: string[] };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { profile, role, signOut } = useAuth();
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [volunteerModules, setVolunteerModules] = useState<string[]>([]);

  useEffect(() => {
    const { data } = supabase.storage.from('site-assets').getPublicUrl('logo.png');
    fetch(data.publicUrl, { method: 'HEAD' }).then(r => { if (r.ok) setLogoUrl(data.publicUrl + '?t=' + Date.now()); }).catch(() => {});
    supabase.from('app_settings').select('*').limit(1).maybeSingle().then(({ data: s }) => {
      const row = s as AppSettingsRow | null;
      const mods = row?.volunteer_admin_modules;
      setVolunteerModules(Array.isArray(mods) ? mods : []);
    });
  }, []);

  const can = (moduleKey: string) => role === 'admin' || (role === 'volunteer' && volunteerModules.includes(moduleKey));

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { error } = await supabase.storage.from('site-assets').upload('logo.png', file, { upsert: true });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else {
      const { data } = supabase.storage.from('site-assets').getPublicUrl('logo.png');
      setLogoUrl(data.publicUrl + '?t=' + Date.now());
      toast({ title: 'Logo uploaded!' }); setLogoDialogOpen(false);
    }
    setUploading(false);
  };

  const initials = profile?.full_name ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 py-2">
            {!collapsed && (
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-contain" />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground text-xs font-bold">A</span>
                  </div>
                )}
                <span className="font-semibold text-foreground text-sm">ACMtaani Hub</span>
                {can('master_settings') && (
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => setLogoDialogOpen(true)}>
                    <Upload className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {navItems.filter(item => !item.adminOnly || can('master_settings')).map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="h-4 w-4 mr-2 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="h-8 w-8">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground capitalize">{role}</p>
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />{!collapsed && 'Sign out'}
        </Button>
      </SidebarFooter>

      <Dialog open={logoDialogOpen} onOpenChange={setLogoDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Site Logo</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {logoUrl && <img src={logoUrl} alt="Current logo" className="w-20 h-20 object-contain mx-auto" />}
            <div className="space-y-1">
              <Label>Choose logo image</Label>
              <Input type="file" accept="image/*" onChange={uploadLogo} disabled={uploading} />
            </div>
            <p className="text-xs text-muted-foreground">Recommended: square PNG, at least 200×200px</p>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
