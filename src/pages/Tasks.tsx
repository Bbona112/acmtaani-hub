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
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, CalendarDays, User, CheckCircle2, XCircle, Clock, Flag } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'bg-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-primary/10' },
  { id: 'done', label: 'Done', color: 'bg-[hsl(var(--success))]/10' },
];

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30',
  low: 'bg-muted text-muted-foreground border-border',
};

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
  const [newTask, setNewTask] = useState({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' });

  const loadTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (data) {
      // Use directory view (only safe fields) — no RLS leak
      const { data: profs } = await (supabase as any).from('directory_profiles').select('user_id, full_name');
      const profMap: Record<string, string> = {};
      profs?.forEach((p: any) => { profMap[p.user_id] = p.full_name; });
      setTasks(data.map(t => ({ ...t, _assignee: profMap[t.assigned_to] || 'Unassigned', _creator: profMap[t.created_by] || 'Unknown' })));
    }
  };

  const loadProfiles = async () => {
    const { data } = await (supabase as any).from('directory_profiles').select('user_id, full_name').order('full_name');
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
      assigned_to: newTask.assigned_to || null, created_by: user.id,
      due_date: newTask.due_date || null, priority: newTask.priority,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Task created' });
      setDialogOpen(false);
      setNewTask({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' });
      // Notification — only admins can insert for other users now
      if (newTask.assigned_to && newTask.assigned_to !== user.id && role === 'admin') {
        await supabase.from('notifications').insert({ user_id: newTask.assigned_to, type: 'task', title: 'New Task Assigned', message: `You've been assigned: ${newTask.title}` });
      }
    }
  };

  const updateStatus = async (taskId: string, status: string) => {
    const updates: any = { status };
    // Reset approval to pending when re-marking as done; cleared if moving away
    if (status === 'done') updates.approval_status = 'pending';
    else { updates.approval_status = 'pending'; updates.approved_by = null; updates.approved_at = null; }
    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const updateProgress = async (taskId: string, progress: number) => {
    const { error } = await supabase.from('tasks').update({ progress }).eq('id', taskId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const approveTask = async (taskId: string, approve: boolean) => {
    if (!user) return;
    const { error } = await supabase.from('tasks').update({
      approval_status: approve ? 'approved' : 'rejected',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      ...(approve ? {} : { status: 'in_progress' }),
    }).eq('id', taskId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: approve ? 'Task approved' : 'Task sent back' });
  };

  const saveEdit = async () => {
    if (!editTask) return;
    const { error } = await supabase.from('tasks').update({
      title: editTask.title, description: editTask.description,
      assigned_to: editTask.assigned_to || null, due_date: editTask.due_date || null,
      status: editTask.status, priority: editTask.priority, progress: editTask.progress,
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

  const dueLabel = (date: string) => {
    const d = new Date(date);
    if (isToday(d)) return { text: 'Due today', cls: 'text-[hsl(var(--warning))]' };
    if (isPast(d)) return { text: `Overdue · ${format(d, 'MMM d')}`, cls: 'text-destructive' };
    return { text: format(d, 'MMM d'), cls: 'text-muted-foreground' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage tasks with deadlines, progress, and approval</p>
        </div>
        {role === 'admin' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Task</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                <Textarea placeholder="Description" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Assignee</Label>
                    <Select value={newTask.assigned_to} onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}>
                      <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                      <SelectContent>{profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Deadline</Label>
                  <Input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                </div>
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
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={selectedTask.status === 'done' ? 'secondary' : selectedTask.status === 'in_progress' ? 'default' : 'outline'}>
                    {selectedTask.status === 'todo' ? 'To Do' : selectedTask.status === 'in_progress' ? 'In Progress' : 'Done'}
                  </Badge>
                  <Badge variant="outline" className={PRIORITY_STYLES[selectedTask.priority || 'medium']}>
                    <Flag className="h-3 w-3 mr-1" />{selectedTask.priority || 'medium'}
                  </Badge>
                  {selectedTask.status === 'done' && (
                    selectedTask.approval_status === 'approved' ? (
                      <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>
                    ) : selectedTask.approval_status === 'rejected' ? (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
                    ) : (
                      <Badge variant="outline" className="border-[hsl(var(--warning))] text-[hsl(var(--warning))]"><Clock className="h-3 w-3 mr-1" />Awaiting approval</Badge>
                    )
                  )}
                </div>
              </div>
              {selectedTask.description && <p className="text-sm text-muted-foreground">{selectedTask.description}</p>}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <Label>Progress</Label>
                  <span className="text-muted-foreground">{selectedTask.progress || 0}%</span>
                </div>
                <Progress value={selectedTask.progress || 0} />
                {(role === 'admin' || selectedTask.assigned_to === user?.id) && selectedTask.status !== 'done' && (
                  <Slider
                    value={[selectedTask.progress || 0]} max={100} step={5}
                    onValueChange={(v) => setSelectedTask({ ...selectedTask, progress: v[0] })}
                    onValueCommit={(v) => updateProgress(selectedTask.id, v[0])}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>Assigned: <strong>{selectedTask._assignee}</strong></span></div>
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>Created: <strong>{selectedTask._creator}</strong></span></div>
                {selectedTask.due_date && <div className="flex items-center gap-2 col-span-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><span>Deadline: <strong className={dueLabel(selectedTask.due_date).cls}>{format(new Date(selectedTask.due_date), 'MMM d, yyyy')}</strong></span></div>}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Select value={selectedTask.status} onValueChange={(v) => { updateStatus(selectedTask.id, v); setSelectedTask({ ...selectedTask, status: v, approval_status: 'pending' }); }}>
                  <SelectTrigger className="flex-1 min-w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
                {role === 'admin' && (
                  <Button variant="outline" onClick={() => { setEditTask({ ...selectedTask }); setViewOpen(false); setEditOpen(true); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                )}
              </div>

              {/* Admin approval controls */}
              {role === 'admin' && selectedTask.status === 'done' && selectedTask.approval_status !== 'approved' && (
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-sm font-medium">Admin approval</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]" onClick={() => { approveTask(selectedTask.id, true); setSelectedTask({ ...selectedTask, approval_status: 'approved' }); }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1" onClick={() => { approveTask(selectedTask.id, false); setSelectedTask({ ...selectedTask, approval_status: 'rejected', status: 'in_progress' }); }}>
                      <XCircle className="h-4 w-4 mr-1" /> Send back
                    </Button>
                  </div>
                </div>
              )}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Assignee</Label>
                  <Select value={editTask.assigned_to || ''} onValueChange={v => setEditTask({ ...editTask, assigned_to: v })}>
                    <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                    <SelectContent>{profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select value={editTask.priority || 'medium'} onValueChange={v => setEditTask({ ...editTask, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="space-y-1">
                <Label>Progress: {editTask.progress || 0}%</Label>
                <Slider value={[editTask.progress || 0]} max={100} step={5} onValueChange={v => setEditTask({ ...editTask, progress: v[0] })} />
              </div>
              <div className="space-y-1">
                <Label>Deadline</Label>
                <Input type="date" value={editTask.due_date || ''} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })} />
              </div>
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
                {col.id === 'done' && colTasks.some(t => t.approval_status === 'pending') && (
                  <Badge variant="outline" className="text-[10px] border-[hsl(var(--warning))] text-[hsl(var(--warning))]">
                    {colTasks.filter(t => t.approval_status === 'pending').length} need approval
                  </Badge>
                )}
              </div>
              <div className={`rounded-lg p-3 min-h-[200px] space-y-3 ${col.color}`}>
                {colTasks.map((task) => {
                  const due = task.due_date ? dueLabel(task.due_date) : null;
                  const needsApproval = task.status === 'done' && task.approval_status === 'pending';
                  return (
                    <Card key={task.id} className="border-border/50 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedTask(task); setViewOpen(true); }}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm flex-1">{task.title}</p>
                          {role === 'admin' && (
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}><Trash2 className="h-3 w-3" /></Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className={`${PRIORITY_STYLES[task.priority || 'medium']} text-[10px] h-4 px-1.5`}>
                            {task.priority || 'medium'}
                          </Badge>
                          {needsApproval && <Badge variant="outline" className="border-[hsl(var(--warning))] text-[hsl(var(--warning))] text-[10px] h-4 px-1.5"><Clock className="h-2.5 w-2.5 mr-0.5" />Approval</Badge>}
                          {task.status === 'done' && task.approval_status === 'approved' && <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] text-[10px] h-4 px-1.5"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Approved</Badge>}
                        </div>
                        {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                        {task.status !== 'todo' && <Progress value={task.progress || 0} className="h-1" />}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground truncate">{task._assignee}</span>
                          {due && <span className={`text-[10px] ${due.cls}`}>{due.text}</span>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {colTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
