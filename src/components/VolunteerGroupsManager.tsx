import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users, Pencil } from "lucide-react";

interface ModuleDef { key: string; label: string }

interface Group {
  id: string;
  name: string;
  description: string;
}

interface Member { id: string; group_id: string; user_id: string }
interface ModuleRow { id: string; group_id: string; module_key: string }
interface ProfileLite { user_id: string; full_name: string; email: string }

export function VolunteerGroupsManager({ modules }: { modules: ModuleDef[] }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [moduleRows, setModuleRows] = useState<ModuleRow[]>([]);
  const [volunteers, setVolunteers] = useState<ProfileLite[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const load = async () => {
    const [g, m, mods, profs, roles] = await Promise.all([
      supabase.from("volunteer_groups").select("*").order("name"),
      supabase.from("volunteer_group_members").select("*"),
      supabase.from("volunteer_group_modules").select("*"),
      supabase.from("profiles").select("user_id, full_name, email").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setGroups((g.data as Group[]) || []);
    setMembers((m.data as Member[]) || []);
    setModuleRows((mods.data as ModuleRow[]) || []);
    const volIds = new Set((roles.data || []).filter((r: any) => r.role === "volunteer").map((r: any) => r.user_id));
    setVolunteers(((profs.data as ProfileLite[]) || []).filter((p) => volIds.has(p.user_id)));
  };

  useEffect(() => { load(); }, []);

  const createGroup = async () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    const { error } = await supabase.from("volunteer_groups").insert({ name: form.name.trim(), description: form.description.trim() });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setForm({ name: "", description: "" });
    setCreateOpen(false);
    load();
  };

  const updateGroup = async () => {
    if (!editing) return;
    const { error } = await supabase.from("volunteer_groups").update({ name: editing.name, description: editing.description }).eq("id", editing.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setEditing(null);
    load();
  };

  const deleteGroup = async (id: string) => {
    if (!confirm("Delete this group? Members will lose access granted via this group.")) return;
    await supabase.from("volunteer_groups").delete().eq("id", id);
    load();
  };

  const toggleMember = async (groupId: string, userId: string, on: boolean) => {
    if (on) await supabase.from("volunteer_group_members").insert({ group_id: groupId, user_id: userId });
    else await supabase.from("volunteer_group_members").delete().eq("group_id", groupId).eq("user_id", userId);
    load();
  };

  const toggleModule = async (groupId: string, moduleKey: string, on: boolean) => {
    if (on) await supabase.from("volunteer_group_modules").insert({ group_id: groupId, module_key: moduleKey });
    else await supabase.from("volunteer_group_modules").delete().eq("group_id", groupId).eq("module_key", moduleKey);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Volunteer Groups</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Bundle modules and assign volunteers to those bundles.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />New Group</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No groups yet. Create one to grant module access to specific volunteers.</p>}
        {groups.map((g) => {
          const groupMembers = members.filter((m) => m.group_id === g.id);
          const groupModules = moduleRows.filter((m) => m.group_id === g.id);
          return (
            <div key={g.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary"><Users className="h-3 w-3 mr-1" />{groupMembers.length} members</Badge>
                    <Badge variant="outline">{groupModules.length} modules</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(g)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteGroup(g.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Modules</Label>
                  <div className="space-y-1 mt-1 max-h-40 overflow-auto">
                    {modules.map((m) => {
                      const on = groupModules.some((x) => x.module_key === m.key);
                      return (
                        <label key={m.key} className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-muted">
                          <span>{m.label}</span>
                          <Switch checked={on} onCheckedChange={(v) => toggleModule(g.id, m.key, v)} />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Volunteers</Label>
                  <div className="space-y-1 mt-1 max-h-40 overflow-auto">
                    {volunteers.length === 0 && <p className="text-xs text-muted-foreground">No volunteers yet. Assign the volunteer role from the Directory.</p>}
                    {volunteers.map((v) => {
                      const on = groupMembers.some((x) => x.user_id === v.user_id);
                      return (
                        <label key={v.user_id} className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-muted">
                          <span className="truncate">{v.full_name || v.email}</span>
                          <Switch checked={on} onCheckedChange={(c) => toggleMember(g.id, v.user_id, c)} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Volunteer Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Front Desk Team" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button onClick={createGroup} className="w-full">Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Group</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <Button onClick={updateGroup} className="w-full">Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
