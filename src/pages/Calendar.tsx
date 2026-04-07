import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, CalendarDays, MapPin, Clock } from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, isToday, isBefore } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
  created_by: string | null;
}

export default function Calendar() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '', description: '', start_time: '', end_time: '', location: '',
  });

  const loadEvents = async () => {
    const start = startOfMonth(currentMonth).toISOString();
    const end = endOfMonth(currentMonth).toISOString();
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time');
    if (data) setEvents(data);
  };

  useEffect(() => {
    loadEvents();

    const channel = supabase
      .channel('calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => loadEvents())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentMonth]);

  const createEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.start_time || !newEvent.end_time || !user) return;
    const { error } = await supabase.from('calendar_events').insert({
      ...newEvent,
      created_by: user.id,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Event created' });
      setAddOpen(false);
      setNewEvent({ title: '', description: '', start_time: '', end_time: '', location: '' });
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const getEventsForDay = (day: Date) => events.filter(e => isSameDay(new Date(e.start_time), day));
  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1">Program activities and events</p>
        </div>
        {role === 'admin' && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Event</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Event</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Event title" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
                <Textarea placeholder="Description & details" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={newEvent.start_time} onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>End</Label>
                    <Input type="datetime-local" value={newEvent.end_time} onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })} />
                  </div>
                </div>
                <Input placeholder="Location" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} />
                <Button onClick={createEvent} className="w-full">Create Event</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Calendar grid */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>←</Button>
            <CardTitle className="text-lg">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>→</Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {calDays.map((day) => {
                const dayEvents = getEventsForDay(day);
                const inMonth = day.getMonth() === currentMonth.getMonth();
                const selected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`p-2 rounded-lg text-sm min-h-[60px] flex flex-col items-center transition-colors
                      ${!inMonth ? 'text-muted-foreground/40' : ''}
                      ${isToday(day) ? 'bg-primary/10 font-bold' : ''}
                      ${selected ? 'ring-2 ring-primary' : 'hover:bg-muted'}
                    `}
                  >
                    <span>{format(day, 'd')}</span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-1">
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected day events */}
        <Card className="border-border/50 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a date'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDate && selectedEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No events on this day</p>
            )}
            {selectedEvents.map((event) => (
              <Card key={event.id} className="border-border/50">
                <CardContent className="p-4 space-y-2">
                  <p className="font-semibold">{event.title}</p>
                  {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {format(new Date(event.start_time), 'h:mm a')} — {format(new Date(event.end_time), 'h:mm a')}
                    </Badge>
                    {event.location && (
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" /> {event.location}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!selectedDate && (
              <p className="text-sm text-muted-foreground text-center py-6">Click on a date to see events</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
