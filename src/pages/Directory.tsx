import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Mail, Phone, Building } from 'lucide-react';

export default function Directory() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => {
      if (data) setProfiles(data);
    });
  }, []);

  const filtered = profiles.filter((p) =>
    [p.full_name, p.email, p.department, p.position].some((f) =>
      f?.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employee Directory</h1>
        <p className="text-muted-foreground mt-1">Search and browse the staff directory</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, department..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const initials = p.full_name
            ? p.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
            : '?';
          return (
            <Card key={p.id} className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-semibold truncate">{p.full_name || 'Unnamed'}</p>
                    <p className="text-sm text-muted-foreground">{p.position || 'No position'}</p>
                    {p.department && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Building className="h-3 w-3" /> {p.department}
                      </div>
                    )}
                    {p.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {p.email}
                      </div>
                    )}
                    {p.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-12">No employees found.</p>
        )}
      </div>
    </div>
  );
}
