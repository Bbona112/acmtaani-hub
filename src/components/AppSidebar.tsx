import { LayoutDashboard, Users, Clock, ListTodo, LogOut, Settings, Monitor, Package, MessageCircle, CalendarDays } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'My Tasks', url: '/tasks', icon: ListTodo },
  { title: 'Attendance', url: '/attendance', icon: Clock },
  { title: 'Directory', url: '/directory', icon: Users },
  { title: 'Inventory', url: '/inventory', icon: Package },
  { title: 'Chat', url: '/chat', icon: MessageCircle },
  { title: 'Calendar', url: '/calendar', icon: CalendarDays },
  { title: 'Kiosk Mode', url: '/kiosk', icon: Monitor },
  { title: 'Profile', url: '/profile', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { profile, role, signOut } = useAuth();

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 py-2">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs font-bold">A</span>
                </div>
                <span className="font-semibold text-foreground text-sm">ACMtaani Hub</span>
              </div>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
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
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground capitalize">{role}</p>
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && 'Sign out'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
