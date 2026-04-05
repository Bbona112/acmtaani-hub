import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, GripVertical } from 'lucide-react';

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
  const [newTask, setNewTask] = useState({ title: '', description: '', assigned_to: '', due_date: '' });

  const loadTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (data) setTasks(data);
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name').order('full_name');
    if (data) setProfiles(data);
  };

  useEffect(() => {
    loadTasks();
    if (role === 'admin') loadProfiles();
  }, [user, role]);

  const createTask = async () => {
    if (!newTask.title.trim() || !user) return;
    const { error } = await supabase.from('tasks').insert({
      title: newTask.title,
      description: newTask.description,
      assigned_to: newTask.assigned_to || null,
      created_by: user.id,
      due_date: newTask.due_date || null,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Task created' });
      setDialogOpen(false);
      setNewTask({ title: '', description: '', assigned_to: '', due_date: '' });
      loadTasks();
    }
  };

  const updateStatus = async (taskId: string, status: string) => {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else loadTasks();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage and track tasks</p>
        </div>
        {role === 'admin' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                <Textarea placeholder="Description" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
                <Select value={newTask.assigned_to} onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                <Button onClick={createTask} className="w-full">Create Task</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

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
                  <Card key={task.id} className="border-border/50 shadow-sm">
                    <CardContent className="p-4 space-y-2">
                      <p className="font-medium text-sm">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {(task as any).profiles?.full_name || 'Unassigned'}
                        </span>
                        {task.status !== 'done' && (
                          <Select value={task.status} onValueChange={(v) => updateStatus(task.id, v)}>
                            <SelectTrigger className="h-7 w-auto text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">To Do</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {colTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
