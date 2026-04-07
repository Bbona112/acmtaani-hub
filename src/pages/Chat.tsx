import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  channel: string;
  created_at: string;
}

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(p => { map[p.user_id] = p.full_name; });
      setProfiles(map);
    }
  };

  const loadMessages = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', 'general')
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) setMessages(data);
  };

  useEffect(() => {
    loadProfiles();
    loadMessages();

    const channel = supabase
      .channel('chat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        setMessages(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;
    setSending(true);
    const { error } = await supabase.from('chat_messages').insert({
      sender_id: user.id,
      content: newMessage.trim(),
      channel: 'general',
    });
    if (!error) setNewMessage('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div>
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-muted-foreground mt-1">Team communication — General channel</p>
      </div>

      <Card className="border-border/50 flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> General
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 pb-4">
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            <div className="space-y-4 py-2">
              {messages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                const senderName = profiles[msg.sender_id] || 'Unknown';
                const initials = senderName
                  .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className={`max-w-[70%] ${isMe ? 'text-right' : ''}`}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-medium">{senderName}</span>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), 'h:mm a')}</span>
                      </div>
                      <div className={`inline-block rounded-lg px-3 py-2 text-sm ${
                        isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <p className="text-center text-muted-foreground py-12">No messages yet. Start the conversation!</p>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2 mt-3 pt-3 border-t border-border">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={sending || !newMessage.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
