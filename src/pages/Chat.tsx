import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, MessageCircle, Users, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface ChatMessage {
  id: string; sender_id: string; content: string; channel: string; created_at: string;
}
interface DM {
  id: string; sender_id: string; recipient_id: string; content: string; read: boolean; created_at: string;
}

export default function Chat() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'general' | 'dm'>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<DM[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [profileList, setProfileList] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedDmUser, setSelectedDmUser] = useState<string | null>(null);
  const [dmConversations, setDmConversations] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('user_id, full_name, avatar_url');
    if (data) {
      const map: Record<string, any> = {};
      data.forEach(p => { map[p.user_id] = p; });
      setProfiles(map);
      setProfileList(data.filter(p => p.user_id !== user?.id));
    }
  };

  const loadMessages = async () => {
    const { data } = await supabase.from('chat_messages').select('*').eq('channel', 'general').order('created_at', { ascending: true }).limit(200);
    if (data) setMessages(data);
  };

  const loadDMs = async () => {
    if (!user) return;
    const { data } = await supabase.from('direct_messages').select('*').order('created_at', { ascending: true });
    if (data) {
      setDmMessages(data);
      const users = new Set<string>();
      data.forEach(m => { users.add(m.sender_id === user.id ? m.recipient_id : m.sender_id); });
      setDmConversations(Array.from(users));
    }
  };

  useEffect(() => {
    loadProfiles();
    loadMessages();
    loadDMs();
    const ch1 = supabase.channel('chat-general-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (p) => {
      setMessages(prev => [...prev, p.new as ChatMessage]);
    }).subscribe();
    const ch2 = supabase.channel('dm-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => loadDMs()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [user]);

  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [messages, dmMessages, selectedDmUser]);

  const sendGeneralMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;
    setSending(true);
    await supabase.from('chat_messages').insert({ sender_id: user.id, content: newMessage.trim(), channel: 'general' });
    setNewMessage(''); setSending(false);
  };

  const sendDM = async () => {
    if (!newMessage.trim() || !user || !selectedDmUser || sending) return;
    setSending(true);
    await supabase.from('direct_messages').insert({ sender_id: user.id, recipient_id: selectedDmUser, content: newMessage.trim() });
    setNewMessage(''); setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tab === 'general' ? sendGeneralMessage() : sendDM(); }
  };

  const selectedDmMessages = dmMessages.filter(m =>
    (m.sender_id === user?.id && m.recipient_id === selectedDmUser) ||
    (m.sender_id === selectedDmUser && m.recipient_id === user?.id)
  );

  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const unreadByUser = (uid: string) => dmMessages.filter(m => m.sender_id === uid && m.recipient_id === user?.id && !m.read).length;

  const startDM = (uid: string) => {
    setSelectedDmUser(uid);
    setTab('dm');
    if (!dmConversations.includes(uid)) setDmConversations(prev => [...prev, uid]);
    // Mark as read
    supabase.from('direct_messages').update({ read: true }).eq('sender_id', uid).eq('recipient_id', user?.id ?? '').eq('read', false).then();
  };

  const renderMessages = (msgs: any[], isDm = false) => (
    <div className="space-y-4 py-2">
      {msgs.map(msg => {
        const senderId = msg.sender_id;
        const isMe = senderId === user?.id;
        const sender = profiles[senderId];
        const name = sender?.full_name || 'Unknown';
        return (
          <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
            <Avatar className="h-8 w-8 shrink-0">
              {sender?.avatar_url && <AvatarImage src={sender.avatar_url} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div className={`max-w-[70%] ${isMe ? 'text-right' : ''}`}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-medium">{name}</span>
                <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), 'h:mm a')}</span>
              </div>
              <div className={`inline-block rounded-lg px-3 py-2 text-sm ${isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{msg.content}</div>
            </div>
          </div>
        );
      })}
      {msgs.length === 0 && <p className="text-center text-muted-foreground py-12">{isDm ? 'Start a conversation' : 'No messages yet. Start the conversation!'}</p>}
    </div>
  );

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div>
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-muted-foreground mt-1">Team & direct messaging</p>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Sidebar */}
        <div className="w-56 shrink-0 space-y-2">
          <Button variant={tab === 'general' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => { setTab('general'); setSelectedDmUser(null); }}>
            <Hash className="h-4 w-4 mr-2" /> General
          </Button>
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Direct Messages</p>
            {profileList.map(p => {
              const unread = unreadByUser(p.user_id);
              return (
                <Button key={p.user_id} variant={selectedDmUser === p.user_id ? 'secondary' : 'ghost'} className="w-full justify-start text-sm h-8" onClick={() => startDM(p.user_id)}>
                  <span className="truncate">{p.full_name}</span>
                  {unread > 0 && <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1">{unread}</Badge>}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <Card className="border-border/50 flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              {tab === 'general' ? <><MessageCircle className="h-5 w-5" /> General</> : <><Users className="h-5 w-5" /> {profiles[selectedDmUser ?? '']?.full_name || 'Select a user'}</>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 pb-4">
            <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
              {tab === 'general' ? renderMessages(messages) : renderMessages(selectedDmMessages, true)}
            </ScrollArea>
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <Input placeholder="Type a message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} className="flex-1" />
              <Button onClick={tab === 'general' ? sendGeneralMessage : sendDM} disabled={sending || !newMessage.trim() || (tab === 'dm' && !selectedDmUser)} size="icon"><Send className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
