import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, CalendarDays, User } from 'lucide-react';
import { format } from 'date-fns';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'bg-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-primary/10' },
  { id: 'done', label: 'Done', color: 'bg-[hsl(var(--success))]/10' },
];

export default function Tasks() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [editTask, setEditTask] = useState<any>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', assigned_to: '', due_date: '' });

  const loadTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (data) {
      const { data: profs } = await supabase.from('profiles').select('user_id, full_name');
      const profMap: Record<string, string> = {};
      profs?.forEach(p => { profMap[p.user_id] = p.full_name; });
      setTasks(data.map(t => ({ ...t, _assignee: profMap[t.assigned_to] || 'Unassigned', _creator: profMap[t.created_by] || 'Unknown' })));
    }
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name').order('full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => {
    loadTasks();
    if (role === 'admin') loadProfiles();
    const channel = supabase.channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  const createTask = async () => {
    if (!newTask.title.trim() || !user) return;
    const { error } = await supabase.from('tasks').insert({
      title: newTask.title, description: newTask.description,
      assigned_to: newTask.assigned_to || null, created_by: user.id, due_date: newTask.due_date || null,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Task created' }); setDialogOpen(false); setNewTask({ title: '', description: '', assigned_to: '', due_date: '' });
      // Send notification
      if (newTask.assigned_to && newTask.assigned_to !== user.id) {
        await supabase.from('notifications').insert({ user_id: newTask.assigned_to, type: 'task', title: 'New Task Assigned', message: `You've been assigned: ${newTask.title}` });
      }
    }
  };

  const updateStatus = async (taskId: string, status: string) => {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const saveEdit = async () => {
    if (!editTask) return;
    const { error } = await supabase.from('tasks').update({
      title: editTask.title, description: editTask.description,
      assigned_to: editTask.assigned_to || null, due_date: editTask.due_date || null, status: editTask.status,
    }).eq('id', editTask.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Task updated' }); setEditOpen(false); setEditTask(null); }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Task deleted' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage and track tasks (real-time)</p>
        </div>
        {role === 'admin' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Task</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                <Textarea placeholder="Description" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
                <Select value={newTask.assigned_to} onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                  <SelectContent>{profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                <Button onClick={createTask} className="w-full">Create Task</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Task Detail View */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Task Details</DialogTitle></DialogHeader>
          {selectedTask && (
            <div className="space-y-4 mt-2">
              <div>
                <h3 className="text-lg font-bold">{selectedTask.title}</h3>
                <Badge variant={selectedTask.status === 'done' ? 'secondary' : selectedTask.status === 'in_progress' ? 'default' : 'outline'} className="mt-1">
                  {selectedTask.status === 'todo' ? 'To Do' : selectedTask.status === 'in_progress' ? 'In Progress' : 'Done'}
                </Badge>
              </div>
              {selectedTask.description && <p className="text-sm text-muted-foreground">{selectedTask.description}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>Assigned to: <strong>{selectedTask._assignee}</strong></span></div>
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>Created by: <strong>{selectedTask._creator}</strong></span></div>
                {selectedTask.due_date && <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><span>Due: <strong>{format(new Date(selectedTask.due_date), 'MMM d, yyyy')}</strong></span></div>}
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><span>Created: {format(new Date(selectedTask.created_at), 'MMM d, yyyy')}</span></div>
              </div>
              <div className="flex gap-2">
                <Select value={selectedTask.status} onValueChange={(v) => { updateStatus(selectedTask.id, v); setSelectedTask({ ...selectedTask, status: v }); }}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
                {(role === 'admin') && (
                  <Button variant="outline" onClick={() => { setEditTask({ ...selectedTask }); setViewOpen(false); setEditOpen(true); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <div className="space-y-4 mt-2">
              <Input placeholder="Task title" value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} />
              <Textarea placeholder="Description" value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} />
              <div className="space-y-1">
                <Label>Assign to</Label>
                <Select value={editTask.assigned_to || ''} onValueChange={v => setEditTask({ ...editTask, assigned_to: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editTask.status} onValueChange={v => setEditTask({ ...editTask, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input type="date" value={editTask.due_date || ''} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })} />
              <Button onClick={saveEdit} className="w-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{col.label}</h3>
                <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
              </div>
              <div className={`rounded-lg p-3 min-h-[200px] space-y-3 ${col.color}`}>
                {colTasks.map((task) => (
                  <Card key={task.id} className="border-border/50 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedTask(task); setViewOpen(true); }}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-sm">{task.title}</p>
                        {role === 'admin' && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{task._assignee}</span>
                        {task.due_date && <span className="text-[10px] text-muted-foreground">{format(new Date(task.due_date), 'MMM d')}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {colTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
